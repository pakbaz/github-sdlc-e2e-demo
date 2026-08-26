import { describe, expect, it } from 'vitest';
import {
  DEV_BUILD,
  latestPagesDeployment,
  shortSha,
  staleAgainst,
} from '../../src/features/dashboard/staleness';
import type { GhDeployment } from '../../src/features/dashboard/github';

function deployment(over: Partial<GhDeployment> = {}): GhDeployment {
  return {
    id: 1,
    environment: 'github-pages',
    created_at: '2026-08-26T03:00:00Z',
    sha: 'a'.repeat(40),
    ...over,
  };
}

describe('latestPagesDeployment', () => {
  it('ignores environments other than github-pages', () => {
    const other = deployment({ id: 2, environment: 'production', sha: 'b'.repeat(40) });
    expect(latestPagesDeployment([other])).toBeNull();
  });

  it('picks the newest by timestamp, not by list position', () => {
    const older = deployment({ id: 1, created_at: '2026-08-26T01:00:00Z', sha: 'o'.repeat(40) });
    const newer = deployment({ id: 2, created_at: '2026-08-26T05:00:00Z', sha: 'n'.repeat(40) });

    // Deliberately out of order: the API returns newest first today, but a
    // change in ordering must not turn this into a downgrade prompt.
    expect(latestPagesDeployment([older, newer])?.sha).toBe('n'.repeat(40));
    expect(latestPagesDeployment([newer, older])?.sha).toBe('n'.repeat(40));
  });

  it('returns null when there are no deployments at all', () => {
    expect(latestPagesDeployment([])).toBeNull();
  });
});

describe('staleAgainst', () => {
  const running = 'c'.repeat(40);

  it('reports the newer sha when production has moved on', () => {
    const shipped = 'd'.repeat(40);
    expect(staleAgainst(running, [deployment({ sha: shipped })])).toBe(shipped);
  });

  it('stays quiet when the running build is the deployed build', () => {
    expect(staleAgainst(running, [deployment({ sha: running })])).toBeNull();
  });

  it('never nags a dev build, which cannot be out of date', () => {
    expect(staleAgainst(DEV_BUILD, [deployment({ sha: 'e'.repeat(40) })])).toBeNull();
    expect(staleAgainst('', [deployment({ sha: 'e'.repeat(40) })])).toBeNull();
  });

  it('stays quiet when the deploy list tells us nothing', () => {
    expect(staleAgainst(running, [])).toBeNull();
    expect(staleAgainst(running, [deployment({ environment: 'production' })])).toBeNull();
  });

  it('survives a deployment with no sha', () => {
    expect(staleAgainst(running, [deployment({ sha: '' })])).toBeNull();
  });

  it('is the scenario that fooled the build: auto lane deploys while a tab is open', () => {
    // A tab loaded at the baseline commit stays open while the automated lane
    // merges and deploys. The tab keeps polling and looks perfectly healthy.
    const openTabBuild = 'f'.repeat(40);
    const afterAutoMerge = deployment({
      sha: '9'.repeat(40),
      created_at: '2026-08-26T04:00:00Z',
    });
    const baseline = deployment({
      sha: openTabBuild,
      created_at: '2026-08-26T03:00:00Z',
      id: 7,
    });

    expect(staleAgainst(openTabBuild, [afterAutoMerge, baseline])).toBe('9'.repeat(40));
  });
});

describe('shortSha', () => {
  it('abbreviates to the usual seven characters', () => {
    expect(shortSha('0957cdec506bf937285a20f0633530b77c92c409')).toBe('0957cde');
  });
});
