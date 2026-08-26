import { describe, expect, it } from 'vitest';
import type { GhIssue, GhLabel, GhPull } from '../../src/features/dashboard/github';
import { hasLabel, labelValue } from '../../src/features/dashboard/github';
import { buildPipeline, groupByStage, stageFor, STAGES } from '../../src/features/dashboard/pipeline';
import { refreshIntervalMs } from '../../src/features/dashboard/refresh';

const label = (name: string): GhLabel => ({ name, color: 'ededed', description: null });

function makeIssue(overrides: Partial<GhIssue> = {}): GhIssue {
  return {
    number: 1,
    title: 'Cart badge shows the wrong number of items',
    state: 'open',
    html_url: 'https://github.com/o/r/issues/1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    labels: [],
    assignees: [],
    user: null,
    body: null,
    ...overrides,
  };
}

function makePull(overrides: Partial<GhPull> = {}): GhPull {
  return {
    number: 42,
    title: 'Fix cart badge count',
    state: 'open',
    html_url: 'https://github.com/o/r/pull/42',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    merged_at: null,
    draft: false,
    labels: [],
    user: null,
    head: { ref: 'copilot/fix-1', sha: 'abc123' },
    base: { ref: 'main' },
    auto_merge: null,
    body: null,
    ...overrides,
  };
}

const NO_DEPLOYS = new Set<string>();

describe('label helpers', () => {
  it('reads the value out of a prefixed label', () => {
    const labels = [label('priority/P0'), label('risk/high'), label('area/auth')];
    expect(labelValue(labels, 'priority')).toBe('P0');
    expect(labelValue(labels, 'risk')).toBe('high');
    expect(labelValue(labels, 'area')).toBe('auth');
    expect(labelValue(labels, 'missing')).toBeNull();
  });

  it('detects exact labels', () => {
    expect(hasLabel([label('agent/triaged')], 'agent/triaged')).toBe(true);
    expect(hasLabel([label('agent/triaged')], 'demo')).toBe(false);
  });
});

describe('stageFor', () => {
  it('starts an untouched issue in "filed"', () => {
    expect(stageFor(makeIssue(), null, NO_DEPLOYS)).toBe('filed');
  });

  it('moves to "triaged" once a risk label lands', () => {
    const issue = makeIssue({ labels: [label('risk/low'), label('priority/P3')] });
    expect(stageFor(issue, null, NO_DEPLOYS)).toBe('triaged');
  });

  it('moves to "agent" once Copilot is assigned', () => {
    const issue = makeIssue({
      labels: [label('risk/low')],
      assignees: [{ login: 'Copilot', avatar_url: '', type: 'Bot' }],
    });
    expect(stageFor(issue, null, NO_DEPLOYS)).toBe('agent');
  });

  it('puts a low-risk pull request in "review"', () => {
    const issue = makeIssue({ labels: [label('risk/low')] });
    expect(stageFor(issue, makePull(), NO_DEPLOYS)).toBe('review');
  });

  it('puts a high-risk pull request in "gate"', () => {
    const issue = makeIssue({ labels: [label('risk/high')] });
    expect(stageFor(issue, makePull(), NO_DEPLOYS)).toBe('gate');
  });

  it('respects an explicit needs-human-review label on the pull request', () => {
    const issue = makeIssue({ labels: [label('risk/low')] });
    const pull = makePull({ labels: [label('needs-human-review')] });
    expect(stageFor(issue, pull, NO_DEPLOYS)).toBe('gate');
  });

  it('moves to "merged" once the pull request lands', () => {
    const issue = makeIssue({ labels: [label('risk/low')] });
    const pull = makePull({ merged_at: '2024-01-02T00:00:00Z' });
    expect(stageFor(issue, pull, NO_DEPLOYS)).toBe('merged');
  });

  it('moves to "deployed" once the merged sha has a deployment', () => {
    const issue = makeIssue({ labels: [label('risk/low')] });
    const pull = makePull({ merged_at: '2024-01-02T00:00:00Z' });
    expect(stageFor(issue, pull, new Set(['abc123']))).toBe('deployed');
  });
});

