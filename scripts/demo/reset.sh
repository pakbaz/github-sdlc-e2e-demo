#!/usr/bin/env bash
#
# reset.sh — return the repository to its pristine demo state.
#
#   ./scripts/demo/reset.sh              # reset
#   ./scripts/demo/reset.sh --seed       # reset, then seed all five scenarios
#   DEMO_YES=1 ./scripts/demo/reset.sh   # no confirmation prompt
#
# Safe by construction: every artefact the demo creates carries the `demo`
# label or lives on a `copilot/*` branch, so reset never touches real content.
#
# Source files are restored from the `demo-baseline` tag, which means the
# planted defects come back exactly as they were and the demo can be run again
# from zero.
#
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=lib.sh
. scripts/demo/lib.sh

need_gh

RESEED=0
[ "${1:-}" = "--seed" ] && RESEED=1

title "Resetting $REPO"

if ! confirm "Close all demo issues and PRs, delete copilot branches, and restore src/ and infra/ from $BASELINE_TAG?"; then
  info "Cancelled."
  exit 0
fi

# ── 1. Cancel anything still running ─────────────────────────────────────────
step "1. In-flight workflow runs"
runs=$(gh run list --repo "$REPO" --limit 60 \
  --json databaseId,status \
  --jq '.[] | select(.status == "in_progress" or .status == "queued" or .status == "waiting") | .databaseId' || true)
if [ -z "$runs" ]; then
  ok "nothing running"
else
  n=0
  for id in $runs; do
    gh run cancel "$id" --repo "$REPO" >/dev/null 2>&1 && n=$((n + 1)) || true
  done
  ok "cancelled $n run(s)"
fi

# ── 2. Close demo pull requests ──────────────────────────────────────────────
step "2. Pull requests"
# Only pull requests the demo itself created: an agent branch, or one carrying
# the demo label. A human's in-progress work in this repository is left alone,
# which is what makes this script safe to run without reading it first.
prs=$(gh pr list --repo "$REPO" --state open --limit 100 \
  --json number,headRefName,labels \
  --jq '.[] | select((.headRefName | test("^(copilot/|agentic-|demo-fix/)"))
                     or ([.labels[].name] | index("'"$DEMO_LABEL"'")))
        | [.number, .headRefName] | @tsv' || true)
if [ -z "$prs" ]; then
  ok "no demo pull requests open"
else
  while IFS=$'\t' read -r num branch; do
    [ -n "$num" ] || continue
    gh pr close "$num" --repo "$REPO" --delete-branch >/dev/null 2>&1 \
      && ok "closed #$num ($branch)" \
      || warn "could not close #$num"
  done <<< "$prs"
fi

# ── 3. Close demo issues ─────────────────────────────────────────────────────
step "3. Issues"
issues=$(gh issue list --repo "$REPO" --state open --limit 100 \
  --label "$DEMO_LABEL" --json number --jq '.[].number' || true)
if [ -z "$issues" ]; then
  ok "no open demo issues"
else
  for num in $issues; do
    gh issue close "$num" --repo "$REPO" --reason "not planned" >/dev/null 2>&1 \
      && ok "closed #$num" || warn "could not close #$num"
  done
fi

# Closing is not enough to clear the board. An issue that actually *shipped* is
# closed and has a merged pull request, so the dashboard is right to keep
# showing it in "Deployed" — which means every previous demo's cards pile up in
# the last column and the next run starts on a board that is already full.
# Archiving is the explicit signal that a card belongs to a finished run, and
# the board drops anything carrying it. Applied to closed issues too, so the
# ones that shipped during the last demo are retired along with the rest.
archived=0
for num in $(gh issue list --repo "$REPO" --state all --limit 100 \
  --label "$DEMO_LABEL" --json number,state --jq '.[] | select(.state == "CLOSED") | .number' || true); do
  gh issue edit "$num" --repo "$REPO" --add-label "$ARCHIVED_LABEL" >/dev/null 2>&1 \
    && archived=$((archived + 1)) || true
done
[ "$archived" -eq 0 ] && ok "no cards to retire from the board" \
  || ok "retired $archived card(s) from the pipeline board"

# gh-aw files an issue when an agentic run fails; clear those too so the board
# is clean for the next run.
aw=$(gh issue list --repo "$REPO" --state open --limit 100 \
  --search 'in:title "Agentic workflow"' --json number --jq '.[].number' || true)
