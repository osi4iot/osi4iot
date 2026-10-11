#!/usr/bin/env bash
set -euo pipefail

echo "########## entry_script (Grafana 12.3-ready) ##########"

# --- Helpers ---------------------------------------------------------------

export_from_file() {
  # Usage: export_from_file filepath VAR1 VAR2 ...
  local f="$1"; shift || true
  [[ -f "$f" ]] || return 0
  while IFS='=' read -r k v; do
    # skip empty lines and comments
    [[ -z "${k:-}" ]] && continue
    [[ "$k" =~ ^\# ]] && continue
    # only export requested keys (if any were passed)
    if [[ "$#" -gt 0 ]]; then
      for want in "$@"; do
        if [[ "$k" == "$want" ]]; then
          export "$k=$v"
        fi
      done
    else
      export "$k=$v"
    fi
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$f" || true)
}

# --- Secrets & Configs (Docker Swarm style) --------------------------------

# Secrets: passwords & private data
if [[ -f "/run/secrets/grafana.txt" ]]; then
  export_from_file "/run/secrets/grafana.txt" \
    GRAFANA_ADMIN_PASSWORD \
    NOTIFICATIONS_EMAIL_USER \
    NOTIFICATIONS_EMAIL_PASSWORD \
    NOTIFICATIONS_EMAIL_ADDRESS \
    POSTGRES_DB \
    GRAFANA_DB_PASSWORD \
    TIMESCALE_DB \
    GRAFANA_DATASOURCE_PASSWORD
fi

# Configs: public-ish settings
if [[ -f "/run/configs/grafana.conf" ]]; then
  # Renderer config (keep defaults if not overridden elsewhere)
  export HOME_DASHBOARD_PATH="${HOME_DASHBOARD_PATH:-/var/lib/grafana/data/home_dashboard.json}"
  export GF_RENDERING_SERVER_URL="${GF_RENDERING_SERVER_URL:-http://grafana_renderer:8081/render}"
  export GF_RENDERING_CALLBACK_URL="${GF_RENDERING_CALLBACK_URL:-http://grafana:5000/grafana/}"
  export GF_LOG_FILTERS="${GF_LOG_FILTERS:-rendering:debug}"

  # Domain / timezone / org meta
  export_from_file "/run/configs/grafana.conf" DOMAIN_NAME DEFAULT_TIME_ZONE MAIN_ORGANIZATION_ACRONYM

  # MAIN_ORGANIZATION_NAME may include spaces and quotes → strip quotes safely
  if grep -q '^MAIN_ORGANIZATION_NAME=' /run/configs/grafana.conf; then
    MAIN_ORGANIZATION_NAME_LINE=$(grep '^MAIN_ORGANIZATION_NAME=' /run/configs/grafana.conf)
    export MAIN_ORGANIZATION_NAME="$(echo "${MAIN_ORGANIZATION_NAME_LINE#*=}" | sed -e 's/^"//' -e 's/"$//' )"
  fi
fi

# --- Ensure expected paths exist -------------------------------------------
mkdir -p /var/lib/grafana/data
touch "${HOME_DASHBOARD_PATH}" || true

# --- Quick info log (non-sensitive) ----------------------------------------
echo "Grafana will start on port 5000 under subpath /grafana (see grafana.ini)"
echo "Root URL callback for renderer: ${GF_RENDERING_CALLBACK_URL:-unset}"
echo "Home dashboard path: ${HOME_DASHBOARD_PATH}"

# --- Start Grafana (delegates to upstream entrypoint) ----------------------
/run.sh