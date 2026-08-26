/**
 * The routing policy that the whole demo turns on.
 *
 * This module is the single, readable definition of *why* a change is allowed
 * to ship itself and *why* another change must stop and wait for a human. The
 * dashboard renders it, `demo/POLICY.md` documents it, and
 * `.github/workflows/policy-gate.yml` implements the same table in bash.
 *
 * The rule in one sentence:
 *
 *   **Priority decides how fast we care. Risk decides who has to say yes.**
 */

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type Risk = 'low' | 'medium' | 'high';
export type Lane = 'auto' | 'human-gate';

export interface AreaPolicy {
  /** Label suffix, e.g. `area/auth`. */
  area: string;
  label: string;
  /** Glob-ish path prefixes owned by this area. */
  paths: string[];
  risk: Risk;
  /** Whether `.github/CODEOWNERS` assigns a human owner to these paths. */
  codeowner: boolean;
  rationale: string;
}

/**
 * Risk is a property of *where* the change lands, not of how urgent it is.
 * This is the table `.github/CODEOWNERS` and the branch ruleset encode.
 */
export const AREA_POLICIES: readonly AreaPolicy[] = [
  {
    area: 'ui',
    label: 'area/ui',
    paths: ['src/features/ui/', 'src/styles/', 'src/features/dashboard/'],
    risk: 'low',
    codeowner: false,
    rationale:
      'Presentation only. Nothing here touches money, identity, or infrastructure, and it is covered by browser tests.',
  },
  {
    area: 'checkout',
    label: 'area/checkout',
    paths: ['src/features/checkout/'],
    risk: 'low',
    codeowner: false,
    rationale:
      'Pure, fully unit-tested money maths with no external side effects. Defects here are severe but the blast radius is one function.',
  },
  {
    area: 'auth',
    label: 'area/auth',
    paths: ['src/features/auth/'],
    risk: 'high',
    codeowner: true,
    rationale:
      'Identity and session lifetime. A wrong change either locks every customer out or lets revoked sessions live forever.',
  },
  {
    area: 'api',
    label: 'area/api',
    paths: ['src/features/api/'],
    risk: 'medium',
    codeowner: true,
    rationale:
      'Shared transport used by every feature. Retry and timeout behaviour changes propagate everywhere at once.',
  },
  {
    area: 'infra',
    label: 'area/infra',
    paths: ['infra/'],
    risk: 'high',
    codeowner: true,
    rationale:
      'Infrastructure as code. Changes affect data exposure and availability and cannot be rolled back by reverting a render.',
  },
  {
    area: 'pipeline',
    label: 'area/pipeline',
    paths: [
      '.github/',
      'package.json',
      'package-lock.json',
      'vite.config.ts',
      'playwright.config.ts',
    ],
    risk: 'high',
    codeowner: true,
    rationale:
      'The automation itself, plus the dependency and build surface. Anything able to edit the pipeline can disable its own guardrails, so it is always gated.',
  },
  {
    area: 'docs',
    label: 'area/docs',
    paths: ['demo/', 'README.md', 'docs/', 'tests/'],
    risk: 'low',
    codeowner: false,
    rationale: 'Prose only. No runtime behaviour.',
  },
];

export const RISK_ORDER: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

/** The lane a given risk level routes into. */
export function laneForRisk(risk: Risk): Lane {
  return risk === 'low' ? 'auto' : 'human-gate';
}

/** Find the policy that owns a changed file path. */
export function policyForPath(path: string): AreaPolicy | undefined {
  return AREA_POLICIES.find((policy) => policy.paths.some((prefix) => path.startsWith(prefix)));
}

/**
 * Classify a set of changed files. The highest risk wins: a pull request that
 * touches one CSS file and one Terraform file is a high-risk pull request.
 */
export function classifyChangedFiles(paths: readonly string[]): {
  risk: Risk;
  lane: Lane;
  areas: string[];
  unmatched: string[];
} {
  const areas = new Set<string>();
  const unmatched: string[] = [];
  let risk: Risk = 'low';

  for (const path of paths) {
    const policy = policyForPath(path);
    if (!policy) {
      unmatched.push(path);
      continue;
    }
    areas.add(policy.area);
    if (RISK_ORDER[policy.risk] > RISK_ORDER[risk]) {
      risk = policy.risk;
    }
  }

  // Anything we do not recognise is treated as risky. Fail closed.
  if (unmatched.length > 0 && RISK_ORDER.medium > RISK_ORDER[risk]) {
    risk = 'medium';
  }

  return { risk, lane: laneForRisk(risk), areas: [...areas].sort(), unmatched };
}

export interface Scenario {
  id: string;
  title: string;
  area: string;
  priority: Priority;
  risk: Risk;
  lane: Lane;
  summary: string;
}

/** The five seeded demo scenarios, mirrored by `demo/scenarios/*.md`. */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'ui',
    title: 'Cart badge shows the wrong number of items',
    area: 'ui',
    priority: 'P3',
    risk: 'low',
    lane: 'auto',
    summary: 'Cosmetic counting bug in the cart badge. Ships itself.',
  },
  {
    id: 'checkout',
    title: 'Order total is off by a cent on multi-item carts',
    area: 'checkout',
    priority: 'P0',
    risk: 'low',
    lane: 'auto',
    summary: 'Customers are charged the wrong amount. Urgent, but tiny blast radius — ships itself.',
  },
  {
    id: 'auth',
    title: 'Expired sessions are still accepted',
    area: 'auth',
    priority: 'P0',
    risk: 'high',
    lane: 'human-gate',
    summary: 'Session expiry is never checked. Urgent AND dangerous — a human must approve.',
  },
  {
    id: 'infra',
    title: 'Assets bucket is public and allows plaintext HTTP',
    area: 'infra',
    priority: 'P1',
    risk: 'high',
    lane: 'human-gate',
    summary: 'Terraform exposes data publicly. A human must approve before it ships.',
  },
  {
    id: 'api',
    title: 'API client has no timeout, retry, or pagination',
    area: 'api',
    priority: 'P1',
    risk: 'medium',
    lane: 'human-gate',
    summary: 'Shared transport used by every feature. A human must approve.',
  },
];
