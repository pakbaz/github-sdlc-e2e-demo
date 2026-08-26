#!/usr/bin/env bash
#
# doctor.sh — pre-flight check. Run this before every demo.
#
# Exits non-zero if anything that would break the demo on stage is wrong.
#
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=lib.sh
. scripts/demo/lib.sh

need_gh

PROBLEMS=0
bad() { fail "$1"; PROBLEMS=$((PROBLEMS + 1)); }

title "Pre-flight for $REPO"

# ── Tooling ──────────────────────────────────────────────────────────────────
step "Tooling"
ok "gh $(gh --version | head -1 | awk '{print $3}') as $(gh api user --jq .login)"
if gh aw version >/dev/null 2>&1; then
  ok "gh-aw $(gh aw version 2>/dev/null | head -1)"
else
  bad "gh-aw extension missing — gh extension install githubnext/gh-aw"
fi
if command -v node >/dev/null 2>&1; then
  ok "node $(node --version)"
else
  bad "node is not installed"
fi

# ── Secrets ──────────────────────────────────────────────────────────────────
step "Secrets"
secrets=$(gh secret list --repo "$REPO" --json name --jq '.[].name' 2>/dev/null || true)
have_pat=1
for s in COPILOT_GITHUB_TOKEN GH_AW_GITHUB_TOKEN DEMO_PAT; do
  if echo "$secrets" | grep -qxF "$s"; then
    ok "$s"
  else
    case "$s" in
      COPILOT_GITHUB_TOKEN) bad "$s is not set — the triage and review agents cannot run" ;;
      GH_AW_GITHUB_TOKEN)   bad "$s is not set — agent output will not trigger downstream CI" ;;
      DEMO_PAT)             bad "$s is not set — auto-merged changes will never deploy"; have_pat=0 ;;
    esac
  fi
done

# The secret's *value* cannot be read back, but the engine rejects OAuth tokens
# outright, so the last completed triage run tells us whether the right kind of
# token is stored.
last_triage=$(gh api "repos/$REPO/actions/workflows/triage.lock.yml/runs?per_page=1&status=completed" \
  --jq '.workflow_runs[0].id' 2>/dev/null || true)
if [ -n "${last_triage:-}" ] && [ "$last_triage" != "null" ]; then
  guard=$(gh api "repos/$REPO/actions/runs/$last_triage/jobs" \
    --jq '[.jobs[].steps[]? | select(.conclusion == "failure") | .name] | join(" ")' 2>/dev/null || true)
  case "$guard" in
    *"Validate COPILOT_GITHUB_TOKEN"*)
      bad "the last triage run was rejected at the token guard — COPILOT_GITHUB_TOKEN must be a fine-grained PAT (github_pat_...), not the OAuth token from 'gh auth token'" ;;
  esac
fi

# ── Repository settings ──────────────────────────────────────────────────────
step "Repository settings"
repo_json=$(gh api "repos/$REPO")
[ "$(echo "$repo_json" | jq -r .allow_auto_merge)" = "true" ] \
  && ok "auto-merge enabled" || bad "auto-merge is disabled — the auto lane cannot ship"
[ "$(echo "$repo_json" | jq -r .has_issues)" = "true" ] \
  && ok "issues enabled" || bad "issues are disabled"
[ "$(echo "$repo_json" | jq -r .private)" = "false" ] \
  && ok "public (the dashboard reads the API anonymously)" \
  || warn "private — the dashboard will need a token pasted in"

perms=$(gh api "repos/$REPO/actions/permissions/workflow" 2>/dev/null || echo '{}')
[ "$(echo "$perms" | jq -r .default_workflow_permissions)" = "write" ] \
  && ok "Actions have write permissions" \
  || bad "Actions are read-only — workflows cannot label or comment"

# ── Ruleset — the gate ───────────────────────────────────────────────────────
step "Branch ruleset (this is the gate)"
rs=$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name == "demo-main-gate") | .id' 2>/dev/null || true)
if [ -z "$rs" ]; then
  bad "demo-main-gate ruleset is missing — run setup.sh"
