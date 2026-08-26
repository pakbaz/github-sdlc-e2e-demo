import { describe, expect, it } from 'vitest';
import { isRetryableStatus, parseNextLink } from '../../src/features/api/client';
import {
  AREA_POLICIES,
  classifyChangedFiles,
  laneForRisk,
  policyForPath,
  SCENARIOS,
} from '../../src/features/dashboard/policy';

describe('parseNextLink', () => {
  it('returns null when there is no Link header', () => {
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink('')).toBeNull();
  });

  it('extracts the rel="next" URL', () => {
    const header =
      '<https://api.github.com/repos/o/r/issues?page=2>; rel="next", <https://api.github.com/repos/o/r/issues?page=9>; rel="last"';
    expect(parseNextLink(header)).toBe('https://api.github.com/repos/o/r/issues?page=2');
  });

  it('returns null on the last page', () => {
    const header = '<https://api.github.com/repos/o/r/issues?page=1>; rel="prev"';
    expect(parseNextLink(header)).toBeNull();
  });
});

describe('isRetryableStatus', () => {
  it('treats throttling and gateway errors as retryable', () => {
    for (const status of [429, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(true);
    }
  });

  it('does not retry client errors or success', () => {
    for (const status of [200, 304, 400, 401, 403, 404, 422]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });
});

describe('routing policy', () => {
  it('sends low risk to the automated lane and everything else to the human gate', () => {
    expect(laneForRisk('low')).toBe('auto');
    expect(laneForRisk('medium')).toBe('human-gate');
    expect(laneForRisk('high')).toBe('human-gate');
  });

  it('maps every area path prefix back to its policy', () => {
    for (const policy of AREA_POLICIES) {
      for (const path of policy.paths) {
        expect(policyForPath(`${path}example.ts`)?.area).toBe(policy.area);
      }
    }
  });

  it('gives every high-risk area a code owner', () => {
    for (const policy of AREA_POLICIES) {
      if (policy.risk !== 'low') {
        expect(policy.codeowner, `${policy.area} must be owned`).toBe(true);
      }
    }
  });

  it('routes a presentation-only change to the automated lane', () => {
    const result = classifyChangedFiles(['src/features/ui/cart.ts', 'src/styles/app.css']);
    expect(result.risk).toBe('low');
    expect(result.lane).toBe('auto');
  });

  it('routes an auth change to the human gate', () => {
    const result = classifyChangedFiles(['src/features/auth/session.ts']);
    expect(result.risk).toBe('high');
    expect(result.lane).toBe('human-gate');
  });

  it('lets the highest risk in a mixed change set win', () => {
    const result = classifyChangedFiles(['src/features/ui/cart.ts', 'infra/main.tf']);
    expect(result.risk).toBe('high');
    expect(result.lane).toBe('human-gate');
    expect(result.areas).toEqual(['infra', 'ui']);
  });

  it('fails closed on paths it does not recognise', () => {
    const result = classifyChangedFiles(['scripts/deploy-to-prod.sh']);
    expect(result.unmatched).toContain('scripts/deploy-to-prod.sh');
    expect(result.lane).toBe('human-gate');
  });

  it('keeps every scenario lane consistent with its risk', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.lane, `${scenario.id} lane`).toBe(laneForRisk(scenario.risk));
    }
  });

  it('includes an urgent-but-low-risk scenario, which is the point of the demo', () => {
    const urgentAuto = SCENARIOS.find((s) => s.priority === 'P0' && s.lane === 'auto');
    expect(urgentAuto).toBeDefined();
  });
});
