# Nimbus Store — instructions for coding agents

You are working in the demo repository for a **GitHub Agentic SDLC** talk. A
human presenter drives this repository live in front of an audience, so the
most valuable thing you can do is produce a small, correct, well-explained
change that a reviewer can understand in thirty seconds.

## What this repository is

A deliberately imperfect Vite + React + TypeScript storefront (`Nimbus Store`)
deployed to GitHub Pages, plus a live SDLC dashboard that visualises this
repository's own issues, pull requests and workflow runs.

Several defects are **planted on purpose**. Each one is the subject of a seeded
demo issue. Fix only the defect the issue names.

## Commands

```bash
npm ci               # install
npm run lint         # eslint
npm run typecheck    # tsc -b
npm test             # vitest unit tests
npm run build        # production build
npm run e2e          # Playwright browser tests (builds + previews first)
```

All five must pass. `ci.yml` runs exactly these.

## The rule that governs this repository

> **Priority decides how fast we care. Risk decides who has to say yes.**

Risk is a property of *where* a change lands, not how urgent it is:

| Paths | Risk | Code owner | What happens to your PR |
|---|---|---|---|
| `src/features/ui/`, `src/features/checkout/`, `src/features/dashboard/`, `src/styles/`, `tests/`, `demo/` | low | none | Merges and deploys automatically once CI is green |
| `src/features/api/` | medium | required | Blocked until a human approves |
| `src/features/auth/`, `infra/`, `.github/`, build config | high | required | Blocked until a human approves |

This is enforced by `.github/CODEOWNERS` plus the `main` branch ruleset. You
cannot bypass it, and you should not try.

## Rules

1. **Stay inside the area the issue names.** If the issue is about the cart
   badge, do not also refactor the checkout module. Widening the diff into an
   owned path turns an automatic merge into a blocked one, which breaks the
   demo.
2. **Never edit `.github/`** unless the issue explicitly asks you to. Editing
   the pipeline is how automation disables its own guardrails.
3. **Add a regression test that fails before your change and passes after.**
   Put unit tests in `tests/unit/`, browser tests in `tests/e2e/`. This is the
   single most important thing you can do — the presenter shows the test.
4. **Do not weaken existing tests** to make them pass, and do not delete the
   `DEMO NOTE` comments that explain why a test is written loosely.
5. **Keep the diff small.** No dependency additions, no reformatting, no
   drive-by renames.
6. **Write the PR description for a reviewer under time pressure**: what was
   broken, the concrete reproduction, what you changed, how you proved it.

## Money

Currency arithmetic must be exact. Accumulate in integer minor units (cents)
and round once at each monetary boundary. Never let floating-point error reach
a total. The printed receipt must always satisfy:

```
total === subtotal - discount + tax + shipping
```

## Auth

Session validation must consider expiry, and parsing persisted state must
validate its shape before trusting it. Never widen a session's lifetime or
scopes to make a test pass.

## Style

- TypeScript strict mode; no `any`.
- Comment only what needs clarifying. The existing `DEMO NOTE` blocks explain
  intent — match that register when you add one.
- Prefer pure functions with unit tests over logic embedded in components.
- Accessibility matters: keep `aria-label`s accurate, and remember that
  `Cart, 1 items` is a bug.
