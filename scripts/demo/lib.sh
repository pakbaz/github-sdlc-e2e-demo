#!/usr/bin/env bash
# Shared helpers for the demo scripts. Source this, do not execute it.

set -euo pipefail

REPO="${DEMO_REPO:-pakbaz/github-sdlc-e2e-demo}"
OWNER="${REPO%%/*}"
NAME="${REPO#*/}"
BASELINE_TAG="${DEMO_BASELINE_TAG:-demo-baseline}"
DEMO_LABEL="demo"

# Everything this demo creates carries the `demo` label, so reset can be
# aggressive without ever touching real content in the repository.

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

ok()    { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()  { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
fail()  { printf '  %s✗%s %s\n' "$RED" "$RESET" "$*"; }
info()  { printf '  %s·%s %s\n' "$DIM" "$RESET" "$*"; }
step()  { printf '\n%s%s%s\n' "$BOLD" "$*" "$RESET"; }
title() {
  printf '\n%s%s%s\n' "$BOLD$BLUE" "$*" "$RESET"
  printf '%s%s%s\n' "$DIM" "$(printf '─%.0s' $(seq 1 ${#1}))" "$RESET"
}

need_gh() {
  command -v gh >/dev/null 2>&1 || {
    fail "GitHub CLI (gh) is not installed."; exit 1;
  }
  gh auth status >/dev/null 2>&1 || {
    fail "Not authenticated. Run: gh auth login"; exit 1;
  }
}

confirm() {
  [ "${DEMO_YES:-}" = "1" ] && return 0
  printf '%s%s%s [y/N] ' "$BOLD" "$1" "$RESET"
  read -r reply </dev/tty || return 1
  case "$reply" in [yY]*) return 0 ;; *) return 1 ;; esac
}

# ── The label vocabulary the whole pipeline agrees on ────────────────────────
# name|colour|description
demo_labels() {
  cat <<'EOF'
area/ui|1f6feb|Presentation layer. No code owner.
area/checkout|1f6feb|Money maths. No code owner.
area/auth|1f6feb|Identity and sessions. Code owner required.
area/api|1f6feb|Shared HTTP transport. Code owner required.
area/infra|1f6feb|Infrastructure as code. Code owner required.
area/pipeline|1f6feb|The automation itself. Code owner required.
area/docs|1f6feb|Prose only.
priority/P0|b60205|Customers are losing money, access or data. Fix today.
priority/P1|d93f0b|Broken workflow or real security weakness. Fix this week.
priority/P2|fbca04|Degraded, with a workaround. Fix this month.
priority/P3|0e8a16|Cosmetic or nice to have.
risk/low|0e8a16|Small blast radius. No code owner. Ships automatically.
risk/medium|d4a72c|Shared surface. A human must approve.
risk/high|b60205|Identity, infrastructure or the pipeline. A human must approve.
route/auto|0e8a16|Agent fixes, CI passes, auto-merge ships it.
route/human-gate|b60205|Blocked at the merge button until a code owner approves.
agent/triaged|8250df|Triaged by the agentic workflow. Handoff to the coding agent.
needs-human-review|b60205|A code owner must approve before this can merge.
demo|586069|Created by the demo. Safe for reset to delete.
EOF
}
