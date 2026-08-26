"""Check that every `run:` block in a workflow is valid shell.

Usage: python3 workflow_shell_check.py .github/workflows/ci.yml

Exits non-zero and prints a diagnostic for each broken block.
"""

import subprocess
import sys

import yaml


def main(path: str) -> int:
    try:
        docs = [d for d in yaml.safe_load_all(open(path)) if d]
    except yaml.YAMLError as exc:
        print(f"YAML: {exc}")
        return 1

    if len(docs) != 1:
        # A `---` at column 0 inside a heredoc silently starts a second
        # document, and everything after it stops being part of the workflow.
        print(f"parsed as {len(docs)} YAML documents, expected 1")
        return 1

    bad = 0
    for job_name, job in (docs[0].get("jobs") or {}).items():
        for index, step in enumerate(job.get("steps") or []):
            script = step.get("run")
            if not script:
                continue

            label = step.get("name") or f"step {index}"
            shell = (step.get("shell") or "bash").split()[0]
            if shell not in ("bash", "sh"):
                continue

            proc = subprocess.run(
                [shell, "-n"], input=script, text=True, capture_output=True
            )
            if proc.returncode != 0:
                bad += 1
                print(f"{job_name} / {label}: {proc.stderr.strip()}")

    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
