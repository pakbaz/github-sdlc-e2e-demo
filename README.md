# Nimbus Store — an end-to-end Agentic SDLC demo

A working, resettable, 60-minute demo of the entire software delivery lifecycle
run by agents on GitHub — from *issue filed* to *deployed in production* —
where the decision about **who has to approve** is made by GitHub itself, from
the diff.

**[Live storefront](https://pakbaz.github.io/github-sdlc-e2e-demo/)** ·
**[Live pipeline board](https://pakbaz.github.io/github-sdlc-e2e-demo/#/pipeline)** ·
**[Policy](https://pakbaz.github.io/github-sdlc-e2e-demo/#/policy)**

---

## The idea

> **Priority decides how fast we care. Risk decides who has to say yes.**

Two of the seeded bugs in this repository are `priority/P0`. Both are genuinely
urgent.

| | Order total is off by a cent | Expired sessions are accepted |
|---|---|---|
| Priority | `P0` | `P0` |
| Risk | `low` | `high` |
| Code owner | none | `@pakbaz` |
| Outcome | **Ships itself in minutes. No human.** | **Blocked at the merge button.** |

The only difference is which directory the fix lands in. That is the demo.

## How it works

```mermaid
flowchart LR
  A["Issue filed"] --> B["🤖 triage<br/>area · priority · risk"]
  B --> C["🤖 Copilot coding agent<br/>fix + regression test"]
  C --> D{"CODEOWNERS<br/>path touched?"}
  D -->|no| E["🟢 auto-merge<br/>→ production"]
  D -->|yes| F["🛑 human approves<br/>→ production"]
  style E fill:#dafbe1,stroke:#2da44e
  style F fill:#ffebe9,stroke:#cf222e
```

The gate is **not** a script. It is `.github/CODEOWNERS` plus a branch ruleset:

```
required_approving_review_count : 0
require_code_owner_review       : true
```

Together those mean: a pull request touching only unowned paths needs nobody; a
pull request touching an owned path cannot merge until its owner approves.
Deleting every workflow in this repository would not change that.

The agentic reviewer is declared with
`allowed-events: [COMMENT, REQUEST_CHANGES]`, so it is structurally incapable
of approving — two agents can never approve each other into production.

## Run it

```bash
gh repo clone pakbaz/github-sdlc-e2e-demo && cd github-sdlc-e2e-demo
npm ci

make setup     # idempotent: labels, ruleset, Pages, auto-merge, baseline tag
make doctor    # pre-flight — must print "Ready to demo"
make seed      # file the five scenario issues
make watch     # live pipeline state in the terminal
make reset     # back to a clean state, ready to run again
```

`make help` lists everything.

Then follow **[`demo/RUNBOOK.md`](demo/RUNBOOK.md)** — a minute-by-minute run of
show designed so the slow parts (an agent writing code takes 3–8 minutes)
happen while you are talking.

### Requirements

- `gh` ≥ 2.90 and the [`gh-aw`](https://github.com/githubnext/gh-aw) extension
- Node 22+
- A Copilot subscription with the coding agent enabled
- A **fine-grained personal access token** stored as `COPILOT_GITHUB_TOKEN`,
  `GH_AW_GITHUB_TOKEN` and `DEMO_PAT`.

  It has to be fine-grained. `gh auth token` gives you an OAuth token (`gho_…`)
  and the agentic engine rejects it outright — *"OAuth tokens are not supported
  for GitHub Copilot"* — so triage and the agentic review fail before they start.

  Create one at [Settings → Developer Settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new):

  | Field | Value |
  |---|---|
  | Resource owner | **your personal account** (not an org/EMU account) |
  | Repository access | Only select repositories → this repo |
  | Repository permissions | Actions **RW**, Contents **RW**, Issues **RW**, Pull requests **RW**, Workflows **RW**, Metadata R (added for you) |
  | Account permissions | Copilot Requests **Read** |

  Then store it three times — the engine, the safe-output writer and the demo
  scripts each read a different name:

  ```bash
  for s in COPILOT_GITHUB_TOKEN GH_AW_GITHUB_TOKEN DEMO_PAT; do
    gh secret set "$s" --repo OWNER/REPO < /path/to/token.txt
  done
  ```

  `GH_AW_GITHUB_TOKEN` is what makes an agent-authored commit trigger CI: the
  default `GITHUB_TOKEN` deliberately does not dispatch further workflows, so
  without it the auto lane merges and never deploys.
- A repository environment named `copilot`. `make setup` creates it; without it
  the coding agent opens its pull request and the run dies immediately.
- **Settings → Copilot → Cloud agent → "Require approval for workflow runs" must
  be OFF.** There is no API for it, so `make setup` cannot do it for you and
  `make doctor` checks it the only way it can — by noticing runs on `copilot/*`
  branches sitting at `action_required`.

  Left on, every agent pull request stops dead waiting for someone to press
  *Approve and run workflows*. The demo still works, but the automated lane
  quietly stops being automated, which is the one claim the whole hour rests on.
  This is a real security trade-off — it lets agent-authored code run workflows
  with your repository's secrets — and it is only appropriate because this is a
  throwaway demo repository. Do not copy it into anything that matters.

## What is in here

| Path | |
|---|---|
| [`demo/RUNBOOK.md`](demo/RUNBOOK.md) | The 60-minute run of show |
| [`demo/POLICY.md`](demo/POLICY.md) | The risk/priority policy and why each area is where it is |
| [`demo/ARCHITECTURE.md`](demo/ARCHITECTURE.md) | Diagrams of the pipeline and why agentic workflows are read-only |
| [`.github/CODEOWNERS`](.github/CODEOWNERS) | The gate. The omissions matter as much as the entries. |
| `.github/workflows/triage.md` | Agentic triage — reads the issue, greps the code, labels it, explains itself |
| `.github/workflows/pr-review.md` | Agentic review — can comment and request changes, never approve |
| `.github/workflows/policy-gate.yml` | Independent path classification + the explainer comment |
| `.github/workflows/agent-pr-ready.yml` | Takes the agent's finished pull request out of draft, so the automated lane needs no human |
| `src/features/dashboard/` | The live board that visualises this repository's own pipeline |
| `scripts/demo/` | `doctor` · `setup` · `seed` · `reset` · `status` |

## The planted defects

Every one is real, reproducible, and has a genuine fix.

| Scenario | File | Priority | Risk | Lane |
|---|---|---|---|---|
| Cart badge counts lines, not units | `src/features/ui/cart.ts` | `P3` | `low` | 🟢 auto |
| Float accumulation loses a cent | `src/features/checkout/total.ts` | `P0` | `low` | 🟢 auto |
| `isSessionValid` ignores `expiresAt` | `src/features/auth/session.ts` | `P0` | `high` | 🛑 gate |
| Public bucket, no TLS, no encryption | `infra/main.tf` | `P1` | `high` | 🛑 gate |
| No timeout, no retry, pagination drops pages | `src/features/api/client.ts` | `P1` | `medium` | 🛑 gate |

`main` is deliberately kept green: the unit tests assert only correct behaviour
and avoid the buggy cases, and each seeded issue asks the coding agent to add
the regression test that fails before its fix and passes after. That is what
makes CI genuinely go red → green on the pull request.

## Reusability

Everything the demo creates carries the `demo` label or lives on a `copilot/*`
branch, so `make reset` can be aggressive without touching anything else. Source
files are restored from the `demo-baseline` tag, which brings the planted
defects back exactly as they were.

Reset also stamps the run's issues with `demo/archived`, and the pipeline board
hides anything carrying it. Closing an issue is not enough on its own: an issue
that *shipped* is closed **and** has a merged pull request, which is precisely
the state the board renders as `Deployed`. Without the archive stamp every past
demo's successes would stack up in the last column and the next run would open
on a board that is already full.

Reset also runs from the Actions tab (**Demo · reset**), as does seeding
(**Demo · seed scenarios**), so the demo can be driven end to end from a phone.

## Development

```bash
make dev        # vite dev server
make verify     # lint · typecheck · unit · build
make e2e        # Playwright browser tests
make compile    # recompile agentic workflows after editing frontmatter
```

`.lock.yml` files are generated by `gh aw compile` and must be committed —
Actions runs the lock file, not the markdown.

---

*This is a demo repository. The Terraform is never applied, the storefront
takes no payments, and the defects are there on purpose.*
