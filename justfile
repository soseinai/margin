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
    @echo "  just dev-desktop"
    @echo "  just dev-web"

# Start the Svelte web app on http://127.0.0.1:5173.
dev-web:
    npm run dev:web

# Start the Tauri desktop app.
dev-desktop: setup
    npm run dev:desktop

# Initialize the Tauri iOS target files and dependencies.
ios-init:
    npm run ios:init

# Start the iOS app on a simulator or connected iPhone.
dev-ios device="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ -n "{{device}}" ]]; then
      npm run ios:dev -- "{{device}}"
    else
      npm run ios:dev
    fi

# Open the generated iOS project in Xcode for simulator/device runs.
open-ios:
    npm run ios:open

# Build the iOS app. Use target=aarch64-sim for Apple Silicon simulators.
build-ios target="aarch64-sim":
    npm run ios:build -- --target "{{target}}"

# Build the desktop app bundle and launch it locally. Optionally open a file or folder path.
run path="": build-desktop
    #!/usr/bin/env bash
    set -euo pipefail
    app="target/release/bundle/macos/Margin.app"
    arg="{{path}}"
    if [[ -n "$arg" ]]; then
      case "$arg" in
        margin://*|file://*|/*)
          open "$app" --args "$arg"
          ;;
        *)
          open "$app" --args "$PWD/$arg"
          ;;
      esac
    else
      open "$app"
    fi

# Run all standard checks.
check: format-rust-check check-rust lint-rust check-web

# Check Rust formatting.
format-rust-check:
    cargo fmt --all -- --check

# Typecheck/compile the Rust desktop workspace.
check-rust:
    cargo check --workspace

# Lint the Rust desktop workspace.
lint-rust:
    cargo clippy --workspace --all-targets -- -D warnings

# Typecheck the Svelte app.
check-web:
    npm --workspace @margin/web run check

# Run all tests.
test: test-rust test-web

# Run Rust tests.
test-rust:
    cargo test --workspace

# Run web unit and integration tests.
test-web: test-web-unit test-web-integration

# Run web unit/property tests.
test-web-unit:
    npm run test:web:unit

# Run web browser integration tests.
test-web-integration:
    npm run test:web:integration

# Run web end-to-end tests. Empty by design for now.
test-web-e2e:
    npm run test:web:e2e

# Install Playwright browsers for web integration tests.
setup-web-integration:
    npm --workspace @margin/web exec playwright -- install chromium

# Run all web tests through the package script.
test-web-all:
    npm run test:web

# Build the web app for local deploy.
build: build-web

# Build the Svelte web app.
build-web: setup
    npm run build:web

# Build the Tauri desktop app.
build-desktop: setup icons
    npm run build:desktop

# Package the desktop app as an unsigned macOS .app bundle.
package-mac-app: setup icons
    npm run package:mac:app

# Package the desktop app as an unsigned macOS DMG.
package-mac-dmg: setup icons
    npm run package:mac:dmg

# Build every distributable target.
build-all: build build-desktop

