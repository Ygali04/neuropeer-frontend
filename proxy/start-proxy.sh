#!/bin/bash
# NeuroPeer residential proxy — tinyproxy + bore tunnel
# Runs on login via launchd (see com.neuropeer.proxy.plist)

CONF_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$CONF_DIR/proxy.log"
PORT_FILE="$CONF_DIR/bore-port.txt"

cleanup() {
    kill $TINYPROXY_PID $BORE_PID 2>/dev/null
    echo "$(date): proxy stopped" >> "$LOG"
    exit 0
}
trap cleanup SIGTERM SIGINT

# Write tinyproxy config
cat > /tmp/neuropeer-tinyproxy.conf << 'EOF'
Port 8888
Timeout 600
LogLevel Warning
MaxClients 50
BasicAuth neuropeer secretproxy123
ConnectPort 443
ConnectPort 80
EOF

# Start tinyproxy (foreground via -d, backgrounded here)
/opt/homebrew/bin/tinyproxy -c /tmp/neuropeer-tinyproxy.conf -d >> "$LOG" 2>&1 &
TINYPROXY_PID=$!
echo "$(date): tinyproxy started (PID $TINYPROXY_PID)" >> "$LOG"
sleep 1

# Start bore tunnel
/opt/homebrew/bin/bore local 8888 --to bore.pub >> "$LOG" 2>&1 &
BORE_PID=$!
sleep 3

# Extract port from log
BORE_PORT=$(grep -o 'listening at bore.pub:[0-9]*' "$LOG" | tail -1 | cut -d: -f2)

if [ -n "$BORE_PORT" ]; then
    echo "$BORE_PORT" > "$PORT_FILE"
    echo "$(date): bore tunnel active at bore.pub:$BORE_PORT (PID $BORE_PID)" >> "$LOG"
    echo "Proxy running at http://neuropeer:secretproxy123@bore.pub:$BORE_PORT"

    # Auto-update Railway worker with the new proxy URL
    RAILWAY="/Users/yahvingali/.nvm/versions/node/v18.20.4/bin/railway"
    export PATH="/Users/yahvingali/.nvm/versions/node/v18.20.4/bin:$PATH"
    cd /Users/yahvingali/video-brainscore
    $RAILWAY service neuropeer-worker >> "$LOG" 2>&1
    $RAILWAY variables set PROXY_URL="http://bore.pub:$BORE_PORT" >> "$LOG" 2>&1
    echo "$(date): Railway PROXY_URL updated to http://bore.pub:$BORE_PORT" >> "$LOG"
else
    echo "$(date): ERROR — bore failed to start" >> "$LOG"
    echo "ERROR: bore tunnel failed. Check $LOG"
    exit 1
fi

# Stay alive so launchd doesn't kill child processes
wait $BORE_PID
