# The policy

> **Priority decides how fast we care. Risk decides who has to say yes.**

Most conversations about agentic delivery stall on a single question — *should
the agent be allowed to merge?* — and that is the wrong question. It invites a
yes/no answer to something that is neither.

The right question is **where the change lands**. A cosmetic label fix and a
session-expiry fix can both be P0. Only one of them deserves a human in the
loop, and it is not the urgent one.

---

## Risk is a property of the path

| Area | Paths | Risk | Code owner | Lane |
|---|---|---|---|---|
| `area/ui` | `src/features/ui/`, `src/styles/` | `low` | — | **auto** |
| `area/checkout` | `src/features/checkout/` | `low` | — | **auto** |
| `area/docs` | `demo/`, `docs/`, `README.md` | `low` | — | **auto** |
| `area/api` | `src/features/api/` | `medium` | `@pakbaz` | **human gate** |
| `area/auth` | `src/features/auth/` | `high` | `@pakbaz` | **human gate** |
| `area/infra` | `infra/` | `high` | `@pakbaz` | **human gate** |
| `area/pipeline` | `.github/` | `high` | `@pakbaz` | **human gate** |

**Why each one:**

- **ui** — Presentation only. Nothing here touches money, identity or
  infrastructure, and it is covered by browser tests. If it is wrong, you can
  see it is wrong.
- **checkout** — Pure, fully unit-tested arithmetic with no external side
  effects. Defects here are *severe* but the blast radius is one function, and
  a regression test genuinely bounds it.
- **api** — Shared transport used by every feature. A retry or timeout change
  propagates everywhere at once, which is exactly the kind of change that looks
  small and is not.
- **auth** — Identity and session lifetime. A wrong change either locks every
  customer out or lets revoked sessions live forever, and no test suite fully
  bounds that.
- **infra** — Data exposure and availability. You cannot roll it back by
  reverting a render.
- **pipeline** — The automation itself. Anything able to edit the pipeline can
  disable its own guardrails, so it is always gated. This is the most important
  row in the table.

**Unmatched paths fail closed** to `medium` — a human, not a robot.

---

## Priority is a separate axis

| Label | Meaning |
|---|---|
| `priority/P0` | Customers are losing money, access or data right now. Fix today. |
| `priority/P1` | A workflow is broken or a real security weakness exists. Fix this week. |
| `priority/P2` | Degraded, with a workaround. Fix this month. |
| `priority/P3` | Cosmetic or nice to have. |

Priority never changes risk, and risk never changes priority. That
independence is the entire idea.

---

## The five demo scenarios

| # | Scenario | Area | Priority | Risk | Lane |
|---|---|---|---|---|---|
| 1 | Cart badge shows the wrong count | `ui` | `P3` | `low` | 🟢 auto |
| 2 | Order total is off by a cent | `checkout` | **`P0`** | `low` | 🟢 **auto** |
| 3 | Expired sessions are still accepted | `auth` | **`P0`** | `high` | 🛑 gate |
| 4 | Assets bucket is public, no TLS | `infra` | `P1` | `high` | 🛑 gate |
| 5 | API client has no timeout or retry | `api` | `P1` | `medium` | 🛑 gate |

Scenarios **2 and 3 are the point of the whole demo.** Both are P0. Both are
genuinely urgent. One of them ships itself in four minutes with no human
involved; the other stops dead at the merge button until a person clicks
approve. The only difference between them is which directory the fix lands in.

---

## How GitHub actually enforces it

Nothing above is enforced by a script. It is enforced by two GitHub primitives
that a workflow cannot edit around:

**1. `.github/CODEOWNERS`**

```
/src/features/auth/   @pakbaz
/src/features/api/    @pakbaz
/infra/               @pakbaz
/.github/             @pakbaz
```

`src/features/ui/` and `src/features/checkout/` are **deliberately absent**.

**2. The `demo-main-gate` ruleset on `main`**

```
required_approving_review_count : 0
require_code_owner_review       : true
required status check           : verify
```

Read those two lines together and the routing falls out for free:

- A pull request touching **only unowned paths** satisfies "0 approvals" and has
  no code owner to satisfy → **merge is unblocked** → auto-merge ships it.
- A pull request touching **any owned path** needs that owner's approval →
  **merge button disabled** → a human must click.

There is no `if` statement anywhere in this repository that decides whether an
agent may merge. GitHub decides, from the diff.

### Defence in depth

`.github/workflows/policy-gate.yml` performs the same classification
independently and posts a human-readable explanation on every pull request. It
is *not* the gate — deleting it would not unblock a single merge. It exists so
the audience can see the reasoning, and so a misconfigured `CODEOWNERS` shows
up as a disagreement between two systems rather than as silence.

### The reviewer cannot approve

`.github/workflows/pr-review.md` declares:

```yaml
safe-outputs:
  submit-pull-request-review:
    allowed-events: [COMMENT, REQUEST_CHANGES]
```

`APPROVE` is not in that list, so the agentic reviewer is structurally incapable
of satisfying a code owner gate — even for a pull request it did not write.
Two agents cannot approve each other into production.

---

## Things this policy deliberately does not do

- **It does not gate on priority.** Urgency is a scheduling signal, not a
  safety signal. Gating on it means P0s get *less* review precisely when they
  are riskiest.
- **It does not gate on diff size.** A three-character change to a session
  lifetime is more dangerous than a three-hundred-line CSS refactor.
- **It does not gate on who wrote it.** The same rules apply to the coding
  agent and to a human. If a human opened a pull request touching `infra/`, it
  would be blocked identically.
- **It does not let the agent classify its own risk.** The triage agent
  *suggests* labels; the gate reads `CODEOWNERS` and the diff. An agent that
  mislabels its own work as low risk still cannot merge into an owned path.
