# Rehearsal Notes — Setup & Deployment Guide

## Overview

This app uses:
- **Netlify** — hosts the frontend and runs serverless functions
- **Google Sheets** — stores all data (one sheet per production)
- **Google Service Account** — backend auth for Sheets API (same pattern as Altius Hub)

---

## Step 1: Google Service Account

You already have one from the Hub: `altius-qc-functions@altius-project-hub.iam.gserviceaccount.com`

You can reuse it, OR create a new one in a different GCP project if you want this app fully separate.

If reusing: skip to Step 2.

If creating new:
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "Rehearsal Notes")
3. Enable **Google Sheets API** and **Google Drive API**
4. Go to IAM → Service Accounts → Create
5. Download the JSON key file

---

## Step 2: Create the Registry Sheet

This is a single Google Sheet YOU own that acts as the index of all productions.

1. Go to [sheets.google.com](https://sheets.google.com) and create a new sheet
2. Name it: `Rehearsal Notes Registry`
3. On the first tab, rename it to `Registry`
4. **Share it** with your service account email (Editor access):
   - `altius-qc-functions@altius-project-hub.iam.gserviceaccount.com`
5. Copy the Sheet ID from the URL:
   - URL looks like: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
   - Copy the `SHEET_ID_HERE` part — you'll need it below

The app will automatically create the header row on first use.

---

## Step 3: Deploy to Netlify

### Option A: From GitHub (recommended)

1. Push this folder to a new GitHub repo:
   ```
   cd rehearsal-notes
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create rehearsal-notes --public --push
   ```
2. Go to [app.netlify.com](https://app.netlify.com) → Add new site → Import from Git
3. Select your repo
4. Build settings are already configured in `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`

### Option B: Netlify CLI (drag & drop)

```bash
npm install
npm run build
netlify deploy --prod --dir=dist
```

---

## Step 4: Set Environment Variables in Netlify

Go to your Netlify site → **Site configuration → Environment variables** and add:

### `REGISTRY_SHEET_ID`
The Sheet ID you copied in Step 2.
```
1aBcDeFgHiJkLmNoPqRsTuVwXyZ...
```

### `SHARED_DRIVE_ID`
The Google Shared Drive ID where production folders will be created. Find this in the URL when viewing the Shared Drive:
```
https://drive.google.com/drive/folders/SHARED_DRIVE_ID_HERE
```

### `GOOGLE_SERVICE_ACCOUNT_EMAIL`
Same value as your Altius Hub — `altius-qc-functions@altius-project-hub.iam.gserviceaccount.com`

### `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
Same value as your Altius Hub — the private key starting with `-----BEGIN PRIVATE KEY-----`

After adding both variables, **trigger a redeploy** (Deploys → Trigger deploy → Deploy site).

---

## Step 5: Install Dependencies for Functions

Netlify Functions need `googleapis`. Add it:

```bash
npm install googleapis
```

Or in `netlify/functions/` create a `package.json`:
```json
{
  "dependencies": {
    "googleapis": "^144.0.0"
  }
}
```

Netlify auto-installs function dependencies from this file.

---

## Step 6: First Production

1. Open your Netlify URL
2. Click **Create one** on the landing page
3. Fill in the 4-step wizard:
   - Production details (title, your name, dates)
   - Scenes (add your acts/scenes)
   - Characters (add cast members)
   - Set a team PIN and optionally a private admin PIN
4. You'll get a **production code** (e.g. `SPEL7K2`)
5. Sign in with that code + PIN

---

## Access Control Model

| Role | Can do |
|------|--------|
| Admin | Everything — log notes, edit notes, manage setup, add/remove team members |
| Member (team PIN) | Log notes, edit notes, resolve notes |
| Shared (custom PIN) | Same as member — use this for other staff like Erica |

**To give Erica access to her production:**
1. Sign into her production as admin
2. Go to Setup → Team
3. Add her name, email, and create a PIN just for her
4. Give her the production code + her PIN

She will never see your productions, and you will never see hers.

---

## Custom Domain (optional)

In Netlify → Domain management, you can add a custom domain like `notes.vhsdrama.com` if you have one.

---

## Data Structure

Each production gets its own Google Sheet with 3 tabs:

**Notes tab** — one row per note:
`id | date | scene | category | priority | cast | cue | swTime | text | resolved | createdAt | updatedAt | createdBy | deleted`

**Config tab** — key/value pairs:
`title | directorName | directorEmail | showDates | venue | scenes (JSON) | characters (JSON) | staff (JSON)`

**SharedWith tab** — team members:
`name | email | pinHash`

---

## Troubleshooting

**"Production not found"** — Check that `REGISTRY_SHEET_ID` is correct and the sheet is shared with the service account.

**"Failed to create production"** — Check that both env vars are set and `googleapis` is installed in functions.

**Functions returning 500** — Check Netlify function logs: Netlify → Functions → Select function → View logs.

**Notes not saving** — The production sheet may not have been shared with the service account. Each production sheet is created by the service account, so it already owns it — this should not happen unless the service account key changed.

---

## Docker Deployment (Alternative to Netlify)

The app can also run as a containerized application using Docker. This is useful for self-hosted deployments or environments where Netlify isn't available.

### Architecture

```
┌─────────────────┐         ┌─────────────────────┐
│     nginx       │         │        app          │
│    (port 80)    │────────▶│     (port 3000)     │
│                 │         │                     │
│  Reverse proxy  │         │  Express + Vite     │
│  Caching, gzip  │         │  API handlers       │
└─────────────────┘         └─────────────────────┘
```

### Files

All Docker configuration lives in `deploy/docker/`:

| File | Purpose |
|------|---------|
| `Dockerfile` | Production app image (multi-stage build) |
| `Dockerfile.dev` | Development app image |
| `Dockerfile.nginx` | Nginx reverse proxy |
| `docker-compose.yaml` | Production orchestration |
| `docker-compose.dev.yaml` | Development with hot reload |
| `.env.example` | Environment variable template |
| `server.cjs` | Express wrapper for API functions |
| `nginx/` | Nginx configuration files |

### Production Deployment

1. Navigate to the docker directory:
   ```bash
   cd deploy/docker
   ```

2. Create your environment file:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your credentials:
   ```bash
   # Required
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
   REGISTRY_SHEET_ID=your-sheet-id

   # Optional
   RESEND_API_KEY=your-key
   ANTHROPIC_API_KEY=your-key
   ```

4. Build and start the containers:
   ```bash
   docker-compose up -d
   ```

5. Access the app at `http://localhost`

### Development Mode

Development mode provides hot reload for the frontend and API:

```bash
cd deploy/docker
cp .env.example .env
# Edit .env with credentials
docker-compose -f docker-compose.dev.yaml up
```

- Frontend (with HMR): `http://localhost:5173`
- API endpoints: `http://localhost:3000/api/*`

### Managing Containers

```bash
# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f app
docker-compose logs -f nginx

# Stop containers
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# Full cleanup (removes images)
docker-compose down --rmi all
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yes | Full service account JSON (single line) |
| `REGISTRY_SHEET_ID` | Yes | Global registry spreadsheet ID |
| `RESEND_API_KEY` | No | Email delivery via Resend |
| `TWILIO_ACCOUNT_SID` | No | SMS via Twilio |
| `TWILIO_AUTH_TOKEN` | No | SMS via Twilio |
| `TWILIO_FROM_NUMBER` | No | SMS via Twilio |
| `ANTHROPIC_API_KEY` | No | AI features (chat, lookups) |
| `PLATFORM_ADMINS` | No | JSON array of admin emails |

### Docker Troubleshooting

**Container won't start** — Check logs with `docker-compose logs app`. Common issues:
- Missing required environment variables
- Invalid JSON in `GOOGLE_SERVICE_ACCOUNT_JSON`

**API returns 404** — The function may not exist. Check available functions:
```bash
docker-compose exec app ls /app/netlify/functions/
```

**nginx returns 502 Bad Gateway** — The app container isn't healthy. Check:
```bash
docker-compose ps
docker-compose logs app
```

**Changes not reflecting** — Rebuild the containers:
```bash
docker-compose up -d --build
```
