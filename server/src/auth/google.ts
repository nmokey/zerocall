import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(__dirname, '../../');
const TOKENS_PATH = path.join(DATA_DIR, 'tokens.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

export function createOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/oauth2callback'
  );
}

function loadTokens(client: OAuth2Client): boolean {
  if (!fs.existsSync(TOKENS_PATH)) return false;
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
  client.setCredentials(tokens);
  return true;
}

function saveTokens(client: OAuth2Client): void {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(client.credentials, null, 2));
}

export function isAuthenticated(): boolean {
  return fs.existsSync(TOKENS_PATH);
}

export function getOAuthUrl(): string {
  const client = createOAuthClient();
  // prompt: 'consent' forces Google to re-issue a refresh_token even if the
  // app was previously authorized. Without this, repeat authorizations only
  // return an access_token and tokens.json loses the ability to auto-refresh.
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
}

/** Exchanges the auth code from Google's redirect for tokens and persists them. */
export async function exchangeCodeForTokens(code: string): Promise<void> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  saveTokens(client);
}

/**
 * Returns an authenticated OAuth2 client for use by providers.
 * Throws if the user has not yet completed the OAuth flow.
 */
export async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const client = createOAuthClient();

  if (!loadTokens(client)) {
    throw new Error('Not authenticated. Complete Google OAuth via the dashboard first.');
  }

  // If the access token is expired, refresh it. A refresh_token must be present
  // (obtained by completing OAuth with access_type:'offline' + prompt:'consent').
  const expiry = client.credentials.expiry_date;
  const needsRefresh = expiry && expiry < Date.now();
  if (needsRefresh) {
    if (!client.credentials.refresh_token) {
      // No refresh token — delete stale tokens so the next isAuthenticated()
      // check fails cleanly and the user is prompted to re-authenticate.
      fs.unlinkSync(TOKENS_PATH);
      throw new Error('Access token expired and no refresh token available. Re-authenticate via the dashboard.');
    }
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    saveTokens(client);
  }

  return client;
}
