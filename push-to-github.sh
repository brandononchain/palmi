#!/usr/bin/env bash
# ==============================================================================
# palmi: first push to GitHub
# ------------------------------------------------------------------------------
# This script expects to be run ONCE, from the palmi/ directory, by the repo
# owner, on a machine where GitHub auth is already configured (either via
# `gh auth login` or an SSH key).
#
# Usage:
#   bash push-to-github.sh
#
# What it does:
#   1. Verifies you're in a palmi git repo with commits
#   2. Creates the GitHub repo (brandononchain/palmi) via gh CLI if it doesn't
#      exist, OR adds the remote if it does
#   3. Pushes main
#   4. Prints the URL to visit
# ==============================================================================

set -euo pipefail

REPO="brandononchain/palmi"
REPO_URL="https://github.com/${REPO}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { printf "${BLUE}›${NC} %s\n" "$1"; }
ok()    { printf "${GREEN}✓${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}!${NC} %s\n" "$1"; }
fail()  { printf "${RED}✗${NC} %s\n" "$1"; exit 1; }

# ---- Sanity checks -----------------------------------------------------------

[[ -d .git ]] || fail "Not in a git repo. cd into the palmi/ directory first."

if [[ ! -f README.md ]] || [[ ! -f supabase/migrations/001_schema.sql ]]; then
  fail "This doesn't look like the palmi repo (missing README or schema)."
fi

commit_count=$(git rev-list --count HEAD 2>/dev/null || echo 0)
[[ "$commit_count" -gt 0 ]] || fail "No commits yet. Run this after the initial commits."

current_branch=$(git symbolic-ref --short HEAD)
info "Working in branch: ${current_branch} with ${commit_count} commits"

# ---- Decide: gh CLI or raw git? ----------------------------------------------

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  info "Using GitHub CLI (authenticated)"
  USE_GH=1
else
  warn "gh CLI not authenticated (or not installed). Falling back to git push."
  warn "Make sure you have an SSH key uploaded to GitHub, OR set up a Personal Access Token."
  USE_GH=0
fi

# ---- Ensure remote -----------------------------------------------------------

if git remote get-url origin >/dev/null 2>&1; then
  existing_url=$(git remote get-url origin)
  info "Remote 'origin' already set: ${existing_url}"
  if [[ "$existing_url" != *"${REPO}"* ]]; then
    warn "Remote doesn't match ${REPO}."
    read -p "Overwrite? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git remote set-url origin "git@github.com:${REPO}.git"
      ok "Remote updated to ${REPO}"
    else
      fail "Aborted."
    fi
  fi
else
  info "Adding remote..."
  git remote add origin "git@github.com:${REPO}.git"
  ok "Remote set: git@github.com:${REPO}.git"
fi

# ---- Create the repo on GitHub (if needed) -----------------------------------

if [[ "$USE_GH" -eq 1 ]]; then
  if gh repo view "${REPO}" >/dev/null 2>&1; then
    info "Repo ${REPO} already exists on GitHub"
  else
    info "Creating repo ${REPO} on GitHub (private)..."
    gh repo create "${REPO}" \
      --private \
      --description "a quiet place for your people" \
      --source=. \
      --remote=origin \
      --disable-wiki \
      2>&1 | grep -v "^$" || true
    ok "Repo created"
  fi
else
  warn "Skipping repo creation — please create ${REPO_URL} manually, then re-run."
  warn "Or install gh and run: gh auth login"
  warn ""
  warn "If the empty repo already exists, the push below will populate it."
fi

# ---- Push --------------------------------------------------------------------

info "Pushing ${current_branch} to origin..."
if git push -u origin "${current_branch}" 2>&1; then
  ok "Pushed successfully"
else
  fail "Push failed. See errors above. Common fixes:
  - Authenticate gh:   gh auth login
  - Or use HTTPS+PAT:  git remote set-url origin https://<TOKEN>@github.com/${REPO}.git
  - Or set up SSH:     https://docs.github.com/en/authentication/connecting-to-github-with-ssh"
fi

# ---- Done --------------------------------------------------------------------

echo
ok "palmi is now on GitHub"
echo
echo "  → ${REPO_URL}"
echo
echo "Next steps:"
echo "  1. Visit the repo and confirm the commit history looks right"
echo "  2. Add any secrets/env vars you need via repo settings"
echo "  3. Follow README.md → 'Getting started' to deploy"
echo
