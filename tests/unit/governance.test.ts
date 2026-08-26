import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyChangedFiles, AREA_POLICIES } from '../../src/features/dashboard/policy';

const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/**
 * The routing policy is expressed in three places, and the demo is only
 * credible if all three agree:
 *
 *   1. src/features/dashboard/policy.ts       what the audience sees
 *   2. .github/CODEOWNERS                     what GitHub actually enforces
 *   3. .github/workflows/policy-gate.yml      the independent second opinion
 *
 * CODEOWNERS is authoritative — it is the one GitHub reads. These tests pin
 * the other two to it, so a well-meaning edit to one file cannot silently
 * change who has to approve a change.
 *
 * These cases are executed against the bash classifier in policy-gate.yml too;
 * the expectations below were taken from its real output.
 */

const CASES: Array<{
  name: string;
  files: string[];
  risk: 'low' | 'medium' | 'high';
  lane: 'auto' | 'human-gate';
}> = [
  { name: 'ui fix with its test', files: ['src/features/ui/cart.ts', 'tests/unit/cart.test.ts'], risk: 'low', lane: 'auto' },
  { name: 'checkout fix with its test', files: ['src/features/checkout/total.ts', 'tests/unit/total.test.ts'], risk: 'low', lane: 'auto' },
  { name: 'styling and docs', files: ['src/styles/app.css', 'README.md'], risk: 'low', lane: 'auto' },
  { name: 'the dashboard itself', files: ['src/features/dashboard/policy.ts'], risk: 'low', lane: 'auto' },
  { name: 'api client', files: ['src/features/api/client.ts'], risk: 'medium', lane: 'human-gate' },
  { name: 'auth', files: ['src/features/auth/session.ts'], risk: 'high', lane: 'human-gate' },
  { name: 'terraform', files: ['infra/main.tf'], risk: 'high', lane: 'human-gate' },
  { name: 'a workflow', files: ['.github/workflows/ci.yml'], risk: 'high', lane: 'human-gate' },
  { name: 'a new dependency', files: ['package.json', 'package-lock.json'], risk: 'high', lane: 'human-gate' },
  { name: 'an unrecognised path fails closed', files: ['server/index.js'], risk: 'medium', lane: 'human-gate' },
];

describe('path classification', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const result = classifyChangedFiles(c.files);
      expect(result.risk).toBe(c.risk);
      expect(result.lane).toBe(c.lane);
    });
  }
});

describe('an agent cannot widen its lane by widening its diff', () => {
  // The failure mode this whole repository exists to demonstrate: a change
  // authorised as low risk quietly reaching into an owned path.
  const escapes: Array<[string, string]> = [
    ['auth', 'src/features/auth/session.ts'],
    ['api', 'src/features/api/client.ts'],
    ['infra', 'infra/main.tf'],
    ['the pipeline', '.github/workflows/policy-gate.yml'],
    ['CODEOWNERS itself', '.github/CODEOWNERS'],
  ];

  for (const [name, path] of escapes) {
    it(`a ui change that also touches ${name} is gated`, () => {
      const result = classifyChangedFiles(['src/features/ui/cart.ts', path]);
      expect(result.lane).toBe('human-gate');
    });
  }
});

describe('CODEOWNERS agrees with policy.ts', () => {
  const codeowners = repoFile('.github/CODEOWNERS');

  // A path is "owned" if some non-comment CODEOWNERS rule covers it.
  const ownedPrefixes = codeowners
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split(/\s+/)[0].replace(/^\//, ''));

  const isOwned = (path: string) =>
    ownedPrefixes.some((prefix) =>
      prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix,
    );

  for (const policy of AREA_POLICIES) {
    for (const path of policy.paths) {
      const probe = path.endsWith('/') ? `${path}probe.ts` : path;

      it(`${path} is ${policy.codeowner ? 'owned' : 'unowned'}`, () => {
        expect(isOwned(probe)).toBe(policy.codeowner);
      });
    }
  }

  it('every high or medium risk area has a code owner', () => {
    for (const policy of AREA_POLICIES) {
      if (policy.risk !== 'low') {
        expect(policy.codeowner, `${policy.area} is ${policy.risk} risk`).toBe(true);
      }
    }
  });

  it('every code-owned area is above low risk', () => {
    for (const policy of AREA_POLICIES) {
      if (policy.codeowner) {
        expect(policy.risk, `${policy.area} has an owner`).not.toBe('low');
      }
    }
  });
});

describe('the agentic reviewer cannot approve', () => {
  // This is a structural guarantee, not a convention. If APPROVE were ever
  // added to allowed-events, two agents could approve each other into
  // production and the human gate would be decorative.
  it('pr-review.md restricts submit-pull-request-review to COMMENT and REQUEST_CHANGES', () => {
    const workflow = repoFile('.github/workflows/pr-review.md');
    expect(workflow).toContain('allowed-events: [COMMENT, REQUEST_CHANGES]');
    expect(workflow).not.toMatch(/allowed-events:.*APPROVE/);
  });
});
