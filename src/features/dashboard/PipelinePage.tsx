import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadRepoSnapshot, type RepoSnapshot } from './github';
import { buildPipeline, groupByStage, STAGE_META, STAGES, type PipelineCard } from './pipeline';
import { repoSlug, repoUrl } from '../../config';

const REFRESH_MS = 20_000;
const TOKEN_KEY = 'nimbus.dashboard.token';

function timeAgo(iso: string | Date): string {
  const then = typeof iso === 'string' ? new Date(iso) : iso;
  const seconds = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function runTone(run: { status: string; conclusion: string | null }): string {
  if (run.status !== 'completed') return 'running';
  if (run.conclusion === 'success') return 'success';
  if (run.conclusion === 'cancelled' || run.conclusion === 'skipped') return 'muted';
  return 'failure';
}

export function PipelinePage() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [tokenDraft, setTokenDraft] = useState(token);
  const [snapshot, setSnapshot] = useState<RepoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await loadRepoSnapshot(token || undefined));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    timer.current = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [autoRefresh, refresh]);

  const deployedShas = useMemo(
    () => new Set((snapshot?.deployments ?? []).map((deployment) => deployment.sha)),
    [snapshot],
  );

  const cards = useMemo(
    () => (snapshot ? buildPipeline(snapshot.issues, snapshot.pulls, deployedShas) : []),
    [snapshot, deployedShas],
  );

  const grouped = useMemo(() => groupByStage(cards), [cards]);

  const laneCounts = useMemo(() => {
    let auto = 0;
    let gate = 0;
    for (const card of cards) {
      if (card.lane === 'auto') auto += 1;
      if (card.lane === 'human-gate') gate += 1;
    }
    return { auto, gate };
  }, [cards]);

  const rateLimited = snapshot?.rateLimit.remaining === 0;

  return (
    <div className="pipeline">
      <section className="pipeline__head">
        <div>
          <p className="pipeline__eyebrow">Live from the GitHub API</p>
          <h1 className="pipeline__title">SDLC control tower</h1>
          <p className="pipeline__lede">
            Every card below is a real issue in{' '}
            <a href={repoUrl} target="_blank" rel="noreferrer">
              {repoSlug}
            </a>
            . Cards move left to right as agents triage, fix, review and ship them.
          </p>
        </div>

        <div className="pipeline__controls">
          <div className="statline">
            <span className={`dot dot--${loading ? 'running' : 'success'}`} aria-hidden="true" />
            <span>
              {loading
                ? 'Refreshing…'
                : snapshot
                  ? `Updated ${timeAgo(snapshot.fetchedAt)}`
                  : 'Not loaded'}
            </span>
          </div>

          <label className="toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            <span>Auto-refresh</span>
          </label>

          <button type="button" className="button button--small" onClick={() => void refresh()}>
            Refresh now
          </button>
        </div>
      </section>

      <section className="lanes" aria-label="Lane summary">
        <article className="lane lane--auto">
          <h2 className="lane__title">
            <span className="emoji">🟢</span>Automated lane
          </h2>
          <p className="lane__count">{laneCounts.auto}</p>
          <p className="lane__desc">
            <strong>risk/low</strong> — no code owner on the touched paths, so GitHub requires zero
            approvals. Agent fixes, CI passes, auto-merge ships it to production.
          </p>
        </article>
        <article className="lane lane--gate">
          <h2 className="lane__title">
            <span className="emoji">🛑</span>Human gate
          </h2>
          <p className="lane__count">{laneCounts.gate}</p>
          <p className="lane__desc">
            <strong>risk/medium</strong> and <strong>risk/high</strong> — auth, API, IaC and the
            pipeline itself have code owners. The branch ruleset blocks the merge until a human
            approves.
          </p>
        </article>
      </section>

      {rateLimited && (
        <div className="notice notice--warn">
          <strong>GitHub API rate limit reached.</strong> Unauthenticated requests are capped at 60
          per hour. Paste a read-only token below to keep the board live
          {snapshot?.rateLimit.resetAt
            ? ` (resets ${snapshot.rateLimit.resetAt.toLocaleTimeString()})`
            : ''}
          .
        </div>
      )}

      <details className="tokenbox">
        <summary>
          API budget:{' '}
          <strong>
            {snapshot?.rateLimit.remaining ?? '—'}/{snapshot?.rateLimit.limit ?? '—'}
          </strong>{' '}
          requests remaining {token ? '(authenticated)' : '(anonymous)'}
        </summary>
        <p className="tokenbox__hint">
          Optional. A token with <code>public_repo</code> read access raises the limit to 5,000/hour.
          It is stored only in this browser&apos;s local storage and is never sent anywhere except
          api.github.com.
        </p>
        <div className="tokenbox__row">
          <input
            type="password"
            className="input"
            placeholder="ghp_… (optional)"
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
            aria-label="GitHub token"
          />
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              localStorage.setItem(TOKEN_KEY, tokenDraft);
              setToken(tokenDraft);
            }}
          >
            Use token
          </button>
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              localStorage.removeItem(TOKEN_KEY);
              setTokenDraft('');
              setToken('');
            }}
          >
            Clear
          </button>
        </div>
      </details>

      <section className="board" aria-label="Pipeline board">
        {STAGES.map((stage) => (
          <div className="column" key={stage}>
            <header className="column__head">
              <span className="column__icon" aria-hidden="true">
                {STAGE_META[stage].icon}
              </span>
              <div>
                <h2 className="column__title">{STAGE_META[stage].title}</h2>
                <p className="column__blurb">{STAGE_META[stage].blurb}</p>
              </div>
              <span className="column__count">{grouped[stage].length}</span>
            </header>
            <div className="column__body">
              {grouped[stage].length === 0 ? (
                <p className="column__empty">—</p>
              ) : (
                grouped[stage].map((card) => <IssueCard key={card.key} card={card} />)
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="runs" aria-label="Recent workflow runs">
        <h2 className="runs__title">Recent workflow runs</h2>
        {(snapshot?.runs ?? []).length === 0 ? (
          <p className="column__empty">No runs yet.</p>
        ) : (
          <ul className="runs__list">
            {(snapshot?.runs ?? []).slice(0, 10).map((run) => (
              <li className="runs__item" key={run.id}>
                <span className={`dot dot--${runTone(run)}`} aria-hidden="true" />
                <a href={run.html_url} target="_blank" rel="noreferrer" className="runs__name">
                  {run.name ?? run.display_title}
                </a>
                <span className="runs__meta">
                  {run.event} · {run.head_branch ?? '—'} · {timeAgo(run.updated_at)}
                </span>
                <span className={`chip chip--${runTone(run)}`}>
                  {run.status === 'completed' ? (run.conclusion ?? 'done') : run.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {snapshot && snapshot.errors.length > 0 && (
        <div className="notice notice--warn">
          Some data could not be loaded: {snapshot.errors.join('; ')}
        </div>
      )}
    </div>
  );
}

function IssueCard({ card }: { card: PipelineCard }) {
  return (
    <article className={`issue issue--${card.risk ?? 'unknown'}`}>
      <a className="issue__title" href={card.url} target="_blank" rel="noreferrer">
        #{card.issueNumber} {card.title}
      </a>
      <div className="issue__tags">
        {card.priority && <span className={`tag tag--${card.priority}`}>{card.priority}</span>}
        {card.risk && <span className={`tag tag--risk-${card.risk}`}>risk/{card.risk}</span>}
        {card.area && <span className="tag tag--area">{card.area}</span>}
        {!card.triaged && <span className="tag tag--pending">awaiting triage</span>}
      </div>
      {card.lane && (
        <p className={`issue__lane issue__lane--${card.lane}`}>
          <span className="emoji">{card.lane === 'auto' ? '🟢' : '🛑'}</span>
          {card.lane === 'auto' ? 'ships automatically' : 'needs a code owner'}
        </p>
      )}
      {card.assignees.length > 0 && (
        <p className="issue__meta">👤 {card.assignees.join(', ')}</p>
      )}
      {card.pull && (
        <a className="issue__pr" href={card.pull.html_url} target="_blank" rel="noreferrer">
          PR #{card.pull.number}
          {card.pull.draft ? ' · draft' : ''}
          {card.autoMerge ? ' · auto-merge armed' : ''}
        </a>
      )}
      <p className="issue__meta issue__meta--dim">updated {timeAgo(card.updatedAt)}</p>
    </article>
  );
}
