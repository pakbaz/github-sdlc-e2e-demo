#!/usr/bin/env bash
#
# check-workflows.sh — syntax-check the shell inside every GitHub workflow.
#
# GitHub Actions only discovers a broken `run:` block when the job reaches it,
# which in this repository meant finding out that a deploy was broken *after*
# the merge. YAML validity is not enough: a `run: |` block scalar can parse
# perfectly and still contain shell that cannot run — a heredoc whose opening
# delimiter lost its newline, for instance, which is exactly the bug that
# shipped a broken Pages deploy.
#
# This extracts every `run:` block from every workflow and runs `bash -n` over
# it. It is fast, needs no runner, and catches the whole class.
#
set -euo pipefail
cd "$(dirname "$0")/../.."

# PyYAML ships with the GitHub runner images, but not with every developer's
# python. Install it quietly rather than failing with an ImportError.
if ! python3 -c 'import yaml' 2>/dev/null; then
  python3 -m pip install --quiet --disable-pip-version-check pyyaml >/dev/null 2>&1 \
    || { echo "check-workflows: PyYAML is required (pip install pyyaml)"; exit 1; }
fi

fail=0

for wf in .github/workflows/*.yml; do
  # Compiled gh-aw lock files are generated; if their source is fine, they are.
  case "$wf" in *.lock.yml) continue ;; esac

  if out=$(python3 scripts/ci/workflow_shell_check.py "$wf" 2>&1); then
    printf '\033[32m✓\033[0m %s\n' "$wf"
  else
    printf '\033[31m✗\033[0m %s\n' "$wf"
    printf '%s\n' "$out" | sed 's/^/    /'
    fail=1
  fi
done

expected_agentic_model="claude-sonnet-5"
for workflow in triage pr-review; do
  source=".github/workflows/${workflow}.md"
  lock=".github/workflows/${workflow}.lock.yml"

  if grep -Fq "  model: ${expected_agentic_model}" "$source" \
    && grep -Fq "\"agent_model\":\"${expected_agentic_model}\"" "$lock" \
    && grep -Fq "COPILOT_MODEL: ${expected_agentic_model}" "$lock" \
    && ! grep -Fq "claude-sonnet-4.6" "$lock"; then
    printf '\033[32m✓\033[0m %s model pin\n' "$workflow"
  else
    printf '\033[31m✗\033[0m %s model pin\n' "$workflow"
    printf '    Recompile with model %s; retired defaults must not reach the lock file.\n' \
      "$expected_agentic_model"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  printf '\nWorkflow checks failed.\n'
  exit 1
fi

printf '\nAll workflow checks passed.\n'
