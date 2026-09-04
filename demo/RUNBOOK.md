# Runbook — 60 minutes

A minute-by-minute run of show. The demo is built so that the slow parts (an
agent writing code takes 3–8 minutes) happen *while you are talking*, not while
the room watches a spinner.

---

## Before you present

### Once per account — the three things no script can do for you

These are not part of `make setup` because GitHub exposes no API for them. Get
them wrong and the demo *appears* to work while quietly needing a human in the
lane that is supposed to have none.

1. **A fine-grained PAT**, stored as `COPILOT_GITHUB_TOKEN`,
   `GH_AW_GITHUB_TOKEN` and `DEMO_PAT`. See the README for the exact
   permissions. A `gh auth token` OAuth token **will not work** — the agentic
   engine rejects `gho_` tokens outright. `make doctor` fingerprints this.
2. **Settings → Copilot → Cloud agent → "Require approval for workflow runs" →
   OFF.** Left on, every agent pull request parks at *action_required* and the
   automated lane needs someone to press a button. `make doctor` infers it.
3. **Check the PAT's expiry** before a big session. When it lapses, triage
   fails at its first step and nothing downstream ever starts.

### T-24 hours

```bash
make setup     # idempotent: labels, ruleset, Pages, auto-merge, baseline tag
make doctor    # must print "Ready to demo"
```

Then do a **complete dry run**. Seed `ui`, watch it merge and deploy, then
`make reset`. Never present this cold — you want to know today's latency.

### T-30 minutes

```bash
make reset     # clean slate
make doctor    # green
```

Open these tabs in this order and leave them open:

1. `https://pakbaz.github.io/github-sdlc-e2e-demo/#/pipeline` — **the board**
2. `https://pakbaz.github.io/github-sdlc-e2e-demo/#/` — the store
3. The repository's **Issues** tab
4. The repository's **Actions** tab
5. A terminal running `make watch`

Zoom the browser to ~125%. The board is designed for that.

**Paste a token into the board before you start.** Open the *API budget* line
under the lane summary and paste any read-only GitHub token. Anonymous callers
get 60 API requests an hour; the board spends four per refresh, so without a
token it deliberately slows to roughly one refresh every four minutes to avoid
going dark. With a token it refreshes every 20 seconds and cards visibly move
while you talk. This is the single highest-value thing on this checklist.

### Fallbacks

