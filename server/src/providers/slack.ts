import type { SlackDM } from '@zerocall/harness';

// NOTE: mention detection (search.messages / search:read) is explicitly out of scope.
// The search:read OAuth scope is not granted on this token. Revisit when it is added.

interface SlackApiResponse {
  ok: boolean;
  error?: string;
}

interface AuthTestResponse extends SlackApiResponse {
  user_id: string;
  team: string;
}

interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  bot_id?: string;
}

interface SlackConversation {
  id: string;
  name?: string;
  is_im: boolean;
  is_mpim: boolean;
  /** IMs only: the other participant's user ID. */
  user?: string;
  /** MPIMs only: all participant user IDs including self. */
  members?: string[];
  /** Number of unread messages. May be absent (treat as 0). */
  unread_count?: number;
  /** Timestamp of the last message the authed user read. */
  last_read?: string;
  latest?: {
    ts: string;
    text?: string;
    user?: string;
    bot_id?: string;
  };
}

interface ConversationsListResponse extends SlackApiResponse {
  channels: SlackConversation[];
  response_metadata?: { next_cursor?: string };
}

interface ConversationsHistoryResponse extends SlackApiResponse {
  messages: SlackMessage[];
}

interface UsersInfoResponse extends SlackApiResponse {
  user: {
    profile: {
      display_name?: string;
      real_name?: string;
    };
  };
}

/**
 * Module-level cache for `auth.test` results, keyed by token. Persists across
 * SlackProvider instances (which are reconstructed every sync cycle) so that
 * the Tier-1-rate-limited (1 req/min) auth.test call is made at most once per
 * 30 minutes per token.
 */
const authCache: Map<string, { userId: string; team: string; cachedAt: number }> = new Map();
const AUTH_CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Module-level cache for resolved user display names, keyed by user ID.
 * Display names rarely change, so a long TTL is fine; this primarily exists to
 * deduplicate users.info calls across sync cycles.
 */
const userNameCache: Map<string, { name: string; cachedAt: number }> = new Map();
const USER_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Live-validates a Slack user token by calling auth.test. On success, primes
 * the module-level authCache so the next sync cycle can skip its own auth.test.
 * Returns null on success, or a human-readable error message on failure.
 *
 * Used by the config save endpoint to reject obviously bad tokens at the
 * point the user pastes them in, rather than letting the first sync fail.
 */
export async function validateSlackToken(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      return `Slack token validation failed: HTTP ${res.status}`;
    }
    const data = (await res.json()) as AuthTestResponse;
    if (!data.ok) {
      return `Slack token is invalid: ${data.error ?? 'unknown'}`;
    }
    // Prime the auth cache so the next sync skips its own auth.test call.
    authCache.set(token, {
      userId: data.user_id,
      team: data.team ?? 'Slack',
      cachedAt: Date.now(),
    });
    return null;
  } catch {
    return 'Could not validate Slack token \u2014 network error';
  }
}

/**
 * Fetches high-signal Slack DM data using only the scopes available on the
 * user token: im:read, im:history, mpim:read, mpim:history, users:read.
 *
 * Does NOT use search.messages — search:read is not granted on this token.
 */
