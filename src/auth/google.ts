import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = path.resolve(__dirname, '../../tokens.json');

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

export async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const client = createOAuthClient();

  if (loadTokens(client)) {
    // Refresh if expired
    const expiry = client.credentials.expiry_date;
    if (expiry && expiry < Date.now()) {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      saveTokens(client);
    }
    return client;
  }

  // First run: open browser for OAuth consent
  const authUrl = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\nOpen this URL in your browser to authenticate:\n');
  console.log(authUrl);
  console.log();

  // Start a local server to receive the redirect
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost:3000');
      const code = url.searchParams.get('code');
      if (!code) {
        res.end('Missing code. Try again.');
        return reject(new Error('No code in redirect'));
      }
      res.end('Authentication successful! You can close this tab.');
      server.close();
      resolve(code);
    });

    const port = parseInt(process.env.GOOGLE_REDIRECT_URI?.split(':')[2]?.split('/')[0] ?? '3000');
    server.listen(port, () => console.log(`Waiting for OAuth redirect on port ${port}...`));
    server.on('error', reject);
  });

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  saveTokens(client);
  console.log('Tokens saved to tokens.json\n');

  return client;
}