describe('buildPipeline', () => {
  it('links an issue to the pull request that references it', () => {
    const issue = makeIssue({ number: 7, labels: [label('risk/low')] });
    const pull = makePull({ title: 'Fix badge (closes #7)', head: { ref: 'fix-badge', sha: 'z' } });
    const [card] = buildPipeline([issue], [pull], NO_DEPLOYS);
    expect(card.pull?.number).toBe(42);
    expect(card.lane).toBe('auto');
  });

  /**
   * This is the shape the Copilot coding agent actually produces, and getting
   * it wrong silently deleted shipped cards from the board: the title
   * describes the fix, the branch describes the fix, and the issue number
   * appears only in the body.
   */
  it('links via "Closes #N" in the body when nothing else mentions the issue', () => {
    const issue = makeIssue({ number: 24, labels: [label('risk/low')] });
    const pull = makePull({
      title: 'Fix cart badge to count units instead of product lines',
      head: { ref: 'copilot/fix-cart-badge-count', sha: 'z' },
      body: 'The badge summed lines rather than quantities.\n\nCloses #24',
    });
    const [card] = buildPipeline([issue], [pull], NO_DEPLOYS);
    expect(card.pull?.number).toBe(42);
  });

  it('keeps a shipped issue on the board instead of treating it as abandoned', () => {
    const issue = makeIssue({ number: 24, state: 'closed', labels: [label('risk/low')] });
    const pull = makePull({
      title: 'Fix cart badge to count units instead of product lines',
      head: { ref: 'copilot/fix-cart-badge-count', sha: 'z' },
      body: 'Closes #24',
      merged_at: '2024-01-02T00:00:00Z',
      state: 'closed',
    });
    const cards = buildPipeline([issue], [pull], NO_DEPLOYS);
    expect(cards).toHaveLength(1);
    expect(cards[0].stage).toBe('deployed');
  });

  it('prefers an explicit closing keyword over a passing mention', () => {
    const issue = makeIssue({ number: 5, labels: [label('risk/low')] });
    const mentions = makePull({ number: 90, body: 'Related to #5, but not a fix.' });
    const closes = makePull({ number: 91, body: 'Fixes #5' });
    const [card] = buildPipeline([issue], [mentions, closes], NO_DEPLOYS);
    expect(card.pull?.number).toBe(91);
  });

  it('surfaces priority, risk and area on the card', () => {
    const issue = makeIssue({
      labels: [label('priority/P0'), label('risk/high'), label('area/auth')],
    });
    const [card] = buildPipeline([issue], [], NO_DEPLOYS);
    expect(card.priority).toBe('P0');
    expect(card.risk).toBe('high');
    expect(card.area).toBe('auth');
    expect(card.lane).toBe('human-gate');
    expect(card.triaged).toBe(true);
  });

  it('ignores label values outside the known vocabulary', () => {
    const issue = makeIssue({ labels: [label('priority/urgent'), label('risk/spicy')] });
    const [card] = buildPipeline([issue], [], NO_DEPLOYS);
    expect(card.priority).toBeNull();
    expect(card.risk).toBeNull();
    expect(card.lane).toBeNull();
  });
});

describe('groupByStage', () => {
  it('creates a bucket for every stage even when empty', () => {
    const grouped = groupByStage([]);
    expect(Object.keys(grouped).sort()).toEqual([...STAGES].sort());
    for (const stage of STAGES) {
      expect(grouped[stage]).toEqual([]);
    }
  });

  it('places each card in its own stage', () => {
    const cards = buildPipeline(
      [
        makeIssue({ number: 1 }),
        makeIssue({ number: 2, labels: [label('risk/low')] }),
      ],
      [],
      NO_DEPLOYS,
    );
    const grouped = groupByStage(cards);
    expect(grouped.filed).toHaveLength(1);
    expect(grouped.triaged).toHaveLength(1);
  });
});

/**
 * The board polls GitHub. Anonymous callers get 60 requests an hour and each
 * snapshot costs four, so a fixed 20-second poll exhausts the budget in about
 * four minutes — the board would go dark partway through a 60-minute demo.
 * These tests pin the back-off that prevents that.
 */
