# shellcheck shell=bash

load_margin_sosein_e2e_env() {
  local config_file="${MARGIN_SOSEIN_E2E_ENV_FILE:-$HOME/.config/margin/sosein-e2e.env}"

  if [[ -f "$config_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$config_file"
    set +a
  fi

  export MARGIN_SOSEIN_LIVE_URL="${MARGIN_SOSEIN_LIVE_URL:-https://api-staging.sosein.ai}"
  export MARGIN_SOSEIN_E2E_ENV_FILE="$config_file"
}
