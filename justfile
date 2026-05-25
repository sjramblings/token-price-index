# token-price-index -- task runner

# Default: list available recipes
default:
    just --list

# Install dependencies via bun
install:
    bun install

# Fetch all sources, normalize to data/current.json, write daily snapshot, verify, diff
refresh:
    bun scripts/FetchLiteLLM.ts && bun scripts/FetchOpenRouter.ts && bun scripts/FetchAwsPriceList.ts && bun scripts/FetchAzureRetail.ts && bun scripts/Normalize.ts && bun scripts/Verify.ts && bun scripts/Diff.ts

# Run schema and invariant checks on data/current.json
verify:
    bun scripts/Verify.ts

# Cut a vYYYY.MM.DD GitHub Release if content changed (used by CI)
release:
    bun scripts/BuildRelease.ts

# Report whether a release would be cut, without cutting one
release-dryrun:
    bun scripts/BuildRelease.ts --dry-run

# Run the dashboard SPA in dev mode (Vite)
dev:
    cd dashboard && bun run dev

# Build the dashboard SPA for GitHub Pages deployment
build:
    cd dashboard && bun run build

# Run unit tests via bun test
test:
    bun test

# Compute one of the indices defined under indices/members/ (e.g. just index atpi-replica)
index NAME:
    bun scripts/ComputeIndex.ts {{NAME}}

# Compute every index defined under indices/members/
index-all:
    @for spec in indices/members/*.json; do \
        name=$(basename "$spec" .json); \
        echo "--- $name ---"; \
        bun scripts/ComputeIndex.ts "$name"; \
    done
