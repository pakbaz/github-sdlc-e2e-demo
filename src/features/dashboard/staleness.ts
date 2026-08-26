import type { GhDeployment } from './github';

/**
 * GitHub Pages serves `index.html` with `Cache-Control: max-age=600`, and the
 * asset filenames it points at are content-hashed. So for up to ten minutes
 * after a deploy a browser that visited earlier will keep running the *old*
 * bundle while happily fetching *new* data — the page looks alive, so nothing
 * suggests it is stale.
 *
 * That is precisely the money moment of this demo: the automated lane ships a
 * fix to production, the presenter reloads the store to show the bug is gone,
 * and the browser silently replays the buggy build. It cost me two false
 * readings while building this, and it would cost a presenter the punchline.
 *
 * We cannot set response headers on Pages, so the app detects it itself: the
 * build SHA is compiled in, the newest `github-pages` deployment SHA is already
 * in the dashboard snapshot, and any disagreement means a newer production
 * build exists than the one currently running.
 */

const PAGES_ENVIRONMENT = 'github-pages';

/** Builds outside CI have no SHA, and a dev build can never be out of date. */
export const DEV_BUILD = 'dev';

export function latestPagesDeployment(
  deployments: readonly GhDeployment[],
): GhDeployment | null {
  const pages = deployments.filter((d) => d.environment === PAGES_ENVIRONMENT);
  if (pages.length === 0) return null;

  // `/deployments` returns newest first, but sorting explicitly means a change
  // in API ordering can't quietly turn this into a downgrade prompt.
  return pages.reduce((newest, candidate) =>
    Date.parse(candidate.created_at) > Date.parse(newest.created_at) ? candidate : newest,
  );
}

/**
 * The SHA of a newer production build than the one running, or `null` when the
 * running build is current (or when we cannot know).
 */
export function staleAgainst(
  buildSha: string,
  deployments: readonly GhDeployment[],
): string | null {
  if (!buildSha || buildSha === DEV_BUILD) return null;

  const latest = latestPagesDeployment(deployments);
  if (!latest?.sha) return null;

  return latest.sha === buildSha ? null : latest.sha;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