describe('refresh interval respects the API budget', () => {
  const HOUR = 3_600_000;
  const at = (remaining: number | null, msUntilReset: number) => ({
    remaining,
    resetAt: new Date(msUntilReset),
  });

  it('polls fast when a token gives us plenty of budget', () => {
    expect(refreshIntervalMs(at(5000, HOUR), 0)).toBe(20_000);
  });

  it('never polls faster than 20s even with unlimited budget', () => {
    expect(refreshIntervalMs(at(1_000_000, HOUR), 0)).toBe(20_000);
  });

  it('spreads a fresh anonymous budget across the whole window', () => {
    // 60 remaining / 4 per load = 15 loads over an hour = one every 4 minutes.
    expect(refreshIntervalMs(at(60, HOUR), 0)).toBe(HOUR / 15);
  });

  it('backs off further as the budget drains', () => {
    const early = refreshIntervalMs(at(60, HOUR), 0);
    const late = refreshIntervalMs(at(8, HOUR), 0);
    expect(late).toBeGreaterThan(early);
  });

  it('waits for the reset once the budget cannot afford another load', () => {
    // 3 remaining is less than the 4 a snapshot costs.
    expect(refreshIntervalMs(at(3, 600_000), 0)).toBe(600_000);
    expect(refreshIntervalMs(at(0, 600_000), 0)).toBe(600_000);
  });

  it('caps the back-off so the board always eventually retries', () => {
    expect(refreshIntervalMs(at(4, HOUR * 10), 0)).toBe(5 * 60_000);
  });

  it('falls back to the default when the budget is unknown', () => {
    expect(refreshIntervalMs(undefined, 0)).toBe(20_000);
    expect(refreshIntervalMs({ remaining: null, resetAt: null }, 0)).toBe(20_000);
  });

  it('an hour of anonymous polling stays inside the 60-request budget', () => {
    // Simulate the real loop: start with 60, spend 4 per poll, advance by the
    // interval the board would actually choose. It must never overdraw.
    let remaining = 60;
    let now = 0;
    let polls = 0;

    while (now < HOUR && polls < 1000) {
      const wait = refreshIntervalMs(at(remaining, HOUR), now);
      now += wait;
      if (now >= HOUR) break;
      remaining -= 4;
      polls += 1;
      expect(remaining, 'never overdraws the anonymous budget').toBeGreaterThanOrEqual(0);
    }

    expect(polls, 'still refreshes enough times to be useful').toBeGreaterThan(5);
  });
});

/**
 * `scripts/demo/reset.sh` closes demo issues as "not planned". If those issues
 * kept rendering, every demo after the first would open on a board still
 * carrying the previous run's cards — the reset would look like it had not
 * worked, in front of an audience.
 */
describe('reset actually clears the board', () => {
  it('drops an issue closed without a merged pull request', () => {
    const abandoned = makeIssue({ number: 42, state: 'closed' });
    expect(buildPipeline([abandoned], [], new Set())).toHaveLength(0);
  });

  it('drops a closed issue even when it was already triaged', () => {
    const triaged = makeIssue({
      number: 43,
      state: 'closed',
      labels: [label('demo'), label('risk/low'), label('priority/P3')],
    });
    expect(buildPipeline([triaged], [], new Set())).toHaveLength(0);
  });

  it('keeps a closed issue whose pull request actually merged', () => {
    // This is the happy path: shipped work must stay visible as `deployed`.
    const shipped = makeIssue({ number: 44, state: 'closed' });
    const pull = makePull({
      number: 90,
      title: 'Fixes #44 — correct the cart badge',
      merged_at: '2026-01-01T00:00:00Z',
    });

    const cards = buildPipeline([shipped], [pull], new Set([pull.head.sha]));
    expect(cards).toHaveLength(1);
    expect(cards[0].stage).toBe('deployed');
  });

  it('keeps open issues untouched', () => {
    const open = makeIssue({ number: 45, state: 'open' });
    expect(buildPipeline([open], [], new Set())).toHaveLength(1);
  });

  it('drops a shipped card once reset.sh archives it', () => {
    // The failure this guards: a card that shipped is closed *and* has a merged
    // pull request, so it legitimately lives in `deployed` for ever. Without
    // the archive label every past demo's successes stack up in the last
    // column and the next run opens on a board that is already full.
    const shipped = makeIssue({
      number: 46,
      state: 'closed',
      labels: [label('demo'), label('demo/archived')],
    });
    const pull = makePull({
      number: 91,
      title: 'Fixes #46 — correct the cart badge',
      merged_at: '2026-01-01T00:00:00Z',
    });

    expect(buildPipeline([shipped], [pull], new Set([pull.head.sha]))).toHaveLength(0);
  });

  it('archives an open issue too, so a mid-run reset clears the board', () => {
    // reset.sh closes before it archives, but the two calls are not atomic and
    // the board polls in between. Hiding on the label alone keeps that window
    // from flashing a stale card back into `filed`.
    const open = makeIssue({ number: 47, state: 'open', labels: [label('demo/archived')] });
    expect(buildPipeline([open], [], new Set())).toHaveLength(0);
  });
});
