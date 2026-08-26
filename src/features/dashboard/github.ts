import { apiBase } from '../../config';
import { getJson } from '../api/client';

export interface GhLabel {
  name: string;
  color: string;
  description: string | null;
}

export interface GhUser {
  login: string;
  avatar_url: string;
  type: string;
}

export interface GhIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: GhLabel[];
  assignees: GhUser[];
  user: GhUser | null;
  pull_request?: { html_url: string; merged_at: string | null };
  body: string | null;
  draft?: boolean;
}

export interface GhPull {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  draft: boolean;
  labels: GhLabel[];
  user: GhUser | null;
  head: { ref: string; sha: string };
  base: { ref: string };
  auto_merge: unknown | null;
}

export interface GhRun {
  id: number;
  name: string | null;
  display_title: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  event: string;
  head_branch: string | null;
  head_sha: string;
}

export interface GhDeployment {
  id: number;
  environment: string;
  created_at: string;
  sha: string;
}

export interface RateLimitInfo {
  remaining: number | null;
  limit: number | null;
  resetAt: Date | null;
}

export interface RepoSnapshot {
  issues: GhIssue[];
  pulls: GhPull[];
  runs: GhRun[];
  deployments: GhDeployment[];
  fetchedAt: Date;
  rateLimit: RateLimitInfo;
  errors: string[];
}

/**
 * The GitHub REST API returns rate-limit state in headers. We surface it so the
 * presenter can see when to paste a token instead of being mystified by an
 * empty board.
 */
async function readRateLimit(token?: string): Promise<RateLimitInfo> {
  try {
    const response = await fetch('https://api.github.com/rate_limit', {
      headers: token
        ? { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` }
        : { Accept: 'application/vnd.github+json' },
    });
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    const limit = Number(response.headers.get('x-ratelimit-limit'));
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    return {
      remaining: Number.isFinite(remaining) ? remaining : null,
      limit: Number.isFinite(limit) ? limit : null,
      resetAt: Number.isFinite(reset) ? new Date(reset * 1000) : null,
    };
  } catch {
    return { remaining: null, limit: null, resetAt: null };
  }
}

async function safe<T>(label: string, work: Promise<T>, errors: string[], fallback: T): Promise<T> {
  try {
    return await work;
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

/**
 * GitHub serves anonymous REST responses with `Cache-Control: max-age=60`, so
 * a browser will happily replay a minute-old snapshot. During a live demo that
 * is the difference between the board moving when the audience is watching and
 * the presenter clicking "Refresh now" to no visible effect.
 *
 * A per-load cache-buster costs nothing and makes every refresh truthful.
 */
function fresh(url: string, nonce: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}_=${nonce}`;
}

/** Fetch everything the dashboard needs in one pass. */
export async function loadRepoSnapshot(token?: string): Promise<RepoSnapshot> {
  const errors: string[] = [];
  const opts = { token };
  const nonce = Date.now();

  const [issues, pulls, runsResponse, deployments, rateLimit] = await Promise.all([
    safe(
      'issues',
      getJson<GhIssue[]>(
        fresh(`${apiBase}/issues?state=all&per_page=50&sort=created&direction=desc`, nonce),
        opts,
      ),
      errors,
      [],
    ),
    safe(
      'pulls',
      getJson<GhPull[]>(
        fresh(`${apiBase}/pulls?state=all&per_page=30&sort=created&direction=desc`, nonce),
        opts,
      ),
      errors,
      [],
    ),
    safe(
      'runs',
      getJson<{ workflow_runs: GhRun[] }>(fresh(`${apiBase}/actions/runs?per_page=20`, nonce), opts),
      errors,
      { workflow_runs: [] },
    ),
    safe(
      'deployments',
      getJson<GhDeployment[]>(fresh(`${apiBase}/deployments?per_page=5`, nonce), opts),
      errors,
      [],
    ),
    readRateLimit(token),
  ]);

  return {
    // `/issues` includes pull requests; the board wants real issues only.
    issues: issues.filter((issue) => !issue.pull_request),
    pulls,
    runs: runsResponse.workflow_runs,
    deployments,
    fetchedAt: new Date(),
    rateLimit,
    errors,
  };
}

export function labelValue(labels: readonly GhLabel[], prefix: string): string | null {
  const match = labels.find((label) => label.name.startsWith(`${prefix}/`));
  return match ? match.name.slice(prefix.length + 1) : null;
}

export function hasLabel(labels: readonly GhLabel[], name: string): boolean {
  return labels.some((label) => label.name === name);
}
