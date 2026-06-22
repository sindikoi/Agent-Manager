# Deploying SafeShift

The whole app ships as **one Docker container**: Node serves the API and the
built React client, and spawns the Python OR-Tools solver. MongoDB stays on
Atlas. No separate frontend host (Netlify/Vercel) is needed.

## Prerequisites
- The code is pushed to GitHub (`sindikoi/Agent-Manager`).
- A MongoDB Atlas cluster with **Network Access → `0.0.0.0/0`** (already set), so
  the cloud host can connect.
- A free [Render](https://render.com) account.

## Deploy to Render (Blueprint)
1. Render dashboard → **New → Blueprint**.
2. Connect the GitHub repo. Render detects [`render.yaml`](render.yaml).
3. When prompted, set the secret env vars:
   - `MONGO_URI` — the Atlas connection string (same one as `Server/.env`).
   - `ANTHROPIC_API_KEY` — optional; leave blank unless you want the AI chat.
   - `PYTHON_BIN` is already set to `/opt/venv/bin/python` by the blueprint.
4. **Create** → Render builds the Dockerfile and deploys. First build ~5–10 min.
5. Open the service URL (e.g. `https://safeshift.onrender.com`) and log in.

> Free tier note: the service sleeps after ~15 min idle, so the first request
> after a pause takes ~50s to wake. That's normal.

## Manual deploy (alternative, no render.yaml)
Render → New → **Web Service** → pick the repo → Runtime **Docker** →
add the env vars above → Create.

## Test the image locally (optional)
```bash
docker build -t safeshift .
docker run -p 3002:3002 \
  -e MONGO_URI="<your atlas uri>" \
  -e PYTHON_BIN="/opt/venv/bin/python" \
  safeshift
# then open http://localhost:3002
```

## Environment variables
| Var | Required | Notes |
|-----|----------|-------|
| `MONGO_URI` | yes | Atlas connection string |
| `PYTHON_BIN` | yes (cloud) | `/opt/venv/bin/python` in Docker |
| `PORT` | no | injected by Render; defaults to 3002 |
| `ANTHROPIC_API_KEY` | no | only for the AI agent chat (`/agent`) |

## After deploy
Seed demo data once (from your machine, pointing at the same Atlas DB):
```bash
cd Python && python seed_data.py --drop
```
Then log in as manager `101` / `pass101`.