export class SlackProvider {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Calls a Slack Web API endpoint via fetch.
   * Handles HTTP 429 rate-limit responses by reading the Retry-After header
   * and sleeping for that duration (+100 ms buffer) before retrying.
   * Retries up to 3 times before throwing.
   * Also throws when Slack returns HTTP 200 with ok: false.
   *
   * @param endpoint - Slack API method name, e.g. "conversations.list".
   * @param params   - Query-string parameters to append (GET) or omit (POST).
   * @param method   - HTTP verb; defaults to GET.
   */
  private async slackFetch<T extends SlackApiResponse>(
    endpoint: string,
    params: Record<string, string> = {},
    method: 'GET' | 'POST' = 'GET',
  ): Promise<T> {
    const url = new URL(`https://slack.com/api/${endpoint}`);
    if (method === 'GET') {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    let lastError: Error = new Error(`Failed to fetch ${endpoint}`);

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.status === 429) {
        // Respect Retry-After header; add 100 ms buffer to avoid edge races.
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10);
        await new Promise(r => setTimeout(r, retryAfter * 1000 + 100));
        lastError = new Error(`Rate limited on ${endpoint}`);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from Slack API ${endpoint}`);
      }

      const data = (await res.json()) as T;

      // Slack returns HTTP 200 with ok: false for API-level errors.
      if (!data.ok) {
        throw new Error(`Slack API error on ${endpoint}: ${data.error ?? 'unknown'}`);
      }

      return data;
    }

    throw lastError;
  }

  /**
   * Resolves a Slack user ID to a "@displayName" string.
   * Results are cached at module scope so users.info is deduplicated across
   * sync cycles, not just within a single sync. Falls back to real_name, then
   * to raw user ID if the API call fails.
   *
   * @param userId - Slack user ID, e.g. "U01234567".
   */
  private async resolveUser(userId: string): Promise<string> {
    const cached = userNameCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < USER_CACHE_TTL_MS) {
      return cached.name;
    }

    try {
      const data = await this.slackFetch<UsersInfoResponse>('users.info', { user: userId });
      const profile = data.user.profile;
      const name = profile.display_name?.trim() || profile.real_name?.trim() || userId;
      const displayName = `@${name}`;
      userNameCache.set(userId, { name: displayName, cachedAt: Date.now() });
      return displayName;
    } catch {
      // Non-fatal: fall back to raw user ID rather than aborting the sync.
      // Cache the fallback briefly too so we don't hammer users.info on a bad ID.
      const fallback = `@${userId}`;
      userNameCache.set(userId, { name: fallback, cachedAt: Date.now() });
      return fallback;
    }
  }

  /**
   * Fetches unread DM state from Slack and classifies conversations into
   * dm_action_required (last message is from someone else) and
   * dm_awaiting_reply (user sent the last message >1 hour ago with no reply).
   *
   * Mirrors the gmail.ts action_required / awaiting_reply pattern.
   *
   * @returns Snapshot data and any non-fatal per-conversation error strings.
   */
  async getMessages(): Promise<{
    dms: {
      dm_action_required: SlackDM[];
      dm_awaiting_reply: SlackDM[];
      workspace_name: string;
    };
    errors: string[];
  }> {
    const errors: string[] = [];
    const dm_action_required: SlackDM[] = [];
    const dm_awaiting_reply: SlackDM[] = [];

    // a. Get the authed user's ID and workspace name. auth.test is Tier 1
    //    (1 req/min). Cache the result at module scope keyed by token so it
    //    persists across SlackProvider instances (one per sync cycle).
    let authedUserId: string;
    let workspaceName: string;
    const cachedAuth = authCache.get(this.token);
    if (cachedAuth && Date.now() - cachedAuth.cachedAt < AUTH_CACHE_TTL_MS) {
      authedUserId = cachedAuth.userId;
      workspaceName = cachedAuth.team;
    } else {
      const auth = await this.slackFetch<AuthTestResponse>('auth.test', {}, 'POST');
      authedUserId = auth.user_id;
      workspaceName = auth.team ?? 'Slack';
      authCache.set(this.token, {
        userId: authedUserId,
        team: workspaceName,
        cachedAt: Date.now(),
      });
    }

    // b. List DM conversations. Limit=20 to cap API usage and snapshot size.
    //    Types im,mpim covers both 1:1 DMs and group DMs.
    const convsData = await this.slackFetch<ConversationsListResponse>(
      'conversations.list',
      { types: 'im,mpim', limit: '20', exclude_archived: 'true' },
    );

    // c. Warn if there are more conversations beyond the 20 we fetched.
    //    We do NOT silently truncate — meta.errors will surface this to users.
    if (convsData.response_metadata?.next_cursor) {
      errors.push(
        'Slack: conversation list truncated at 20 DMs (has_more: true). Snapshot is partial.',
      );
    }

    // d. Process each conversation sequentially to stay well within Tier 3
    //    rate limits (50 req/min) and to keep retry logic simple.
    for (const conv of convsData.channels) {
      try {
        // Unread detection: Slack has no server-side is_unread field.
        // A conversation is considered unread if unread_count > 0 OR if the
        // latest message timestamp exceeds the last_read cursor. Both checks
        // are needed because unread_count may be absent when zero.
        const latestTs = conv.latest?.ts;
        const lastRead = conv.last_read;
        const hasUnreadCount = (conv.unread_count ?? 0) > 0;
        const newerThanRead =
          latestTs !== undefined &&
          lastRead !== undefined &&
          parseFloat(latestTs) > parseFloat(lastRead);

        if (!hasUnreadCount && !newerThanRead) continue;

        // Prefer conv.latest from conversations.list — it already has the
        // fields we need (ts, user/bot_id, text). Only fall back to
        // conversations.history when latest is missing or incomplete.
        let lastMsg: SlackMessage | undefined;
        if (
          conv.latest &&
          conv.latest.ts &&
          (conv.latest.user !== undefined || (conv.latest as SlackMessage).bot_id !== undefined)
        ) {
          lastMsg = conv.latest as SlackMessage;
        } else {
          const historyData = await this.slackFetch<ConversationsHistoryResponse>(
            'conversations.history',
            { channel: conv.id, limit: '1' },
          );
          lastMsg = historyData.messages[0];
        }

        if (!lastMsg) continue;

        // Skip bot messages (Slackbot, workflow notifications, app DMs) — they
        // shouldn't trigger dm_action_required and aren't replies the user owes.
        if (lastMsg.bot_id) continue;

        // Slack timestamps are Unix seconds with microsecond precision as a string.
        const lastMsgMs = parseFloat(lastMsg.ts) * 1000;
        const lastMsgDate = new Date(lastMsgMs).toISOString();
        const snippet = (lastMsg.text ?? '').slice(0, 120);

        const fromSelf = lastMsg.user === authedUserId;

        // Resolve the counterparty display name(s).
        let counterparty: string;
        if (conv.is_im && conv.user) {
          counterparty = await this.resolveUser(conv.user);
        } else if (conv.is_mpim && conv.members) {
          const others = conv.members.filter(id => id !== authedUserId);
          const names = await Promise.all(
            others.slice(0, 3).map(id => this.resolveUser(id)),
          );
          counterparty = names.join(', ');
          if (others.length > 3) {
            counterparty += ` and ${others.length - 3} others`;
          }
        } else {
          // Fallback for unexpected conversation shapes.
          counterparty = conv.name ? `@${conv.name}` : conv.id;
        }

        const channelName = conv.name ?? conv.id;

        if (fromSelf) {
          // Mirror the Gmail awaiting_reply threshold, scaled down to 1 hour
          // for DMs (Slack response norms are faster than email).
          const oneHourAgo = Date.now() - 60 * 60 * 1000;
          if (lastMsgMs < oneHourAgo) {
            dm_awaiting_reply.push({
              channel_id: conv.id,
              channel_name: channelName,
              counterparty,
              last_message_at: lastMsgDate,
              snippet,
              waiting_since: lastMsgDate,
            });
          }
        } else {
          dm_action_required.push({
            channel_id: conv.id,
            channel_name: channelName,
            counterparty,
            last_message_at: lastMsgDate,
            snippet,
          });
        }
      } catch (err) {
        // Non-fatal: skip this conversation and surface the error in meta.
        errors.push(`Slack: error processing conversation ${conv.id}: ${String(err)}`);
      }
    }

    return {
      dms: { dm_action_required, dm_awaiting_reply, workspace_name: workspaceName },
      errors,
    };
  }
}
