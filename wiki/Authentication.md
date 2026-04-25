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

#### First Run

1. `getAuthenticatedClient()` checks for a saved token at `tokens.json`
2. If no token exists, generates an OAuth consent URL and prints it to the console
3. Starts a local HTTP server on the redirect URI port (default: 3000)
4. User opens the URL in their browser and grants access
5. Google redirects to `localhost:3000/oauth2callback` with an auth code
6. The code is exchanged for access + refresh tokens
7. Tokens are persisted to `tokens.json`

```
Open this URL in your browser to authenticate:
https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=...

Waiting for OAuth redirect on port 3000...
Tokens saved to tokens.json
```

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
