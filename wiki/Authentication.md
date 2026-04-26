# Authentication

OneCall uses Google OAuth2 for Gmail and Calendar access, and a Notion integration token for task data.

---

## Google OAuth2 (`src/auth/google.ts`)

### Scopes

```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/calendar.readonly
```

Both scopes are read-only — OneCall never sends emails, creates events, or modifies any data.

### OAuth Client

```typescript
export function createOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/oauth2callback'
  );
}
```

### Flow

#### First Run (via Setup Page)

1. User opens `http://localhost:3000/setup` in their browser
2. Enters Google OAuth credentials (Client ID and Client Secret) and saves them
3. Clicks **Connect Google Account** on the setup page
4. Setup page calls `GET /api/auth/google` to get the OAuth consent URL
5. Browser redirects to Google's OAuth consent screen
6. User grants access; Google redirects to `GET /oauth2callback` on the backend
7. Backend exchanges the auth code for access + refresh tokens
8. Tokens are persisted to `server/tokens.json`
9. Browser redirects back to `/setup` with a success message

Alternatively, a CLI OAuth flow is available via `npm run auth:google` for terminal-only environments.

#### Subsequent Runs

1. Loads tokens from `tokens.json`
2. Checks if the access token is expired (`expiry_date < Date.now()`)
3. If expired, calls `refreshAccessToken()` to get a new access token using the refresh token
4. Saves the refreshed credentials back to `tokens.json`

### Token Storage

Tokens are stored as a JSON file at `tokens.json` in the project root. This file is gitignored and contains:

```json
{
  "access_token": "ya29...",
  "refresh_token": "1//...",
  "scope": "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly",
  "token_type": "Bearer",
  "expiry_date": 1714000000000
}
```

---

## Notion Authentication

Notion uses an internal integration token (not OAuth). Setup:

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Create a new internal integration
3. Copy the token to `.env` as `NOTION_TOKEN`
4. Get the 32-character hex database ID from your Notion database URL
5. Set it as `NOTION_DATABASE_ID` in `.env`
6. **Connect the integration** to the target database via the database's Connections menu in Notion

The `NotionProvider` class reads these from environment variables at construction time:

```typescript
constructor() {
  this.client = new Client({ auth: process.env.NOTION_TOKEN! });
  this.databaseId = process.env.NOTION_DATABASE_ID!;
}
```

---

## Google Cloud Console Setup

To obtain OAuth2 credentials:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services → Library**
4. Enable **Gmail API** and **Google Calendar API**
5. Navigate to **APIs & Services → Credentials**
6. Click **Create Credentials → OAuth client ID**
7. Select **Web application** as the application type
8. Add `http://localhost:3000/oauth2callback` as an authorized redirect URI
9. Copy the Client ID and Client Secret to `.env`
10. Navigate to **OAuth consent screen** and add your email as a test user
