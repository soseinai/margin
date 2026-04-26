set dotenv-load := true

# Show available commands.
default:
    @just --list

# Install JavaScript workspace dependencies.
setup:
    npm install

# Print local dev commands.
dev:
    @echo "Run these in separate terminals:"
    @echo "  just dev-api"
    @echo "  just dev-web"

# Start the Rust API on http://127.0.0.1:4317.
dev-api:
    cargo run -p margin-api

# Start the Svelte web app on http://127.0.0.1:5173.
dev-web:
    npm run dev:web

# Start the Tauri desktop app.
dev-desktop:
    npm run dev:desktop

# Run all standard checks.
check: check-rust check-web

# Typecheck/compile the Rust workspace.
check-rust:
    cargo check --workspace

# Typecheck the Svelte app.
check-web:
    npm --workspace @margin/web run check

# Run all tests.
test: test-rust test-web

# Run Rust tests.
test-rust:
    cargo test --workspace

# Run web unit/property tests.
test-web:
    npm run test:web

# Build the API and web app for local deploy.
build: build-api build-web

# Build the Rust API in debug mode.
build-api:
    cargo build -p margin-api

# Build the Rust API in release mode.
build-api-release:
    cargo build -p margin-api --release

# Build the Svelte web app.
build-web:
    npm run build:web

# Build the Tauri desktop app.
build-desktop:
    npm run build:desktop

# Build every distributable target.
build-all: build build-desktop

# Generate TypeScript API types from the running API OpenAPI endpoint.
api-types:
    npm run generate:api

# Run SQLx migrations against DATABASE_URL.
db-migrate:
    sqlx migrate run --source backend/migrations

# Deploy target. Supported today: local.
deploy target="local":
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{target}}" in
      local)
        just deploy-local
        ;;
      staging|prod|production)
        echo "Remote deploy target '{{target}}' is not configured yet."
        echo "Add the hosting-specific release command to the justfile when infrastructure exists."
        exit 2
        ;;
      *)
        echo "Unknown deploy target '{{target}}'. Supported today: local."
        exit 2
        ;;
    esac

# Produce local deployment artifacts.
deploy-local: build-web build-api-release
    @echo "Local deploy artifacts are ready:"
    @echo "  API binary: target/release/margin-api"
    @echo "  Web assets: apps/web/dist"

# Remove generated build artifacts.
clean:
    cargo clean
    rm -rf apps/web/dist apps/desktop/src-tauri/target