else
  detail=$(gh api "repos/$REPO/rulesets/$rs")
  [ "$(echo "$detail" | jq -r .enforcement)" = "active" ] \
    && ok "demo-main-gate is active" || bad "demo-main-gate exists but is not active"

  pr_rule=$(echo "$detail" | jq '.rules[] | select(.type == "pull_request") | .parameters')
  if [ -n "$pr_rule" ]; then
    approvals=$(echo "$pr_rule" | jq -r .required_approving_review_count)
    codeowner=$(echo "$pr_rule" | jq -r .require_code_owner_review)
    [ "$approvals" = "0" ] \
      && ok "required approvals = 0 (so unowned paths need nobody)" \
      || bad "required approvals = $approvals — the auto lane will be blocked"
    [ "$codeowner" = "true" ] \
      && ok "code owner review required (so owned paths need a human)" \
      || bad "code owner review is not required — the human gate is open"
  else
    bad "demo-main-gate has no pull_request rule"
  fi

  checks=$(echo "$detail" | jq -r '.rules[] | select(.type == "required_status_checks")
            | .parameters.required_status_checks[].context' 2>/dev/null || true)
  echo "$checks" | grep -qxF "verify" \
    && ok "'verify' is a required status check" \
    || warn "'verify' is not required — merges will not wait for CI"

  bypass=$(echo "$detail" | jq -r '.bypass_actors | length')
  [ "$bypass" -gt 0 ] \
    && ok "$bypass bypass actor(s) — reset.sh can restore main" \
    || warn "no bypass actors — reset.sh cannot rewrite main"
fi

# ── CODEOWNERS ───────────────────────────────────────────────────────────────
step "CODEOWNERS"
if [ -f .github/CODEOWNERS ]; then
  for p in /src/features/auth/ /src/features/api/ /infra/ /.github/; do
    grep -q "^$p" .github/CODEOWNERS && ok "$p is owned" || bad "$p has no owner"
  done
  for p in "src/features/ui/" "src/features/checkout/"; do
    grep -qE "^/?$p" .github/CODEOWNERS \
      && bad "$p IS owned — the automated lane will be blocked" \
      || ok "$p is deliberately unowned"
  done
else
  bad ".github/CODEOWNERS is missing"
fi

# ── Labels ───────────────────────────────────────────────────────────────────
step "Labels"
have=$(gh label list --repo "$REPO" --limit 200 --json name --jq '.[].name' || true)
missing=0
while IFS='|' read -r name _ _; do
  [ -n "$name" ] || continue
  echo "$have" | grep -qxF "$name" || { missing=$((missing + 1)); info "missing: $name"; }
done < <(demo_labels)
[ "$missing" -eq 0 ] && ok "all $(demo_labels | wc -l | tr -d ' ') labels present" \
  || bad "$missing label(s) missing — run setup.sh"

# ── Workflows ────────────────────────────────────────────────────────────────
step "Workflows on the default branch"
wf=$(gh api "repos/$REPO/actions/workflows" --jq '.workflows[] | [.name, .state] | @tsv' 2>/dev/null || true)
for expect in "Risk-based issue triage" "Agentic pull request review" "Dispatch to Copilot" "ci" "Policy gate" "Deploy to Pages"; do
  line=$(echo "$wf" | grep -iF "$expect" | head -1 || true)
  if [ -z "$line" ]; then
    bad "workflow '$expect' is not on main"
  elif echo "$line" | grep -q "active"; then
    ok "$expect"
  else
    bad "$expect is $(echo "$line" | cut -f2)"
  fi
done

# ── Copilot coding agent ─────────────────────────────────────────────────────
step "Copilot coding agent"
assignable=$(gh api graphql \
  -H 'GraphQL-Features: issues_copilot_assignment_api_support' \
  -f query='query($o:String!,$n:String!){repository(owner:$o,name:$n){
      suggestedActors(capabilities:[CAN_BE_ASSIGNED],first:100){nodes{login}}}}' \
  -f o="$OWNER" -f n="$NAME" \
  --jq '.data.repository.suggestedActors.nodes[].login' 2>/dev/null || true)
echo "$assignable" | grep -qxF "copilot-swe-agent" \
  && ok "copilot-swe-agent is assignable" \
  || bad "copilot-swe-agent is NOT assignable — check the Copilot subscription"

# The agent opens its pull request and *then* dies without this environment,
# so the failure looks like a broken agent rather than a missing setting.
if gh api "repos/$REPO/environments/copilot" >/dev/null 2>&1; then
  ok "'copilot' environment exists"
else
  bad "'copilot' environment is missing — the agent will open a PR then fail instantly"
fi

# There is no API for Settings → Copilot → Cloud agent → "Require approval for
# workflow runs", but leaving it on stalls every agent PR at `action_required`
# — which silently turns the "no humans touch this" lane into a lane that needs
# a human to click a button. Infer it from the last run on an agent branch.
stalled=$(gh api "repos/$REPO/actions/runs?per_page=40" \
  --jq '[.workflow_runs[]
         | select(.head_branch | startswith("copilot/"))
         | select(.conclusion == "action_required")] | length' 2>/dev/null || echo 0)
if [ "${stalled:-0}" -gt 0 ]; then
  bad "$stalled workflow run(s) on agent branches are waiting for approval — turn OFF 'Require approval for workflow runs' in Settings → Copilot → Cloud agent, or the automated lane needs a human after all"
else
  ok "agent pull requests run CI without approval"
fi

