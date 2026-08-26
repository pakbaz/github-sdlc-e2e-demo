#!/usr/bin/env bash
#
# seed.sh — file the demo issues.
#
#   ./scripts/demo/seed.sh              # all five scenarios
#   ./scripts/demo/seed.sh ui           # just the automated-lane opener
#   ./scripts/demo/seed.sh auth infra   # just the gated ones
#
# Filing an issue is the only manual step in the entire demo. Everything after
# it — triage, labelling, routing, fixing, reviewing, merging, deploying — is
# driven by GitHub.
#
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=lib.sh
. scripts/demo/lib.sh

need_gh

ALL=(ui checkout auth infra api)
if [ $# -eq 0 ] || [ "${1:-}" = "all" ]; then
  WANTED=("${ALL[@]}")
else
  WANTED=("$@")
fi

title "Seeding $REPO"

for id in "${WANTED[@]}"; do
  file="demo/scenarios/$id.md"
  if [ ! -f "$file" ]; then
    fail "unknown scenario '$id' (expected one of: ${ALL[*]})"
    exit 1
  fi

  # First line is the title, second is a `---` separator, the rest is the body.
  issue_title=$(head -1 "$file")
  tail -n +3 "$file" > /tmp/seed-body.md

  cat >> /tmp/seed-body.md <<EOF

---

<sub>Seeded by \`scripts/demo/seed.sh $id\`. Labelled \`demo\` so
\`reset.sh\` can clean it up. **No labels were applied by hand** — whatever
appears on this issue was decided by the triage agent.</sub>
EOF

  # Only the `demo` label. The triage agent must derive everything else, live.
  url=$(gh issue create --repo "$REPO" \
    --title "$issue_title" \
    --body-file /tmp/seed-body.md \
    --label "$DEMO_LABEL")

  ok "$id → $url"
  rm -f /tmp/seed-body.md

  # Stagger so the triage runs queue in a readable order on screen.
  [ ${#WANTED[@]} -gt 1 ] && sleep 3
done

printf '\n'
info "Triage usually starts within ~30s and finishes in 1–3 minutes."
info "Watch: gh run watch --repo $REPO   or   the pipeline board."
printf '  %shttps://%s.github.io/%s/#/pipeline%s\n\n' "$BOLD" "$OWNER" "$NAME" "$RESET"
