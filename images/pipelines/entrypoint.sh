#!/bin/sh
set -e

echo "Starting placeholder health server on :3300..."
python3 - <<'PYEOF' &
import http.server, threading, time

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"starting")
    def log_message(self, *args):
        pass

server = http.server.HTTPServer(("0.0.0.0", 3300), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
time.sleep(86400)
PYEOF
PLACEHOLDER_PID=$!

cleanup() {
  kill "$PLACEHOLDER_PID" 2>/dev/null || true
  wait "$PLACEHOLDER_PID" 2>/dev/null || true
}

echo "Waiting for auth_callout..."
if ! timeout 120 sh -c 'until curl -sf http://auth_callout:3300/health > /dev/null 2>&1; do sleep 3; done'; then
  echo "ERROR: auth_callout not ready after 120s, aborting startup"
  cleanup
  exit 1
fi
echo "auth_callout ready"

# ── Resolve the real TimescaleDB target from config.yaml ─────────────────
# Don't hardcode "timescaledb": that hostname only exists when the legacy
# single-node database is deployed (UsePatroniTool == false). When Patroni
# is enabled, the actual endpoint is haproxy_patroni:5100, and it's already
# correctly written into config.yaml by CreatePipelinesConfigSecret — we
# just need to read it from there instead of assuming a fixed value.
TS_TARGET=$(python3 - <<'PYEOF'
import re

with open("/pipelines/config.yaml") as f:
    lines = f.readlines()

host, port = "timescaledb", "5432"  # fallback, matches the legacy default
in_block = False
for raw in lines:
    line = raw.rstrip("\n")
    if re.match(r'^timescaledb:\s*$', line):
        in_block = True
        continue
    if in_block:
        if line and not line[0].isspace():
            break  # dedented into the next top-level key, block is over
        m = re.search(r'^\s*host:\s*"?([^"\s]+)"?', line)
        if m:
            host = m.group(1)
        m = re.search(r'^\s*port:\s*(\d+)', line)
        if m:
            port = m.group(1)

print(f"{host} {port}")
PYEOF
)
TS_HOST=$(echo "$TS_TARGET" | cut -d' ' -f1)
TS_PORT=$(echo "$TS_TARGET" | cut -d' ' -f2)
echo "Resolved timescaledb target from config.yaml: ${TS_HOST}:${TS_PORT}"

cat > /tmp/wait_for_tcp.py <<'PYEOF'
import socket
import sys

host, port = sys.argv[1], int(sys.argv[2])
s = socket.socket()
s.settimeout(2)
try:
    s.connect((host, port))
except OSError:
    sys.exit(1)
finally:
    s.close()
PYEOF

echo "Waiting for ${TS_HOST}:${TS_PORT}..."
if ! timeout 60 sh -c "until python3 /tmp/wait_for_tcp.py '${TS_HOST}' '${TS_PORT}' 2>/dev/null; do sleep 2; done"; then
  echo "ERROR: ${TS_HOST}:${TS_PORT} not ready after 60s, aborting startup"
  cleanup
  exit 1
fi
echo "${TS_HOST}:${TS_PORT} ready"

echo "All dependencies ready, stopping placeholder server and starting pipelines..."
cleanup

exec pipelines