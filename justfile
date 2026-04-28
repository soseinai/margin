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
dev-desktop:
    npm run dev:desktop

# Build the desktop app bundle and launch it locally.
run: build-desktop
    open target/release/bundle/macos/Margin.app

# Run all standard checks.
check: check-rust check-web

# Typecheck/compile the Rust desktop workspace.
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

# Build the web app for local deploy.
build: build-web

# Build the Svelte web app.
build-web: setup
    npm run build:web

# Build the Tauri desktop app.
build-desktop: icons
    npm run build:desktop

# Package the desktop app as an unsigned macOS .app bundle.
package-mac-app: icons
    npm run package:mac:app

# Package the desktop app as an unsigned macOS DMG.
package-mac-dmg: icons
    npm run package:mac:dmg

# Build every distributable target.
build-all: build build-desktop

# Refresh desktop and web icon assets from Margin identity assets.
icons: setup
    #!/usr/bin/env bash
    set -euo pipefail
    source_icon="${MARGIN_MACOS_ICON_SOURCE:-$HOME/Documents/sosein/identity/assets/margin.icon}"
    source_svg="${MARGIN_FAVICON_SOURCE:-$HOME/Documents/sosein/identity/assets/margin-icon.svg}"
    icons_dir="apps/desktop/src-tauri/icons"
    desktop_icon="$icons_dir/icon.icon"
    desktop_svg="$icons_dir/margin-icon.svg"
    favicon_svg="apps/web/public/favicon.svg"
    favicon_ico="apps/web/public/favicon.ico"
    desktop_ico="apps/desktop/src-tauri/icons/icon.ico"
    assets_car="$icons_dir/Assets.car"
    ictool="/Applications/Icon Composer.app/Contents/Executables/ictool"
    actool="$(xcrun --find actool 2>/dev/null || true)"
    exported_icon_base="$(mktemp "${TMPDIR:-/tmp}/margin-icon.XXXXXX")"
    exported_icon="$exported_icon_base.png"
    asset_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/margin-assets-car.XXXXXX")"
    asset_plist="$asset_tmp_dir/assetcatalog_generated_info.plist"
    trap 'rm -f "$exported_icon_base" "$exported_icon"; rm -rf "$asset_tmp_dir"' EXIT

    if [[ ! -d "$source_icon" ]]; then
      echo "macOS icon source not found: $source_icon" >&2
      echo "Set MARGIN_MACOS_ICON_SOURCE=/path/to/margin.icon to use a different source." >&2
      exit 1
    fi

    if [[ ! -x "$ictool" ]]; then
      echo "Icon Composer CLI not found: $ictool" >&2
      exit 1
    fi

    if [[ -z "$actool" || ! -x "$actool" ]]; then
      echo "Xcode actool not found. Install full Xcode and run:" >&2
      echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
      exit 1
    fi

    rm -rf "$icons_dir"
    mkdir -p "$icons_dir"
    cp -R "$source_icon" "$desktop_icon"
    "$ictool" "$desktop_icon" --export-image --output-file "$exported_icon" --platform macOS --rendition Default --width 1024 --height 1024 --scale 1
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
    rm -rf apps/web/dist apps/desktop/src-tauri/target
