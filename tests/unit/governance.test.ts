import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  { name: 'the app shell and a static asset', files: ['src/App.tsx', 'public/favicon.svg', 'index.html'], risk: 'low', lane: 'auto' },
  { name: 'api client', files: ['src/features/api/client.ts'], risk: 'medium', lane: 'human-gate' },
  { name: 'a demo control script', files: ['scripts/demo/reset.sh'], risk: 'high', lane: 'human-gate' },
  { name: 'the lint or typescript config', files: ['eslint.config.js', 'tsconfig.json'], risk: 'high', lane: 'human-gate' },
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

/**
 * The bash classifier is the second opinion, and a second opinion is worthless
 * if nobody ever compares it to the first. Rather than copy its expected output
 * into this file by hand — which is how the two drifted apart the first time —
 * these tests lift the real `case` statement out of policy-gate.yml and run it.
 *
 * If somebody edits one classifier and not the other, this fails.
 */
describe('policy-gate.yml agrees with policy.ts', () => {
  const START = '# Risk rank: 0 low, 1 medium, 2 high. Highest wins.';
  const END = 'lane=human-gate';

  /** Lift the classifier out of the workflow's `run:` block scalar. */
  function extractClassifier(): string {
    const lines = repoFile('.github/workflows/policy-gate.yml').split('\n');
    const start = lines.findIndex((l) => l.includes(START));
    const end = lines.findIndex((l, i) => i > start && l.includes(END));
    if (start < 0 || end < 0) {
      throw new Error(
        'Could not find the classifier in policy-gate.yml. If the workflow was ' +
          'restructured, update START/END in this test — do not delete it.',
      );
    }

    // +2 to close the `if`/`fi` that `lane=human-gate` sits inside.
    const body = lines.slice(start, end + 2);
    const indent = Math.min(
      ...body.filter((l) => l.trim().length > 0).map((l) => l.length - l.trimStart().length),
    );
    return body.map((l) => l.slice(indent)).join('\n');
  }

  const classifier = extractClassifier();

  function runBash(files: string[]): { risk: string; lane: string } {
    const dir = mkdtempSync(join(tmpdir(), 'policy-gate-'));
    const listing = join(dir, 'changed.txt');
    writeFileSync(listing, `${files.join('\n')}\n`);

    // The workflow reads a fixed path; point it at our fixture instead.
    const script = `set -euo pipefail\n${classifier.replace('/tmp/changed.txt', listing)}\necho "$risk $lane"\n`;

    try {
      const out = execFileSync('bash', ['-c', script], { encoding: 'utf8' });
      const [risk, lane] = out.trim().split('\n').pop()!.split(' ');
      return { risk, lane };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  for (const c of CASES) {
    it(`${c.name}: bash and typescript reach the same verdict`, () => {
      const bash = runBash(c.files);
      const ts = classifyChangedFiles(c.files);

      expect(bash.risk, 'bash risk').toBe(c.risk);
      expect(bash.lane, 'bash lane').toBe(c.lane);
      expect(bash.risk, 'bash agrees with typescript on risk').toBe(ts.risk);
      expect(bash.lane, 'bash agrees with typescript on lane').toBe(ts.lane);
    });
  }

  it('every path the policy claims to own is recognised by bash', () => {
    for (const policy of AREA_POLICIES) {
      for (const path of policy.paths) {
        const probe = path.endsWith('/') ? `${path}probe.ts` : path;
        const bash = runBash([probe]);
        const ts = classifyChangedFiles([probe]);

        // A path falling through to the `*)` catch-all would come back medium
        // even though policy.ts claims to know it. That is the drift we care about.
        expect(bash.risk, `${probe} (declared ${policy.area}/${policy.risk})`).toBe(ts.risk);
      }
    }
  });
});