# ── Pages ────────────────────────────────────────────────────────────────────
step "GitHub Pages"
if pages=$(gh api "repos/$REPO/pages" 2>/dev/null); then
  url=$(echo "$pages" | jq -r .html_url)
  ok "$url"
  [ "$(echo "$pages" | jq -r .build_type)" = "workflow" ] \
    && ok "source: GitHub Actions" || warn "source is not GitHub Actions"
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url" || echo 000)
  [ "$code" = "200" ] && ok "site responds 200" || warn "site returned HTTP $code"
else
  bad "Pages is not enabled — run setup.sh"
fi

# ── Baseline ─────────────────────────────────────────────────────────────────
step "Baseline"
if sha=$(gh api "repos/$REPO/git/ref/tags/$BASELINE_TAG" --jq '.object.sha' 2>/dev/null); then
  ok "$BASELINE_TAG → ${sha:0:7}"

  # reset.sh restores src/, infra/ and tests/ from this tag, so the tag has to
  # be the state where the defects still exist. Move it onto a post-demo main
  # — an easy mistake, because moving a baseline tag forward feels like
  # housekeeping — and reset silently starts restoring the *fixed* code. The
  # next demo then triages an issue describing a bug that is not there, the
  # coding agent finds nothing to do, and it all falls apart in front of an
  # audience.
  #
  # Every planted defect is marked with a `BUG:` comment, so counting them at
  # the tag is a cheap, direct test of "is there still something to fix".
  planted=0
  for file in src/features/ui/cart.ts src/features/auth/session.ts \
              src/features/checkout/total.ts src/features/api/client.ts \
              infra/main.tf; do
    if gh api "repos/$REPO/contents/$file?ref=$BASELINE_TAG" \
         --jq '.content' 2>/dev/null | base64 --decode 2>/dev/null \
         | grep -q 'BUG:'; then
      planted=$((planted + 1))
    else
      warn "no planted defect in $file at $BASELINE_TAG"
    fi
  done

  if [ "$planted" -eq 5 ]; then
    ok "all 5 scenarios still have their defect at $BASELINE_TAG"
  else
    bad "$BASELINE_TAG has only $planted/5 planted defects — reset.sh would restore already-fixed code and the demo would have nothing to fix. Point the tag back at a commit that still carries the defects."
  fi
else
  bad "$BASELINE_TAG tag is missing — reset.sh cannot restore"
fi

# ── Production ───────────────────────────────────────────────────────────────
# GitHub completes an auto-merge with whichever token enabled it, and pushes
# made with the default GITHUB_TOKEN do not trigger workflows. Without DEMO_PAT
# the automated lane therefore merges but never deploys, and the board shows a
# "Deployed" column that production never actually reaches. Catch that here
# rather than in front of an audience.
step "Production"
main_sha=$(gh api "repos/$REPO/git/ref/heads/main" --jq '.object.sha' 2>/dev/null || echo "")
deployed_sha=$(gh run list --repo "$REPO" --workflow "Deploy to Pages" \
  --status success --limit 1 --json headSha --jq '.[0].headSha' 2>/dev/null || echo "")

if [ -z "$main_sha" ] || [ -z "$deployed_sha" ]; then
  warn "could not determine what is deployed"
elif [ "$main_sha" = "$deployed_sha" ]; then
  ok "production matches main (${main_sha:0:7})"
else
  bad "production is at ${deployed_sha:0:7} but main is at ${main_sha:0:7}"
  info "fix: gh workflow run 'Deploy to Pages' --repo $REPO --ref main"
  [ "$have_pat" -eq 0 ] && info "root cause: DEMO_PAT is unset, so auto-merges do not trigger the deploy"
fi

# ── Clean slate ──────────────────────────────────────────────────────────────
step "Clean slate"
open_demo=$(gh issue list --repo "$REPO" --state open --label "$DEMO_LABEL" \
  --json number --jq 'length' 2>/dev/null || echo 0)
open_prs=$(gh pr list --repo "$REPO" --state open --json number --jq 'length' 2>/dev/null || echo 0)
[ "$open_demo" = "0" ] && ok "no open demo issues" \
  || warn "$open_demo open demo issue(s) — run reset.sh for a clean start"
[ "$open_prs" = "0" ] && ok "no open pull requests" \
  || warn "$open_prs open pull request(s) — run reset.sh for a clean start"

# ── Verdict ──────────────────────────────────────────────────────────────────
if [ "$PROBLEMS" -eq 0 ]; then
  title "Ready to demo"
  printf '  %shttps://%s.github.io/%s/#/pipeline%s\n\n' "$BOLD" "$OWNER" "$NAME" "$RESET"
  exit 0
else
  title "$PROBLEMS problem(s) found"
  printf '  Most are fixed by %s./scripts/demo/setup.sh%s\n\n' "$BOLD" "$RESET"
  exit 1
fi
