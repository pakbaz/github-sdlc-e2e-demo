/**
 * Single source of truth for anything that points at the demo repository.
 * Overridable at build time so the demo can be forked and re-run elsewhere.
 */
export const demoConfig = {
  owner: import.meta.env.VITE_REPO_OWNER ?? 'pakbaz',
  repo: import.meta.env.VITE_REPO_NAME ?? 'github-sdlc-e2e-demo',
} as const;

export const repoSlug = `${demoConfig.owner}/${demoConfig.repo}`;
export const repoUrl = `https://github.com/${repoSlug}`;
export const apiBase = `https://api.github.com/repos/${repoSlug}`;