| If | Do |
| --- | --- |
| Triage is slow (>3 min) | Keep talking through §3. It always lands. |
| The coding agent stalls | You seeded five issues; switch to one that moved. |
| A run fails | Show the failure — it is *more* convincing. Then re-run it. |
| Pages is stale | The board reads the API directly; it is still live. |
| The board seems frozen | Check the *API budget* line. If it says it is polling every few minutes, you are anonymous — paste a token. |
| A card reaches **Merged** but never **Deployed** | `DEMO_PAT` is missing. GitHub completes an auto-merge with the token that enabled it, and `GITHUB_TOKEN` pushes do not trigger workflows. Run `gh workflow run "Deploy to Pages" --ref main`. `make doctor` catches this beforehand. |
| The store still shows the bug after a deploy | Your browser is serving the cached page — Pages sets `max-age=600` on `index.html`. The dashboard notices this itself and offers a **Reload** button; otherwise hard-reload (`Cmd/Ctrl+Shift+R`). |
| Copilot opens a PR then the run dies instantly | The `copilot` repository environment is missing — the agent's session targets it. `gh api -X PUT repos/OWNER/REPO/environments/copilot`, or just re-run `make setup`. `make doctor` catches this beforehand. |
| Nothing dispatches at all — no runs, no checks | Check [githubstatus.com](https://www.githubstatus.com). During an Actions incident every lane stalls; the board and the store stay up because they read the REST API directly. |
| An issue is fully labelled but nothing picks it up | A `labeled` webhook was dropped. `gh workflow run "Dispatch to Copilot" -f issue=NN` re-runs the handoff; it is idempotent. |
| You filed an issue and no triage run started at all | The issue was created by a bot or by the default `GITHUB_TOKEN`, which does not fire `on: issues`. File it as yourself (`gh issue create`, the web form, or `make seed-auto`). Nothing re-triggers a missed `opened` event except closing and reopening the issue. |
| The agent's PR sits in draft after it finishes | `agent-pr-ready.yml` promotes it within 5 minutes. To skip the wait: `gh workflow run "Agent PR ready" -f pr=NN`, or just `gh pr ready NN`. |
| You fixed a workflow on `main` but the open agent PR still misbehaves | `pull_request` runs execute the workflow file **from the pull request's head branch**, not from `main`. A branch the agent cut before your fix keeps running the old version until it is rebased. `workflow_dispatch` and `schedule` always run from `main` — that is exactly what the 5-minute sweep is for. |
| A run on a `copilot/*` branch says *action_required* | "Require approval for workflow runs" is still on — see the once-per-account list above. Unblock this run by approving it in the Actions tab, then fix the setting before the next one. |
| Everything breaks | `make status` in the terminal shows the same state. |

---

## 0:00 – 0:05 · The claim

Open on the **store**, not on GitHub.

> "This is a storefront. It's deployed, it's live, and it has bugs in it. In
> the next hour, GitHub is going to fix some of them without me, and refuse to
> fix others without me. I want you to watch which is which — because the
> answer is not what most people guess."

Point at the cart badge: **it says 2, and there are 5 items in the cart.**

Point at the order summary and do the arithmetic on screen:

```
88.67 − 8.87 + 6.58 + 7.95 = 94.33     but the total says $94.34
```

> "One of these is cosmetic. The other one means we charged this customer the
> wrong amount. Which one do you think needs my approval to fix?"

Let them answer. Most rooms say the money bug. **Hold that thought.**

---

## 0:05 – 0:08 · File the two issues

You file two issues here: **`ui`** (cart badge) and **`checkout`** (money bug).
Nothing else. Whichever route you take, three things must hold or the demo
breaks:

1. **Apply no labels.** Not `area/*`, not `priority/*`, not `risk/*`. The whole
   point is that a machine decided them. The only label allowed is `demo`, and
   that exists solely so `reset.sh` can clean up.
2. **Assign nobody.** `dispatch-to-copilot.yml` does the handoff once triage
   applies `agent/triaged`. Assigning by hand short-circuits the stage you are
   trying to show.
3. **The issue must be created by a user token.** Issues created with the
   default `GITHUB_TOKEN` do not fire `on: issues`, so triage never starts.
   This is why `demo-seed.yml` uses `DEMO_PAT`. See the note in that workflow.

### Option A — type it live (highest credibility, ~2 min of talking)

Issues → **New issue** → **Bug report**. Type the short version below, not the
full text from `demo/scenarios/`. The seeded bodies are written for the triage
agent, not for a projector, and typing one live is three minutes of dead air.
Triage only needs enough to locate the code.

**Issue 1 — title:**

```
Cart badge shows the wrong number of items
```

| Field | Type this |
| --- | --- |
| What is broken? | `The cart badge counts distinct products, not items. Three of the same mug still shows 1.` |
| `Reproduction` | `1. Open the store``  /  ``2. Set Cirrus Ceramic Mug to 3``  /  ``3. Set Drift Merino Socks to 2``  /  ``4. Look at the cart badge` |
| Expected behaviour | `The badge reads 5. The screen-reader label should say "Cart, 1 item", not "Cart, 1 items".` |
| Customer impact | **Cosmetic — nobody is blocked** |
| Suspected area | leave blank — let it find the file itself |

Leaving *Suspected area* blank is worth doing deliberately. It makes the
*Evidence* section you read aloud at 0:18 much stronger: nobody told it where
to look.

**Issue 2 — title:**

```
Order total is off by a cent on multi-item carts
```

| Field | Type this |
| --- | --- |
| What is broken? | `The order summary does not add up. The total we charge is one cent higher than the lines we show the customer.` |
| Reproduction | `1. Open the store` / `2. Set Cirrus Ceramic Mug to 3` / `3. Set Drift Merino Socks to 2` / `4. Read the order summary: 88.67 - 8.87 + 6.58 + 7.95 = 94.33, but the total says 94.34` |
| Expected behaviour | `The printed receipt must satisfy total === subtotal - discount + tax + shipping, for every cart.` |
| Customer impact | **Critical — customers are losing money, data, or access** |
| Suspected area | leave blank |

Say the impact dropdowns out loud as you pick them — *Cosmetic* for one,
*Critical* for the other. That contrast is what makes the triage result land
eight minutes later, because the **Critical** one is the one that ships itself.

### Option B — prefilled, one click, still visibly you (recommended)

Same result, no typing, and the audience still watches a human press **Submit**.
Run this before you go on stage; it opens two browser tabs with the fields
already filled:

```bash
gh issue create --repo pakbaz/github-sdlc-e2e-demo --web \
  --title "Cart badge shows the wrong number of items" \
  --body "The cart badge counts distinct products, not items — three of the same mug still shows 1.

Repro: open the store, set Cirrus Ceramic Mug to 3 and Drift Merino Socks to 2. The badge reads 2; it should read 5. The screen-reader label says \"Cart, 1 items\"."

gh issue create --repo pakbaz/github-sdlc-e2e-demo --web \
  --title "Order total is off by a cent on multi-item carts" \
  --body "The order summary does not add up. With 3 mugs and 2 socks the printed lines are 88.67 - 8.87 + 6.58 + 7.95 = 94.33, but the total reads \$94.34.

The receipt must satisfy total === subtotal - discount + tax + shipping for every cart."
```

`--web` opens the new-issue page with title and body filled and submits
nothing. You click **Submit new issue** on stage. Note it bypasses the *Bug
report* form and uses the plain editor — that is fine, triage reads free prose.

If you would rather keep the structured form on screen, GitHub also prefills
issue forms from query parameters keyed by the field ids in
`.github/ISSUE_TEMPLATE/bug_report.yml` (`summary`, `reproduction`, `expected`,
`impact`, `area`):

```
/issues/new?template=bug_report.yml&title=…&summary=…&reproduction=…&impact=Cosmetic%20%E2%80%94%20nobody%20is%20blocked
```

Build those two URLs once and bookmark them.

### Option C — fully scripted (zero typing, least dramatic)

```bash
make seed-auto        # files ui + checkout, `demo` label only
```

or Actions → **Demo · seed scenarios** → `auto-lane`. Use this if you are short
on time, presenting without a terminal, or recovering from a failed run
mid-session. The cost is that the room did not see you author anything, so say
out loud what the script did: *"that filed two issues with one label on them —
`demo` — and nothing else."*

### "Can I use the Agents tab to file these for me?"

**Not for this step, no.** The Agents tab (`github.com/copilot/agents`) starts
the coding agent from a prompt and it opens a **pull request**. It does not
open an issue. Going that way skips the issue entirely, and with it triage,
labelling and `dispatch-to-copilot` — which is to say it skips the three stages
that constitute the argument you are making. The rest of the hour has nothing
to point at.

The distinction is worth stating plainly if someone asks:

| Route | What GitHub decides | Demo value |
| --- | --- | --- |
| Issue → triage → dispatch → PR | the lane, from the diff | **the whole demo** |
| Agents tab → PR | nothing upstream; only `policy-gate` and CODEOWNERS still apply | a good 90-second bonus |

That bonus is real, though, and it is the strongest answer to \*"fine, but what
if someone skips your pipeline?"\* If you have time at 0:52, open the Agents tab,
give it *"remove the expiry check from src/features/auth/session.ts"*, and let
the room watch the resulting pull request hit the same gate. The guardrail is in
`CODEOWNERS` and the ruleset, not in the workflow that happened to create the
branch — so entering from a different door changes nothing.

Copilot can also open issues for you conversationally, and that *does* preserve
the pipeline because the issue is created as you. But it costs you the moment:
what the room remembers is you typing three sentences and touching nothing else
for the next fifty minutes.

### After filing, either way

Switch to the **pipeline board**. Two cards appear in **Filed**, unlabelled.

> "That's my entire job in this demo. Two issues. No labels, no assignee, no
> priority. Watch what happens."

Then leave them alone.

> "Now, while those work, let me show you what's about to make the decision."

---

## 0:08 – 0:18 · The policy

Switch to the **Policy** page in the app.

> "Priority decides how fast we care. Risk decides who has to say yes."

Walk the table. Land these three points:

1. **Risk is a property of the path, not of the urgency.** Read the `auth` row
   and the `checkout` row next to each other.
2. **Some paths have no owner on purpose.** That is not laziness; that is the
   decision.
3. **`.github/` is high risk.** Anything that can edit the pipeline can turn
   off its own guardrails.

Now open `.github/CODEOWNERS` on GitHub and read it out. Then Settings →
Rules → `demo-main-gate` and show the two lines:

```
Required approvals: 0
Require review from Code Owners: ✅
```

> "Read those together. Zero approvals — *unless* the diff touches an owned
> path. That's the whole routing mechanism. There is no `if` statement anywhere
> that decides whether a robot may merge. GitHub decides, from the diff."

**Check the board.** Triage has almost certainly finished by now.

---

## 0:18 – 0:26 · Triage, in its own words

Open the cart-badge issue. Read the **triage comment** aloud — especially the
*Because* column and the *Evidence* section.

> "It didn't guess. It grepped the repository, found `src/features/ui/cart.ts`,
> read `CODEOWNERS`, and worked out that nobody owns that directory."

Now open the **money bug** and read its triage.

> "`priority/P0`. Customers are being charged wrong. And… `risk/low`. `route/auto`.
>
> That's the answer to the question I asked you at the start. The urgent one
> ships itself. Not because it doesn't matter — because it's a pure function
> with unit tests around it and a blast radius of exactly one file."

This is the moment the demo is built around. Do not rush it.

Then show the `dispatch-to-copilot` comment — **🟢 Routed to the automated
lane** — and the issue now assigned to Copilot.

---

## 0:26 – 0:34 · Seed the gated lane, then talk

Trigger the gated scenarios so they run in the background:

```bash
make seed-gated      # auth, infra, api
```

or Actions → **Demo · seed scenarios** → `gated-lane`.

While those triage, cover the architecture (`demo/ARCHITECTURE.md`; the
line-by-line detail is in `demo/AGENTIC-WORKFLOWS.md` if the room pushes):

- **Agentic workflows are read-only.** Show the compiled `.lock.yml` — an agent
  job with `read-all`, and a *separate* `safe_outputs` job that holds the write
  token. The model never has write access; it *requests* operations from a
  declared allow-list.
- **`add-labels` has an allow-list.** A prompt-injected agent cannot invent a
  label, let alone push code.
- **The coding model matches the work.** `dispatch-to-copilot.yml` assigns the
  coding agent without forcing a model, so Copilot cloud agent retains Auto
  selection and can match the model to implementation complexity. Do not
  confuse that with the two `gh-aw` workflows: on the current `gh-aw` v0.81.6,
  `model: auto`, `model: agent`, and the former bare engine default have all
  compiled successfully and then failed after runtime model changes. They pin
  the currently supported `claude-sonnet-5` model explicitly.
- **The reviewer cannot approve.** Show the frontmatter:
  `allowed-events: [COMMENT, REQUEST_CHANGES]`. Two agents cannot approve each
  other into production.

By now the first Copilot pull request should be open. Check the board.

---

## 0:34 – 0:44 · The automated lane ships itself

Open the Copilot pull request for the cart badge.

Walk the audience through it in this order:

1. **The diff** — small, scoped, one file.
2. **The regression test it added** — this is the part people don't expect.
3. **The bot comment marking it ready** — the agent opened a *draft* and left
   it in draft when it finished. A draft cannot auto-merge, so
   `agent-pr-ready.yml` promoted it. Worth 15 seconds: this is the one seam in
   the "no humans" claim, and naming it before someone else spots it is what
   makes the rest of the claim believable.
4. **The `policy-gate` comment** — 🟢 Automated lane, the changed-paths list,
   *"Auto-merge has been enabled."*
5. **The agentic review** — findings, and the footer saying it cannot approve.
6. **The merge box** — "0 of 0 required reviews", auto-merge armed, waiting for
   `verify`.

Then watch `verify` go green and **the pull request merges by itself**.

> "Nobody clicked anything."

Follow the deploy in Actions, then **hard-refresh the store**. The badge now
reads **5**.

If the money-bug PR is also ready, do the same — and re-do the arithmetic on
screen. It now adds up.

> "A P0 money bug went from an issue I typed to production, correctly, with a
> test, in about eight minutes, and no human read the code."

---

## 0:44 – 0:54 · The gate holds

Open the **auth** pull request.

1. **`policy-gate` comment** — 🛑 Human gate. *"At least one path is owned…
> Auto-merge was deliberately not enabled."*
2. **The merge box** — *"Review required — at least one approving review is
   required by reviewers with write access."* The button is **disabled**.
3. **The agentic review** — it has real findings, it may have requested
   changes, and it explicitly says it cannot approve.

> "Same agent. Same pipeline. Same P0 priority as the money bug. Different
> directory — and now it can't ship."

Now make the point that lands hardest:

> "Watch this. I'm going to try to break my own rule."

Show that even you, as repository owner, see the gate. Then **approve it**, and
watch the merge and deploy happen instantly.

> "That's the whole thing. The agent did the work. A human made the decision.
> And the decision point was chosen by *where the code lives*, which I decided
> once, in a file, months before this bug existed."

Optionally open the **infra** PR too — Terraform, public bucket, gated — to show
the policy is not auth-specific.

---

## 0:54 – 1:00 · Reset, and close

Run reset in front of them:

```bash
make reset
```

or Actions → **Demo · reset**.

> "Everything you just saw is reproducible. That's `demo-baseline` — the bugs
> come back, and I can run this again in the next session."

Show `make doctor` printing **Ready to demo**.

Close on the three ideas, not on the tooling:

1. **Risk is a property of the path.** Decide it once, in `CODEOWNERS`, when
   nobody is under pressure.
2. **Urgency is not a safety signal.** Gating on P0 means your riskiest changes
   get the *least* scrutiny, exactly when you can least afford it.
3. **Put the gate in the platform, not in the prompt.** A rule an agent can
   edit is not a rule. `CODEOWNERS` plus a ruleset cannot be argued with.

> "The question was never 'should agents be allowed to merge?' It was 'which
> changes need a human?' — and you already answered that when you decided which
> directories you'd be nervous about."

---

## Audience interaction points

| Time | Prompt |
| --- | --- |
| 0:04 | "Which of these two bugs needs my approval?" — most say the money bug |
| 0:12 | "Which directory in *your* repo would you never let a robot touch?" |
| 0:22 | "Was the triage right? Would you have labelled it the same way?" |
| 0:40 | "Is anyone uncomfortable that nobody read that diff? Why?" |
| 0:52 | "What would you have to change about your repo to run this on Monday?" |

## If you only have 30 minutes

Skip the gated-lane seeding at 0:26 and the infra PR. Seed `ui` and `auth`
only, at the very start, and go: claim (5) → policy (7) → triage (5) → auto
lane ships (7) → gate holds (6).

## If you have no network

`demo/POLICY.md`, `demo/ARCHITECTURE.md` and screenshots of a previous run
carry the argument. The idea survives without the live run — but the live run
is what makes people believe it.