for num in $aw; do
  gh issue close "$num" --repo "$REPO" --reason "not planned" >/dev/null 2>&1 || true
done

# ── 4. Delete agent branches ─────────────────────────────────────────────────
step "4. Agent branches"
branches=$(gh api "repos/$REPO/branches?per_page=100" --jq '.[].name' 2>/dev/null || true)
n=0
for b in $branches; do
  case "$b" in
    copilot/*|"$OWNER"-copilot/*|agentic-*|demo-fix/*)
      gh api -X DELETE "repos/$REPO/git/refs/heads/$b" >/dev/null 2>&1 \
        && { ok "deleted $b"; n=$((n + 1)); } || true
      ;;
  esac
done
[ "$n" -eq 0 ] && ok "no agent branches to delete"

# ── 5. Restore the source tree from the baseline ─────────────────────────────
step "5. Source tree"
if ! gh api "repos/$REPO/git/ref/tags/$BASELINE_TAG" >/dev/null 2>&1; then
  warn "$BASELINE_TAG does not exist — run setup.sh first"
else
  base=$(gh api "repos/$REPO/git/ref/tags/$BASELINE_TAG" --jq '.object.sha')
  head=$(gh api "repos/$REPO/git/ref/heads/main" --jq '.object.sha')

  if [ "$base" = "$head" ]; then
    ok "main is already at the baseline (${base:0:7})"
  else
    # Compare only the paths the demo mutates. Documentation and workflow
    # improvements made since the baseline are deliberately preserved.
    changed=$(gh api "repos/$REPO/compare/$BASELINE_TAG...main" \
      --jq '.files[].filename' 2>/dev/null \
      | grep -E '^(src/|infra/|tests/)' || true)

    if [ -z "$changed" ]; then
      ok "no demo-owned files have drifted from the baseline"
    else
      info "restoring $(echo "$changed" | wc -l | tr -d ' ') file(s) to their baseline content"
      tmp=$(mktemp -d)

      # Start from main's current tree and overwrite only the drifted paths, so
      # documentation and workflow improvements made since the baseline survive.
      # This must be a *tree* sha, not a commit sha.
      head_tree=$(gh api "repos/$REPO/git/commits/$head" --jq '.tree.sha')
      entries=""
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        if content=$(gh api "repos/$REPO/contents/$f?ref=$BASELINE_TAG" \
              --jq '.content' 2>/dev/null); then
          echo "$content" | base64 --decode > "$tmp/blob"
          blob=$(gh api -X POST "repos/$REPO/git/blobs" \
            -f content="$(base64 < "$tmp/blob" | tr -d '\n')" \
            -f encoding=base64 --jq '.sha')
          entries="$entries{\"path\":\"$f\",\"mode\":\"100644\",\"type\":\"blob\",\"sha\":\"$blob\"},"
        else
          # File did not exist at baseline: delete it.
          entries="$entries{\"path\":\"$f\",\"mode\":\"100644\",\"type\":\"blob\",\"sha\":null},"
        fi
      done <<< "$changed"

      printf '{"base_tree":"%s","tree":[%s]}' "$head_tree" "${entries%,}" > "$tmp/tree.json"
      new_tree=$(gh api -X POST "repos/$REPO/git/trees" --input "$tmp/tree.json" --jq '.sha')

      if [ "$new_tree" = "$head_tree" ]; then
        ok "tree already matches the baseline"
      else
        commit=$(gh api -X POST "repos/$REPO/git/commits" \
          -f message="chore(demo): reset src/ and infra/ to $BASELINE_TAG" \
          -f tree="$new_tree" -f "parents[]=$head" --jq '.sha')
        gh api -X PATCH "repos/$REPO/git/refs/heads/main" -f sha="$commit" >/dev/null
        ok "main reset to the baseline via ${commit:0:7}"
        info "(uses the repository-admin bypass on the demo-main-gate ruleset)"
      fi
      rm -rf "$tmp"
    fi
  fi
fi

# ── 6. Clear stale routing labels ────────────────────────────────────────────
step "6. Labels"
ok "label vocabulary left in place (setup.sh owns it)"

# ── Done ─────────────────────────────────────────────────────────────────────
title "Reset complete"

if [ "$RESEED" -eq 1 ]; then
  ./scripts/demo/seed.sh all
else
  printf '  Run %s./scripts/demo/seed.sh%s to start another run.\n\n' "$BOLD" "$RESET"
fi
