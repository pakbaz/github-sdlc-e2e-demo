# Architecture

## The pipeline

```mermaid
flowchart TD
  A["Issue filed<br/><i>the only human action</i>"] --> B

  subgraph agentic ["🤖 Agentic workflow · gh-aw"]
    B["triage.md<br/>reads the issue, greps the code,<br/>derives area + priority + risk"]
  end

  B --> C["Labels applied<br/><code>area/*</code> <code>priority/*</code> <code>risk/*</code> <code>route/*</code><br/>+ public reasoning comment"]
  C --> D["<code>agent/triaged</code> label<br/><i>the handoff</i>"]
  D --> E["dispatch-to-copilot.yml<br/>announces the lane,<br/>assigns via GraphQL"]

  E -->   F["🤖 Copilot coding agent<br/>writes the fix, adds a<br/>regression test, opens a <b>draft</b> PR"]

  F --> R["agent-pr-ready.yml<br/>agent dropped its <code>[WIP]</code> title<br/>→ mark ready for review"]

  R --> G["ci.yml → <code>verify</code><br/>lint · typecheck · unit<br/>· build · Playwright"]
  R --> H["🤖 pr-review.md<br/>COMMENT or REQUEST_CHANGES<br/><b>never APPROVE</b>"]
  R --> I["policy-gate.yml<br/>classifies changed paths"]

  I --> J{"Does the diff touch<br/>a CODEOWNERS path?"}

  J -->|"No — ui / checkout / docs"| K["🟢 Ruleset satisfied<br/>0 approvals required"]
  J -->|"Yes — auth / api / infra / .github"| L["🛑 Ruleset blocks merge<br/>code owner approval required"]

  K --> M["Auto-merge enabled"]
  L --> N["🧑 Human reviews and approves"]

  G --> M
  G --> N
  H -.->|"advisory only"| N

  M --> O["Squash merge to main"]
  N --> O
  O --> P["deploy-pages.yml<br/>→ GitHub Pages"]
  P --> Q["📊 Live dashboard<br/>shows every stage"]

  style K fill:#dafbe1,stroke:#2da44e
  style L fill:#ffebe9,stroke:#cf222e
  style M fill:#dafbe1,stroke:#2da44e
  style N fill:#ffebe9,stroke:#cf222e
```

## What runs where

| Workflow | Kind | Trigger | What it does |
|---|---|---|---|
| `triage.md` | agentic (`gh-aw`, Copilot) | issue opened | Reads the issue, greps the codebase, applies five labels, posts its reasoning |
| `dispatch-to-copilot.yml` | Actions | `agent/triaged` label | Comments which lane, assigns the issue to `copilot-swe-agent` via GraphQL |
| *(Copilot coding agent)* | GitHub-hosted | assignment | Writes the fix, adds a regression test, opens a **draft** pull request |
| `agent-pr-ready.yml` | Actions | PR edited · every 5 min | The agent leaves its finished pull request in draft, and a draft cannot auto-merge. Marks it ready once the `[WIP]` title is dropped. |
| `ci.yml` | Actions | pull request | `verify`: lint, typecheck, unit, build, Playwright. **Required check.** |
| `pr-review.md` | agentic (`gh-aw`, Copilot) | pull request | Reviews the diff; restricted to COMMENT / REQUEST_CHANGES |
| `policy-gate.yml` | Actions | pull request | Classifies paths, labels the PR, enables auto-merge *or* requests the code owner, posts the explainer |
| `deploy-pages.yml` | Actions | push to `main` | Builds and publishes to GitHub Pages |
| `demo-seed.yml` | Actions | manual | Files scenario issues from the Actions tab |
| `demo-reset.yml` | Actions | manual | Returns the repository to `demo-baseline` |

## How models are selected

The two `gh-aw` workflows declare:

```yaml
engine:
  id: copilot
  model: agent
```

`agent` is an adaptive alias rather than a pinned model ID. AWF token steering
and Copilot select from the models permitted by the repository's plan and
administrator policies, considering task complexity and current model
availability. A straightforward issue classification can use a faster model;
an ambiguous issue or complex pull-request review can receive stronger
reasoning without changing this repository.

`dispatch-to-copilot.yml` does not force a model when assigning the coding
agent. Copilot cloud agent therefore retains its Auto model selection. The
model used is visible in the agent response and workflow run, so the choice is
auditable even though it is not hard-coded.

## Why agentic workflows are read-only

`gh-aw` compiles each `.md` into a `.lock.yml` with a specific shape:

```mermaid
flowchart LR
  A["agent job<br/><code>permissions: read-all</code>"]
  -->|"structured JSON<br/>on stdout"|
  B["threat detection"]
  --> C["safe_outputs job<br/><i>has write permissions</i>"]
  --> D["labels · comments · reviews"]

  style A fill:#f6f8fa,stroke:#8c959f
  style C fill:#fff8c5,stroke:#bf8700
```

The model never holds a write token. It *requests* an operation; a separate job
with a narrow, declared permission set decides whether that request is
permitted. `add-labels` declares `allowed: [area/*, priority/*, risk/*,
route/*, agent/triaged]`, so a prompt-injected agent cannot invent a label —
let alone push code.

For the full breakdown — every frontmatter field, the seven compiled jobs, the
network firewall, the token subtleties and the gotchas — see
[`demo/AGENTIC-WORKFLOWS.md`](AGENTIC-WORKFLOWS.md).

## The three-way agreement

The routing table exists in three places, and they must stay in sync:

```mermaid
flowchart TD
  P["src/features/dashboard/policy.ts<br/><i>what the audience sees</i>"]
  C[".github/CODEOWNERS<br/><i>what GitHub enforces</i>"]
  G[".github/workflows/policy-gate.yml<br/><i>the independent second opinion</i>"]

  P <--> C
  C <--> G
  G <--> P
```

`CODEOWNERS` is authoritative — it is the one GitHub reads. The other two are
mirrors, and `doctor.sh` checks that the owned/unowned split still matches.
If they disagree, the disagreement is visible: the dashboard says one thing and
the merge button says another.

## The app

```
src/
  features/
    ui/         cart badge + storefront          ← planted defect · low risk
    checkout/   order totals                     ← planted defect · low risk
    auth/       session validation               ← planted defect · HIGH risk
    api/        shared HTTP client               ← planted defect · medium risk
    dashboard/  policy.ts · github.ts ·
                pipeline.ts · PipelinePage ·
                PolicyPage                       ← the live control tower
infra/main.tf   Terraform                        ← planted defect · HIGH risk
```

The dashboard reads this repository's own public REST API — issues, pull
requests, workflow runs, deployments — and maps each issue onto a seven-stage
board: **filed → triaged → agent working → PR open → human gate → merged →
deployed**. It refreshes every 20 seconds and degrades gracefully when the
anonymous rate limit (60/hour) runs out, with an optional token field.

The app watching its own delivery pipeline is not a gimmick: it means the
audience never has to context-switch to the GitHub UI to see what happened.
