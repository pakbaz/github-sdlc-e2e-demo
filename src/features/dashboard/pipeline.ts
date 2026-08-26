import type { GhIssue, GhPull } from './github';
import { hasLabel, labelValue } from './github';
import type { Lane, Priority, Risk } from './policy';
import { laneForRisk } from './policy';

/**
 * The seven stages the demo walks an issue through. These are exactly the
 * columns rendered on the live board, so the audience can watch a card move.
 */
export const STAGES = [
  'filed',
  'triaged',
  'agent',
  'review',
  'gate',
  'merged',
  'deployed',
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<Stage, { title: string; blurb: string; icon: string }> = {
  filed: { title: 'Filed', blurb: 'Issue opened, untouched', icon: '📥' },
  triaged: { title: 'Triaged', blurb: 'Agent applied priority + risk', icon: '🏷️' },
  agent: { title: 'Agent working', blurb: 'Copilot coding agent assigned', icon: '🤖' },
  review: { title: 'PR open', blurb: 'Pull request + CI running', icon: '🔀' },
  gate: { title: 'Human gate', blurb: 'Code owner approval required', icon: '🛑' },
  merged: { title: 'Merged', blurb: 'Landed on main', icon: '✅' },
  deployed: { title: 'Deployed', blurb: 'Live in production', icon: '🚀' },
};

export interface PipelineCard {
  key: string;
  issueNumber: number;
  title: string;
  url: string;
  stage: Stage;
  lane: Lane | null;
  priority: Priority | null;
  risk: Risk | null;
  area: string | null;
  assignees: string[];
  pull: GhPull | null;
  updatedAt: string;
  triaged: boolean;
  autoMerge: boolean;
}

const PRIORITIES = new Set<string>(['P0', 'P1', 'P2', 'P3']);
const RISKS = new Set<string>(['low', 'medium', 'high']);

function toPriority(value: string | null): Priority | null {
  return value && PRIORITIES.has(value) ? (value as Priority) : null;
}

function toRisk(value: string | null): Risk | null {
  return value && RISKS.has(value) ? (value as Risk) : null;
}

/** Link an issue to the pull request that claims to fix it. */
export function findLinkedPull(issue: GhIssue, pulls: readonly GhPull[]): GhPull | null {
  const patterns = [
    new RegExp(`\\b(?:closes|fixes|resolves)\\s+#${issue.number}\\b`, 'i'),
    new RegExp(`#${issue.number}\\b`),
  ];

  for (const pattern of patterns) {
    const match = pulls.find(
      (pull) => pattern.test(pull.title) || pattern.test(pull.head.ref.replace(/-/g, ' ')),
    );
    if (match) {
      return match;
    }
  }

  // Copilot names its branches `copilot/fix-<issue>` or similar.
  const branchMatch = pulls.find((pull) => new RegExp(`(^|[^0-9])${issue.number}([^0-9]|$)`).test(pull.head.ref));
  return branchMatch ?? null;
}

/**
 * Decide which column a card belongs in. Stages are evaluated from the end
 * backwards so the furthest-along signal always wins.
 */
export function stageFor(
  issue: GhIssue,
  pull: GhPull | null,
  deployedShas: ReadonlySet<string>,
): Stage {
  if (pull?.merged_at) {
    return deployedShas.has(pull.head.sha) || issue.state === 'closed' ? 'deployed' : 'merged';
  }

  if (pull) {
    const risk = toRisk(labelValue(issue.labels, 'risk'));
    const gated = risk !== null && laneForRisk(risk) === 'human-gate';
    return gated || hasLabel(pull.labels, 'needs-human-review') ? 'gate' : 'review';
  }

  if (issue.assignees.some((user) => user.login.toLowerCase().includes('copilot'))) {
    return 'agent';
  }

  if (labelValue(issue.labels, 'risk') || hasLabel(issue.labels, 'agent/triaged')) {
    return 'triaged';
  }

  return 'filed';
}

/**
 * An issue that was closed without ever producing a merged pull request never
 * went through the pipeline — it was abandoned, or cleared away by
 * `scripts/demo/reset.sh`, which closes demo issues as "not planned".
 *
 * Without this, those issues fall through `stageFor` to `filed` and sit in the
 * first column forever, so every demo after the first one starts on a board
 * polluted with the previous run's cards. Reset has to actually reset.
 */
function isAbandoned(issue: GhIssue, pull: GhPull | null): boolean {
  return issue.state === 'closed' && !pull?.merged_at;
}

export function buildPipeline(
  issues: readonly GhIssue[],
  pulls: readonly GhPull[],
  deployedShas: ReadonlySet<string>,
): PipelineCard[] {
  const live = issues
    .map((issue) => ({ issue, pull: findLinkedPull(issue, pulls) }))
    .filter(({ issue, pull }) => !isAbandoned(issue, pull));

  return live.map(({ issue, pull }) => {
    const risk = toRisk(labelValue(issue.labels, 'risk'));
    return {
      key: `issue-${issue.number}`,
      issueNumber: issue.number,
      title: issue.title,
      url: issue.html_url,
      stage: stageFor(issue, pull, deployedShas),
      lane: risk ? laneForRisk(risk) : null,
      priority: toPriority(labelValue(issue.labels, 'priority')),
      risk,
      area: labelValue(issue.labels, 'area'),
      assignees: issue.assignees.map((user) => user.login),
      pull,
      updatedAt: issue.updated_at,
      triaged: hasLabel(issue.labels, 'agent/triaged') || risk !== null,
      autoMerge: pull?.auto_merge != null,
    };
  });
}

export function groupByStage(cards: readonly PipelineCard[]): Record<Stage, PipelineCard[]> {
  const grouped = Object.fromEntries(STAGES.map((stage) => [stage, [] as PipelineCard[]])) as Record<
    Stage,
    PipelineCard[]
  >;
  for (const card of cards) {
    grouped[card.stage].push(card);
  }
  return grouped;
}
