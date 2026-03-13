#!/usr/bin/env bash
#
# Headless daily snapshot capture for Portfolio Dashboard.
# Starts backend + frontend, captures snapshot via Playwright, shuts down.
#
# Usage:
#   ./scripts/headless_snapshot.sh
#
# Designed for cron: runs M-F after market close.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
LOG_DIR="$PROJECT_ROOT/data"
LOG_FILE="$LOG_DIR/headless_snapshot.log"

BACKEND_PORT=8000
FRONTEND_PORT=3000
BACKEND_PID=""
FRONTEND_PID=""

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

cleanup() {
  log "Shutting down..."
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null && wait "$FRONTEND_PID" 2>/dev/null
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null && wait "$BACKEND_PID" 2>/dev/null
  log "Cleanup complete."
}
trap cleanup EXIT

# --- Check nothing else is using our ports ---
LSOF=/usr/sbin/lsof
for PORT in $BACKEND_PORT $FRONTEND_PORT; do
  PIDS=$($LSOF -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    log "Port $PORT in use (PIDs: $PIDS) — killing..."
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 3
    # Verify port is free
    if $LSOF -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
      log "ERROR: Port $PORT still in use after kill"
      exit 1
    fi
  fi
done

# --- Start backend ---
log "Starting backend on port $BACKEND_PORT..."
cd "$BACKEND_DIR"
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT \
  >> "$LOG_FILE" 2>&1 &
BACKEND_PID=$!
log "Backend PID: $BACKEND_PID"

# Wait for backend to be ready
for i in $(seq 1 30); do
  if curl -sf --max-time 2 "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
    log "Backend ready after ${i}s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    log "ERROR: Backend failed to start after 30s"
    exit 1
  fi
  sleep 1
done

# --- Start frontend (production mode) ---
log "Starting frontend on port $FRONTEND_PORT..."
cd "$FRONTEND_DIR"
npx next start --port $FRONTEND_PORT >> "$LOG_FILE" 2>&1 &
FRONTEND_PID=$!
log "Frontend PID: $FRONTEND_PID"

# Wait for frontend to be ready
for i in $(seq 1 30); do
  if curl -sf --max-time 2 "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1; then
    log "Frontend ready after ${i}s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    log "ERROR: Frontend failed to start after 90s"
    exit 1
  fi
  sleep 1
done

# --- Run Playwright snapshot capture ---
log "Running headless snapshot capture..."

cat > "$FRONTEND_DIR/_headless_capture.mjs" << 'JSEOF'
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1400, height: 1000 },
  colorScheme: 'dark',
});
const page = await context.newPage();

try {
  console.log('Loading dashboard...');
  // Use 'load' instead of 'networkidle' — Finnhub WebSocket keeps network busy forever
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 30000 });

  // Wait for the chart container to render (proves React hydrated + data loaded)
  console.log('Waiting for chart to render...');
  await page.waitForSelector('.recharts-wrapper', { timeout: 30000 });
  console.log('Chart rendered');

  // Extra settle time for animations and data population
  await page.waitForTimeout(5000);

  // Trigger sync first
  console.log('Triggering sync...');
  const syncButton = page.locator('button:has(svg.lucide-refresh-cw)');
  if (await syncButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await syncButton.click();
    // Wait for sync to complete (watch for spinner to stop)
    await page.waitForTimeout(20000);
    console.log('Sync complete');
  }

  // Let fresh data render
  await page.waitForTimeout(3000);

  // Click the camera button to trigger snapshot
  console.log('Triggering snapshot capture...');
  const cameraButton = page.locator('button:has(svg.lucide-camera)');
  if (await cameraButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cameraButton.click();
    // Wait for snapshot render + html-to-image + upload
    await page.waitForTimeout(15000);
    console.log('Snapshot triggered successfully');
  } else {
    throw new Error('Camera button not found — is screenshot enabled in settings?');
  }
} catch (err) {
  console.error('Capture failed:', err.message);
  await browser.close();
  process.exit(1);
}

await browser.close();
console.log('Done');
JSEOF

cd "$FRONTEND_DIR"
npx playwright install chromium 2>/dev/null || true
node _headless_capture.mjs 2>&1 | tee -a "$LOG_FILE"
CAPTURE_EXIT=$?
rm -f "$FRONTEND_DIR/_headless_capture.mjs"

if [ $CAPTURE_EXIT -eq 0 ]; then
  log "✅ Snapshot capture complete"
  # Verify the file was created
  TODAY=$(date '+%Y-%m-%d')
  SNAPSHOT_FILE="$PROJECT_ROOT/daily_snapshots/Snapshot_${TODAY}.png"
  if [ -f "$SNAPSHOT_FILE" ]; then
    SIZE=$(du -h "$SNAPSHOT_FILE" | cut -f1)
    log "✅ Verified: $SNAPSHOT_FILE ($SIZE)"
  else
    log "⚠️  Snapshot file not found at expected path: $SNAPSHOT_FILE"
  fi
else
  log "❌ Snapshot capture failed (exit $CAPTURE_EXIT)"
fi

rm -f /tmp/pd_snapshot.js
log "Headless snapshot session complete"
