import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../../../.env');

const REQUIRED_VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NOTION_TOKEN', 'NOTION_DATABASE_ID'];

export interface IntegrationPreferences {
  gmail: boolean;
  calendar: boolean;
  notion: boolean;
}

export function getIntegrationPreferences(): IntegrationPreferences {
  return {
    gmail: process.env.ENABLE_GMAIL !== 'false',
    calendar: process.env.ENABLE_CALENDAR !== 'false',
    notion: process.env.NOTION_TOKEN !== '' && process.env.NOTION_TOKEN !== undefined,
  };
}

function maskValue(value: string): string {
  if (!value || value.length <= 8) return '••••••••';
  const start = value.substring(0, 4);
  const end = value.substring(value.length - 4);
  return `${start}••••${end}`;
}

export function getConfigStatus(): { present: string[]; missing: string[]; values: Record<string, string> } {
  const present = REQUIRED_VARS.filter(key => !!process.env[key]);
  const missing = REQUIRED_VARS.filter(key => !process.env[key]);
  const values: Record<string, string> = {};
  for (const key of REQUIRED_VARS) {
    if (process.env[key]) {
      values[key] = maskValue(process.env[key]!);
    }
  }
  // Also include ANTHROPIC_API_KEY if present
  if (process.env.ANTHROPIC_API_KEY) {
    present.push('ANTHROPIC_API_KEY');
    values['ANTHROPIC_API_KEY'] = maskValue(process.env.ANTHROPIC_API_KEY);
  }
  return { present, missing, values };
}

/**
 * Validates format of credentials that are present (non-empty).
 * Does not enforce required fields — allows partial saves from the UI.
 */
export function validatePartialConfig(values: Record<string, string>): string[] {
  const errors: string[] = [];
  if (values.GOOGLE_CLIENT_ID && !values.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')) {
    errors.push('GOOGLE_CLIENT_ID should end with .apps.googleusercontent.com');
  }
  if (values.NOTION_TOKEN && !values.NOTION_TOKEN.startsWith('secret_') && !values.NOTION_TOKEN.startsWith('ntn_')) {
    errors.push('NOTION_TOKEN should start with secret_ or ntn_');
  }
  if (values.NOTION_DATABASE_ID) {
    const dbId = values.NOTION_DATABASE_ID.replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/i.test(dbId)) {
      errors.push('NOTION_DATABASE_ID should be a 32-character hex string');
    }
  }
  return errors;
}

export function validateConfig(values: Record<string, string>, prefs?: IntegrationPreferences): string[] {
  const errors: string[] = [];

  // Validate based on enabled integrations
  const enableGmail = prefs?.gmail ?? true;
  const enableCalendar = prefs?.calendar ?? true;
  const enableNotion = prefs?.notion ?? true;

  // Google integrations (Gmail and Calendar share OAuth)
  if (enableGmail || enableCalendar) {
    if (!values.GOOGLE_CLIENT_ID) {
      errors.push('GOOGLE_CLIENT_ID is required for Gmail/Calendar');
    } else if (!values.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')) {
      errors.push('GOOGLE_CLIENT_ID should end with .apps.googleusercontent.com');
    }
    if (!values.GOOGLE_CLIENT_SECRET) {
      errors.push('GOOGLE_CLIENT_SECRET is required for Gmail/Calendar');
    }
  }

  // Notion
  if (enableNotion) {
    if (!values.NOTION_TOKEN) {
      errors.push('NOTION_TOKEN is required for Notion');
    } else if (!values.NOTION_TOKEN.startsWith('secret_') && !values.NOTION_TOKEN.startsWith('ntn_')) {
      errors.push('NOTION_TOKEN should start with secret_ or ntn_');
    }
    if (!values.NOTION_DATABASE_ID) {
      errors.push('NOTION_DATABASE_ID is required for Notion');
    } else {
      const dbId = values.NOTION_DATABASE_ID.replace(/-/g, '');
      if (!/^[0-9a-f]{32}$/i.test(dbId)) {
        errors.push('NOTION_DATABASE_ID should be a 32-character hex string');
      }
    }
  }

  return errors;
}

/**
 * Writes the given key=value pairs into .env, replacing existing keys in-place
 * and appending new ones. Also applies them to process.env immediately.
 */
export function writeConfig(values: Record<string, string>, prefs?: IntegrationPreferences): void {
  const content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const written = new Set<string>();

  const updatedLines = lines.map(line => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && values[match[1]] !== undefined) {
      written.add(match[1]);
      return `${match[1]}=${values[match[1]]}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!written.has(key) && value) updatedLines.push(`${key}=${value}`);
  }

  // Write integration preference flags
  if (prefs) {
    const flagLines: string[] = [];
    if (prefs.gmail === false) flagLines.push('ENABLE_GMAIL=false');
    if (prefs.calendar === false) flagLines.push('ENABLE_CALENDAR=false');
    if (prefs.notion === false) flagLines.push('ENABLE_NOTION=false');

    // Remove existing integration flags
    const flagKeys = ['ENABLE_GMAIL', 'ENABLE_CALENDAR', 'ENABLE_NOTION'];
    const filteredLines = updatedLines.filter(line => {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
      return !match || !flagKeys.includes(match[1]);
    });

    // Add new flags at the end
    const finalLines = [...filteredLines, ...flagLines];

    try {
      fs.writeFileSync(ENV_PATH, finalLines.join('\n'));
    } catch (err: any) {
      if (err.code === 'EACCES' || err.code === 'EROFS') {
        throw new Error(`Cannot write to ${ENV_PATH}: permission denied`);
      }
      throw err;
    }

    for (const [key, value] of Object.entries(values)) {
      if (value) process.env[key] = value;
    }
    if (prefs.gmail !== undefined) process.env.ENABLE_GMAIL = prefs.gmail ? 'true' : 'false';
    if (prefs.calendar !== undefined) process.env.ENABLE_CALENDAR = prefs.calendar ? 'true' : 'false';
    if (prefs.notion !== undefined) process.env.ENABLE_NOTION = prefs.notion ? 'true' : 'false';
    return;
  }

  try {
    fs.writeFileSync(ENV_PATH, updatedLines.join('\n'));
  } catch (err: any) {
    if (err.code === 'EACCES' || err.code === 'EROFS') {
      throw new Error(`Cannot write to ${ENV_PATH}: permission denied`);
    }
    throw err;
  }

  for (const [key, value] of Object.entries(values)) {
    if (value) process.env[key] = value;
  }
}
