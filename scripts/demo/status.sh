#!/usr/bin/env bash
#
# status.sh — the presenter's terminal view of the live pipeline.
#
#   ./scripts/demo/status.sh          # once
#   ./scripts/demo/status.sh --watch  # refresh every 10s
#
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=lib.sh
. scripts/demo/lib.sh

need_gh

render() {
  clear 2>/dev/null || true
  title "$REPO · $(date '+%H:%M:%S')"

  step "Issues"
  issues=$(gh issue list --repo "$REPO" --state open --limit 30 \
    --json number,title,labels,assignees \
    --jq '.[] | [
            .number,
            (.labels | map(.name) | map(select(startswith("risk/"))) | first // "—"),
            (.labels | map(.name) | map(select(startswith("priority/"))) | first // "—"),
            (.labels | map(.name) | map(select(startswith("route/"))) | first // "untriaged"),
            (.assignees | map(.login) | join(",") | if . == "" then "—" else . end),
            (.title[0:46])
          ] | @tsv' 2>/dev/null || true)

  if [ -z "$issues" ]; then
    info "none open"
  else
    printf '  %-5s %-13s %-13s %-18s %-18s %s\n' \
      "#" "RISK" "PRIORITY" "ROUTE" "ASSIGNEE" "TITLE"
    while IFS=$'\t' read -r n risk pri route who t; do
      [ -n "$n" ] || continue
      case "$risk" in
        risk/low)    c="$GREEN" ;;
        risk/medium) c="$YELLOW" ;;
        risk/high)   c="$RED" ;;
        *)           c="$DIM" ;;
      esac
      printf '  %-5s %s%-13s%s %-13s %-18s %-18s %s\n' \
        "$n" "$c" "$risk" "$RESET" "$pri" "$route" "$who" "$t"
    done <<< "$issues"
  fi

  step "Pull requests"
  prs=$(gh pr list --repo "$REPO" --state open --limit 30 \
    --json number,title,labels,statusCheckRollup,reviewDecision,autoMergeRequest \
    --jq '.[] | [
            .number,
            (.labels | map(.name) | map(select(startswith("route/"))) | first // "—"),
            ([.statusCheckRollup[]? | select(.conclusion != null) | .conclusion]
              | if length == 0 then "running"
                elif all(. == "SUCCESS") then "green" else "RED" end),
            (.reviewDecision // "none"),
            (if .autoMergeRequest then "auto-merge ON" else "—" end),
            (.title[0:40])
          ] | @tsv' 2>/dev/null || true)

  if [ -z "$prs" ]; then
    info "none open"
  else
    printf '  %-5s %-18s %-9s %-18s %-15s %s\n' \
      "#" "ROUTE" "CI" "REVIEW" "MERGE" "TITLE"
    while IFS=$'\t' read -r n route ci rev am t; do
      [ -n "$n" ] || continue
      case "$ci" in
        green)   c="$GREEN" ;;
        RED)     c="$RED" ;;
        *)       c="$YELLOW" ;;
      esac
      printf '  %-5s %-18s %s%-9s%s %-18s %-15s %s\n' \
        "$n" "$route" "$c" "$ci" "$RESET" "$rev" "$am" "$t"
    done <<< "$prs"
  fi

  step "Recent runs"
  gh run list --repo "$REPO" --limit 8 \
    --json displayTitle,workflowName,status,conclusion,createdAt \
    --jq '.[] | [.workflowName[0:28], (.conclusion // .status), .displayTitle[0:40]] | @tsv' \
    2>/dev/null | while IFS=$'\t' read -r wf st t; do
      case "$st" in
        success)                c="$GREEN" ;;
        failure|cancelled)      c="$RED" ;;
        *)                      c="$YELLOW" ;;
      esac
      printf '  %-30s %s%-13s%s %s\n' "$wf" "$c" "$st" "$RESET" "$t"
    done || info "none"

  step "Production"
  if pages=$(gh api "repos/$REPO/pages" 2>/dev/null); then
    url=$(echo "$pages" | jq -r .html_url)
    printf '  %s%s%s\n' "$BOLD" "$url" "$RESET"
    dep=$(gh api "repos/$REPO/deployments?environment=github-pages&per_page=1" \
      --jq '.[0].created_at // empty' 2>/dev/null || true)
    [ -n "$dep" ] && info "last deployed $dep"
  else
    info "Pages not enabled"
  fi
  printf '\n'
}

if [ "${1:-}" = "--watch" ]; then
  while true; do render; sleep 10; done
else
  render
fi
