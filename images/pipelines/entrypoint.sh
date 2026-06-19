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

echo "Waiting for timescaledb..."
if ! timeout 60 sh -c 'until python3 -c "import socket; s=socket.socket(); s.settimeout(2); s.connect((\"timescaledb\", 5432)); s.close()" 2>/dev/null; do sleep 2; done'; then
  echo "ERROR: timescaledb not ready after 60s, aborting startup"
  cleanup
  exit 1
fi
echo "timescaledb ready"

echo "All dependencies ready, stopping placeholder server and starting pipelines..."
cleanup

exec pipelines