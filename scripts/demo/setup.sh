#!/usr/bin/env bash
#
# setup.sh — make the repository ready to run the demo.
#
# Fully idempotent. Run it as many times as you like; it converges the
# repository onto the configuration the demo needs and reports what it changed.
#
#   ./scripts/demo/setup.sh
#
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=lib.sh
. scripts/demo/lib.sh

need_gh

title "Setting up $REPO"

# ── 1. Labels ────────────────────────────────────────────────────────────────
step "1. Label vocabulary"
existing=$(gh label list --repo "$REPO" --limit 200 --json name --jq '.[].name' || true)
created=0; updated=0
while IFS='|' read -r name colour desc; do
  [ -n "$name" ] || continue
  if echo "$existing" | grep -qxF "$name"; then
    gh label edit "$name" --repo "$REPO" --color "$colour" --description "$desc" >/dev/null 2>&1 \
      && updated=$((updated + 1)) || true
  else
    gh label create "$name" --repo "$REPO" --color "$colour" --description "$desc" >/dev/null 2>&1 \
      && created=$((created + 1)) || true
  fi
done < <(demo_labels)
ok "$created created, $updated reconciled"

# ── 2. Repository settings ───────────────────────────────────────────────────
step "2. Repository settings"

gh api -X PATCH "repos/$REPO" \
  -F allow_auto_merge=true \
  -F allow_squash_merge=true \
  -F delete_branch_on_merge=true \
  -F has_issues=true >/dev/null
ok "auto-merge, squash-merge and branch cleanup enabled"

gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true >/dev/null
ok "Actions granted write permissions and PR-approval capability"

# The Copilot coding agent runs its session in a repository environment named
# `copilot`. If it does not exist the agent still opens its pull request, then
# the run dies immediately with "Unable to fetch the information for the
# environment 'copilot'" — which looks like the agent failing rather than a
# missing setting. Creating it is idempotent.
if gh api -X PUT "repos/$REPO/environments/copilot" >/dev/null 2>&1; then
  ok "'copilot' environment exists (the coding agent needs it)"
else
  warn "could not create the 'copilot' environment"
  info "Settings → Environments → New environment → copilot"
fi

# ── 3. GitHub Pages ──────────────────────────────────────────────────────────
step "3. GitHub Pages"
if gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api -X PUT "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || true
  ok "already enabled (source: GitHub Actions)"
else
  if gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1; then
    ok "enabled with GitHub Actions as the source"
  else
    warn "could not enable Pages automatically"
    info "Settings → Pages → Source: GitHub Actions"
  fi
fi
info "https://$OWNER.github.io/$NAME/"

# ── 4. The branch ruleset — this IS the gate ─────────────────────────────────
step "4. Branch ruleset on main"
#
# The whole demo turns on this combination:
#
#   required_approving_review_count : 0     ← unowned paths need nobody
#   require_code_owner_review       : true  ← owned paths need their owner
#
# A pull request touching only unowned paths satisfies the rule with zero
# reviews and auto-merges. A pull request touching an owned path is blocked
# at the merge button until a code owner approves. GitHub enforces this, not
# a script — which is what makes the demo credible.
#
# The repository admin is granted bypass so reset.sh can restore main.

cat > /tmp/ruleset.json <<'JSON'
{
  "name": "demo-main-gate",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "require_code_owner_review": true,
        "dismiss_stale_reviews_on_push": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "automatic_copilot_code_review_enabled": false,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [{ "context": "verify" }]
      }
    }
  ]
}
JSON

existing_id=$(gh api "repos/$REPO/rulesets" \
  --jq '.[] | select(.name == "demo-main-gate") | .id' 2>/dev/null || true)

if [ -n "$existing_id" ]; then
  gh api -X PUT "repos/$REPO/rulesets/$existing_id" --input /tmp/ruleset.json >/dev/null
  ok "ruleset demo-main-gate updated (id $existing_id)"
else
  new_id=$(gh api -X POST "repos/$REPO/rulesets" --input /tmp/ruleset.json --jq '.id')
  ok "ruleset demo-main-gate created (id $new_id)"
fi
rm -f /tmp/ruleset.json
info "0 approvals required · code owner review required · 'verify' must pass"

# ── 5. Baseline tag ──────────────────────────────────────────────────────────
step "5. Baseline"
if gh api "repos/$REPO/git/ref/tags/$BASELINE_TAG" >/dev/null 2>&1; then
  sha=$(gh api "repos/$REPO/git/ref/tags/$BASELINE_TAG" --jq '.object.sha')
  ok "$BASELINE_TAG → ${sha:0:7}"
else
  head=$(gh api "repos/$REPO/git/ref/heads/main" --jq '.object.sha')
  gh api -X POST "repos/$REPO/git/refs" \
    -f ref="refs/tags/$BASELINE_TAG" -f sha="$head" >/dev/null
  ok "$BASELINE_TAG created at ${head:0:7}"
fi
info "reset.sh restores src/ and infra/ from this tag"

# ── 6. Secrets ───────────────────────────────────────────────────────────────
step "6. Secrets"
secrets=$(gh secret list --repo "$REPO" --json name --jq '.[].name' 2>/dev/null || true)
missing=0
for s in COPILOT_GITHUB_TOKEN GH_AW_GITHUB_TOKEN DEMO_PAT; do
  if echo "$secrets" | grep -qxF "$s"; then
    ok "$s"
  else
    fail "$s is not set"
    missing=$((missing + 1))
  fi
done

if [ "$missing" -gt 0 ]; then
  cat <<EOF

  ${YELLOW}One fine-grained PAT satisfies all three.${RESET}

    1. https://github.com/settings/personal-access-tokens/new
    2. Resource owner:            your user account
    3. Repository access:         only $REPO
    4. Repository permissions:    Contents RW, Issues RW, Pull requests RW,
                                  Actions RW, Workflows RW, Metadata R
    5. Account permissions:       Copilot Requests: Read
    6. Then:

       for s in COPILOT_GITHUB_TOKEN GH_AW_GITHUB_TOKEN DEMO_PAT; do
         gh secret set "\$s" --repo $REPO --body "github_pat_..."
       done

  It must be a fine-grained token (\`github_pat_…\`). gh-aw rejects the
  \`gho_\` OAuth token that \`gh auth login\` produces.
EOF
fi

# ── Done ─────────────────────────────────────────────────────────────────────
title "Setup complete"
printf '  Next: %s./scripts/demo/doctor.sh%s to verify, then %s./scripts/demo/seed.sh%s\n\n' \
  "$BOLD" "$RESET" "$BOLD" "$RESET"
