# Operations Runbook

## Purpose

Operational procedures for local development, test execution, and safe recovery.

## Prerequisites

- Python 3.10+
- Node.js 18+
- Dependencies installed (`backend/requirements.txt`, `frontend/package.json`)

## Start and Stop

### Start the app

```bash
python start.py
```

### Stop all local processes

```bash
python stop.py
```

### Port overrides

```bash
python start.py --backend-port 8010 --frontend-port 3010
python stop.py --backend-port 8010 --frontend-port 3010
```

Use `python stop.py --help` for safe usage details.

## Health Verification

Defaults:
1. Backend responds at `http://localhost:8000/api/health`.
2. Frontend responds at `http://localhost:3000`.
3. Account and summary endpoints are reachable after sync.

## Test Mode and DB Isolation

Preferred env vars:
- `PD_TEST_MODE=1`
- `PD_DATABASE_URL=sqlite:///data/portfolio_test.db`

Legacy env aliases are removed and unsupported.

Behavior:
- Test mode exposes only `__TEST__` accounts.
- Sync against real Composer accounts is intentionally skipped in test mode.

## Standard Validation Workflows

### Backend and lint baseline

```bash
python -m pytest backend/tests -q
cd frontend
npm run lint
```

### Integrated smoke tests (recommended)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile power
```

### Visual regression

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Visual
```

## Troubleshooting

### Port 8000 or 3000 already in use

1. Run `python stop.py`.
2. Retry start or test script.

### Direct Playwright command fails with connection refused

Cause:
- Backend/frontend were not started.

Resolution:
- Run the script orchestrator instead of raw E2E command:
`powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic`

### Stale frontend build

1. Remove `frontend/.next/`.
2. Restart frontend or rerun script workflow.

### Missing Playwright browser

```bash
cd frontend
npx playwright install chromium
```

## Automated Daily Snapshot

A headless Playwright script captures a dashboard PNG screenshot Monday–Friday
after market close, without requiring a browser to be open.

### How It Works

`scripts/headless_snapshot.sh` performs these steps:

1. Kills any existing processes on ports 8000/3000
2. Starts the backend (uvicorn) and frontend (`next start`, production mode)
3. Launches headless Chromium via Playwright
4. Navigates to the dashboard, waits for the chart to render
5. Triggers a sync (refresh button) then clicks the camera button
6. The frontend's `html-to-image` library captures a 2400×1800 PNG
7. The PNG is uploaded to the backend and saved to `daily_snapshots/Snapshot_YYYY-MM-DD.png`
8. Everything shuts down cleanly (~30 seconds total)

### Prerequisites

- **Production build required:** Run `cd frontend && npm run build` before the first run.
  If the build is stale after code changes, re-run it.
- **Playwright browsers:** Chromium is auto-installed on first run (cached in
  `~/Library/Caches/ms-playwright/`).
- **Screenshot config:** Must be enabled in `config.json` under `daily_snapshot.enabled: true`
  with a valid `local_path`.

### Manual Run

```bash
bash scripts/headless_snapshot.sh
```

Logs are written to `data/headless_snapshot.log`.

### Cron Schedule (via OpenClaw)

| Time (CT) | Job |
|---|---|
| 9:30 PM M-F | `Dashboard: Daily Snapshot` |

Runs 15 minutes after the Composer data refresh (9:15 PM) to ensure fresh data.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `Errno 48: address already in use` | Run `python stop.py` or `/usr/sbin/lsof -nP -iTCP:8000 -sTCP:LISTEN -t \| xargs kill -9` |
| `networkidle` timeout | Not applicable — script uses `waitUntil: 'load'` + explicit `.recharts-wrapper` selector |
| Camera button not found | Verify `daily_snapshot.enabled: true` in `config.json` |
| Blank/broken chart | Re-run `cd frontend && npm run build` — stale `.next` cache |
| `Cannot find module '@playwright/test'` | Script must run from `frontend/` dir (uses project's `node_modules`) |

## Safe Recovery Procedure

Use this sequence for a clean local reset:

1. `python stop.py`
2. Confirm no services bound to 8000/3000.
3. Rerun baseline checks (`pytest`, `npm run lint`).
4. Run `scripts/run-local-tests.ps1 -Profile basic`.

## Command Discovery

Use these safe help commands:

```bash
python start.py --help
python stop.py --help
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Help
```
