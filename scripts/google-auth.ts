/**
 * CLI script to complete Google OAuth without the web dashboard.
 *
 * Usage:
 *   npx tsx scripts/google-auth.ts
 *
 * It prints the consent URL, you open it in a browser, approve access, then
 * paste the `code` query parameter back here. Tokens are saved to tokens.json.
 */
import 'dotenv/config';
import * as readline from 'readline';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Must match server/src/auth/google.ts — server resolves to server/tokens.json at runtime
const TOKENS_PATH = path.resolve(__dirname, '../server/tokens.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/oauth2callback';

  if (!clientId || !clientSecret) {
    console.error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
    process.exit(1);
  }

  const client = new OAuth2Client(clientId, clientSecret, redirectUri);

  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('\n1. Open this URL in your browser:\n');
  console.log('   ' + url);
  console.log('\n2. Approve access. Google will redirect to a URL like:');
  console.log('   http://localhost:3000/oauth2callback?code=4/0AX...&scope=...');
  console.log('\n3. Copy just the `code` value from that URL and paste it below.');
  console.log('   (The page may show an error — that\'s fine, the code is still valid.)\n');

  const code = await prompt('Paste the code here: ');

  if (!code) {
    console.error('No code entered. Exiting.');
    process.exit(1);
  }

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    console.log('\n✓ tokens.json written successfully.');
    if (!tokens.refresh_token) {
      console.warn('⚠ No refresh_token in response. If tokens expire you will need to re-run this script.');
    } else {
      console.log('✓ refresh_token present — tokens will auto-refresh.');
    }
  } catch (err: any) {
    console.error('\nFailed to exchange code for tokens:', err.message);
    process.exit(1);
  }
}

main();
