import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { EmailThread } from '@onecall/harness';

export async function fetchEmailState(auth: OAuth2Client): Promise<{
  action_required: EmailThread[];
  awaiting_reply: EmailThread[];
  unread_count: number;
}> {
  const gmail = google.gmail({ version: 'v1', auth });
  const userEmail = await getUserEmail(auth);

  const listRes = await gmail.users.threads.list({
    userId: 'me',
    q: 'newer_than:2d',
    maxResults: 50,
  });

  const threads = listRes.data.threads ?? [];
  const action_required: EmailThread[] = [];
  const awaiting_reply: EmailThread[] = [];

  await Promise.all(threads.map(async (t) => {
    if (!t.id) return;

    const threadRes = await gmail.users.threads.get({
      userId: 'me',
      id: t.id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    });

    const messages = threadRes.data.messages ?? [];
    if (messages.length === 0) return;

    const last = messages[messages.length - 1];
    const headers = (last as { payload?: { headers?: Array<{ name?: string | null; value?: string | null }> } }).payload?.headers ?? [];

    const subject = header(headers, 'Subject') ?? '(no subject)';
    const from = header(headers, 'From') ?? '';
    const date = header(headers, 'Date') ?? '';
    const lastMessageAt = date ? new Date(date).toISOString() : new Date().toISOString();
    const snippet = (last.snippet ?? '').slice(0, 120);
    const labelIds = last.labelIds ?? [];

    const fromMe = isFromMe(from, userEmail);
    const isUnread = labelIds.includes('UNREAD');

    if (!fromMe && isUnread) {
      action_required.push({
        thread_id: t.id,
        subject,
        counterparty: from,
        last_message_at: lastMessageAt,
        snippet,
      });
    } else if (fromMe) {
      const sentAt = new Date(lastMessageAt).getTime();
      const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
      if (sentAt < fourHoursAgo) {
        awaiting_reply.push({
          thread_id: t.id,
          subject,
          counterparty: getCounterparty(headers, userEmail),
          last_message_at: lastMessageAt,
          snippet,
          waiting_since: lastMessageAt,
        });
      }
    }
  }));

  const unreadRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults: 1,
  });
  const unread_count = unreadRes.data.resultSizeEstimate ?? 0;

  return { action_required, awaiting_reply, unread_count };
}

async function getUserEmail(auth: OAuth2Client): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.emailAddress ?? '';
}

function header(
  headers: Array<{ name?: string | null; value?: string | null }>,
  name: string
): string | undefined {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

function isFromMe(from: string, userEmail: string): boolean {
  return from.toLowerCase().includes(userEmail.toLowerCase());
}

function getCounterparty(
  headers: Array<{ name?: string | null; value?: string | null }>,
  userEmail: string
): string {
  const to = header(headers, 'To') ?? '';
  const from = header(headers, 'From') ?? '';
  if (isFromMe(from, userEmail)) return to;
  return from;
}
