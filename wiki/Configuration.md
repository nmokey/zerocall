# Configuration

All configuration is done through environment variables in a `.env` file.

---

## Setup

```bash
cp .env.example .env
```

Then fill in the required values.

---

## Environment Variables

### Required

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | [console.anthropic.com](https://console.anthropic.com) → API Keys |

### Required for Live Mode

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret | Same as above |
| `NOTION_TOKEN` | Notion integration token | [notion.so/my-integrations](https://www.notion.so/my-integrations) |
| `NOTION_DATABASE_ID` | 32-character hex ID of your Notion task database | From your Notion database URL |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/oauth2callback` | OAuth2 redirect URI |
| `SYNC_INTERVAL_MINUTES` | `15` | How often to poll providers (in minutes) |
| `WORK_DAY_START` | `09:00` | Start of working hours for free block calculation |
| `WORK_DAY_END` | `18:00` | End of working hours for free block calculation |
| `GMAIL_WEBHOOK_PORT` | `3001` | Port for Gmail push notification handler (not yet implemented) |
| `GMAIL_TOPIC_NAME` | — | Google Cloud Pub/Sub topic for Gmail push (not yet implemented) |

---

## Credential Setup Guides

### Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Navigate to API Keys
3. Create a new key
4. Copy to `.env` as `ANTHROPIC_API_KEY`

### Google OAuth2

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or select a project
3. Enable **Gmail API** and **Google Calendar API** in the API Library
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → OAuth client ID**
6. Application type: **Web application**
7. Add authorized redirect URI: `http://localhost:3000/oauth2callback`
8. Copy Client ID and Client Secret to `.env`
9. Go to **OAuth consent screen** → add your email as a test user

### Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **New integration**
3. Give it a name and select the workspace
4. Copy the **Internal Integration Secret** to `.env` as `NOTION_TOKEN`
5. Open your task database in Notion
6. Get the database ID from the URL (the 32-character hex string after the workspace name)
7. Set it as `NOTION_DATABASE_ID` in `.env`
8. In your Notion database, click **...** → **Connections** → connect your integration

---

## Build & Run

### Demo Mode (mocked data)

```bash
npm install
npm run demo:trace        # single-prompt trace
npm run demo:benchmark    # 20-prompt benchmark
```

Only `ANTHROPIC_API_KEY` is required.

### Live Mode (real APIs)

```bash
npm install
npm run build
npm start                 # first run: authenticate + sync
npm run live:trace        # after sync completes
```

All credentials are required. On first `npm start`, follow the OAuth URL printed to the console.

---

## Files Generated at Runtime

| File | Description | Gitignored |
|------|-------------|------------|
| `tokens.json` | Google OAuth2 access + refresh tokens | Yes |
| `zerocall.db` | SQLite database with snapshots and sync log | Yes |
| `dist/` | Compiled JavaScript output | Yes |