# Refresh desktop and web icon assets from Margin identity assets.
icons:
    #!/usr/bin/env bash
    set -euo pipefail
    source_icon="${MARGIN_MACOS_ICON_SOURCE:-$HOME/Documents/sosein/identity/assets/margin.icon}"
    source_svg="${MARGIN_FAVICON_SOURCE:-$HOME/Documents/sosein/identity/assets/margin-icon.svg}"
    icons_dir="apps/desktop/src-tauri/icons"
    fingerprint_file="$icons_dir/.source-fingerprint"
    desktop_icon="$icons_dir/icon.icon"
    desktop_svg="$icons_dir/margin-icon.svg"
    favicon_svg="apps/web/public/favicon.svg"
    favicon_ico="apps/web/public/favicon.ico"
    desktop_ico="apps/desktop/src-tauri/icons/icon.ico"
    assets_car="$icons_dir/Assets.car"
    recipe_version="icons-v2"
    ictool="/Applications/Icon Composer.app/Contents/Executables/ictool"

    hash_file() {
      shasum -a 256 "$1" | awk '{print $1}'
    }

    hash_directory() {
      (
        cd "$1"
        find . -type f -print | LC_ALL=C sort | while IFS= read -r file; do
          shasum -a 256 "$file"
        done | shasum -a 256 | awk '{print $1}'
      )
    }

    icon_fingerprint() {
      local source_icon_hash source_svg_hash
      source_icon_hash="$(hash_directory "$source_icon")"

      if [[ -f "$source_svg" ]]; then
        source_svg_hash="$(hash_file "$source_svg")"
      else
        source_svg_hash="missing"
      fi

      {
        echo "recipe=$recipe_version"
        echo "source_icon=$source_icon_hash"
        echo "source_svg=$source_svg_hash"
      } | shasum -a 256 | awk '{print $1}'
    }

    outputs_ready=true
    required_outputs=(
      "$desktop_icon/icon.json"
      "$desktop_icon/Assets/Letter.svg"
      "$assets_car"
      "$icons_dir/icon.icns"
      "$icons_dir/icon.ico"
      "$icons_dir/icon.png"
      "$icons_dir/32x32.png"
      "$icons_dir/128x128.png"
      "$icons_dir/128x128@2x.png"
      "$favicon_ico"
    )

    if [[ -f "$source_svg" || -f "$desktop_svg" || -f "$favicon_svg" ]]; then
      required_outputs+=("$desktop_svg" "$favicon_svg")
    fi

    for output in "${required_outputs[@]}"; do
      if [[ ! -e "$output" ]]; then
        outputs_ready=false
        break
      fi
    done

    if [[ "$outputs_ready" == true && ! -d "$source_icon" ]]; then
      echo "Icon source not found; using existing generated icon assets."
      echo "Set MARGIN_MACOS_ICON_SOURCE=/path/to/margin.icon and run 'just icons' to refresh them."
      exit 0
    fi

    if [[ "$outputs_ready" == true && -f "$fingerprint_file" ]]; then
      current_fingerprint="$(icon_fingerprint)"
      cached_fingerprint="$(tr -d '[:space:]' < "$fingerprint_file")"

      if [[ "$current_fingerprint" == "$cached_fingerprint" ]]; then
        echo "Icon assets are up to date."
        exit 0
      fi
    fi

    if [[ ! -d "$source_icon" ]]; then
      echo "macOS icon source not found: $source_icon" >&2
      echo "Set MARGIN_MACOS_ICON_SOURCE=/path/to/margin.icon to use a different source." >&2
      exit 1
    fi

    if [[ ! -x "$ictool" ]]; then
      echo "Icon Composer CLI not found: $ictool" >&2
      exit 1
    fi

    actool="$(xcrun --find actool 2>/dev/null || true)"

    if [[ -z "$actool" || ! -x "$actool" ]]; then
      echo "Xcode actool not found. Install full Xcode and run:" >&2
      echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
      exit 1
    fi

    exported_icon_base="$(mktemp "${TMPDIR:-/tmp}/margin-icon.XXXXXX")"
    exported_icon="$exported_icon_base.png"
    asset_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/margin-assets-car.XXXXXX")"
    asset_plist="$asset_tmp_dir/assetcatalog_generated_info.plist"
    trap 'rm -f "$exported_icon_base" "$exported_icon"; rm -rf "$asset_tmp_dir"' EXIT

    rm -rf "$icons_dir"
    mkdir -p "$icons_dir"
    cp -R "$source_icon" "$desktop_icon"
    "$ictool" "$desktop_icon" --export-image --output-file "$exported_icon" --platform macOS --rendition Default --width 1024 --height 1024 --scale 1
    npm install
    npm --workspace @margin/desktop run tauri -- icon "$exported_icon"
    "$actool" "$desktop_icon" \
      --compile "$asset_tmp_dir" \
      --output-format human-readable-text \
      --notices --warnings --errors \
      --output-partial-info-plist "$asset_plist" \
      --app-icon icon \
      --include-all-app-icons \
      --enable-on-demand-resources NO \
      --development-region en \
      --target-device mac \
      --minimum-deployment-target 26.0 \
      --platform macosx
    cp "$asset_tmp_dir/Assets.car" "$assets_car"

    if [[ -f "$source_svg" ]]; then
      cp "$source_svg" "$desktop_svg"
      cp "$desktop_svg" "$favicon_svg"
    else
      echo "Favicon SVG source not found: $source_svg" >&2
      echo "Leaving existing SVG favicon assets unchanged." >&2
    fi

    cp "$desktop_ico" "$favicon_ico"
    icon_fingerprint > "$fingerprint_file"

    echo "Refreshed icon assets:"
    echo "  macOS icon source: $desktop_icon"
    echo "  Liquid Glass asset catalog: $assets_car"
    echo "  Desktop icons: apps/desktop/src-tauri/icons"
    echo "  SVG favicon source: $source_svg"
    echo "  Favicons: $favicon_svg, $favicon_ico"

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
deploy-local: build-web
    @echo "Local deploy artifacts are ready:"
    @echo "  Web assets: apps/web/dist"

# Remove generated build artifacts.
clean:
    cargo clean
    rm -rf apps/web/dist apps/desktop/src-tauri/target apps/desktop/src-tauri/gen/apple/build
