# Nimbus Store — Agentic SDLC demo
#
#   make help     what you can do
#   make doctor   pre-flight before presenting
#   make seed     start a demo run
#   make reset    return to a clean state

SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help install dev build test lint typecheck e2e verify \
        doctor setup seed seed-auto seed-gated reset reseed status open

## ── Demo ────────────────────────────────────────────────────────────────────

doctor: ## Pre-flight check. Run before every demo.
	@./scripts/demo/doctor.sh

setup: ## Configure the repository (idempotent): labels, ruleset, Pages, auto-merge.
	@./scripts/demo/setup.sh

seed: ## File all five scenario issues.
	@./scripts/demo/seed.sh all

seed-auto: ## File only the automated-lane scenarios (ui, checkout).
	@./scripts/demo/seed.sh ui checkout

seed-gated: ## File only the human-gate scenarios (auth, infra, api).
	@./scripts/demo/seed.sh auth infra api

reset: ## Close demo issues/PRs, delete agent branches, restore the baseline.
	@./scripts/demo/reset.sh

reseed: ## Reset and immediately seed again.
	@./scripts/demo/reset.sh --seed

status: ## Show the live pipeline state in the terminal.
	@./scripts/demo/status.sh

watch: ## Live-refreshing pipeline state.
	@./scripts/demo/status.sh --watch

open: ## Open the deployed dashboard in a browser.
	@open "https://pakbaz.github.io/github-sdlc-e2e-demo/#/pipeline" 2>/dev/null || \
	 xdg-open "https://pakbaz.github.io/github-sdlc-e2e-demo/#/pipeline"

## ── App ─────────────────────────────────────────────────────────────────────

install: ## Install dependencies.
	@npm ci

dev: ## Run the app locally with hot reload.
	@npm run dev

build: ## Production build.
	@npm run build

lint: ## Lint.
	@npm run lint

typecheck: ## Typecheck.
	@npm run typecheck

test: ## Unit tests.
	@npm test

e2e: ## Browser tests.
	@npm run e2e

verify: lint typecheck test build ## Everything CI runs, except the browser tests.
	@echo "✓ lint · typecheck · unit · build"

## ── Workflows ───────────────────────────────────────────────────────────────

compile: ## Recompile the agentic workflows after editing frontmatter.
	@gh aw compile

help: ## Show this help.
	@echo ""
	@echo "  Nimbus Store · Agentic SDLC demo"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2}'
	@echo ""
