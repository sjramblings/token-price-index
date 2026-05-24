# token-price-index -- task runner

# Default: list available recipes
default:
    just --list

# Install dependencies via bun
install:
    bun install

# Fetch all sources, normalize to data/current.json, write daily snapshot, verify
# Placeholder for PR #1; PR #2 will replace package script with real fetchers.
refresh:
    bun run refresh

# Run schema and invariant checks on data/current.json
# Placeholder for PR #1; PR #2 will replace package script with real checks.
verify:
    bun run verify

# Cut a vYYYY.MM.DD GitHub Release if content changed (used by CI)
# Placeholder for PR #1; PR #3 will replace package script with release automation.
release:
    echo 'PR #3 will fill this in'

# Report whether a release would be cut, without cutting one
# Placeholder for PR #1; PR #3 will replace package script with release automation.
release-dryrun:
    echo 'PR #3 will fill this in'

# Run the dashboard SPA in dev mode (Vite)
# Placeholder for PR #1; PR #4 will add the dashboard package.
dev:
    bun run dev

# Build the dashboard SPA for GitHub Pages deployment
# Placeholder for PR #1; PR #4 will add the dashboard package.
build:
    bun run build
