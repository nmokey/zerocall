import { readRecentQueries } from '../db/queryLog.js';
import { readAdaptiveConfig, type SectionConfig } from '../db/adaptiveConfig.js';
import { readLatestSnapshot } from '../db/snapshot.js';
import type { WorkStateSnapshot } from '@zerocall/harness';

export interface FetchProfile {
  calendar: { deadlineDays: number };
  email: { newerThanDays: number; maxResults: number };
  tasks: { pageSize: number };
}

/** Hardcoded defaults matching the provider constants before any adaptation. */
export const DEFAULT_FETCH_PROFILE: FetchProfile = {
  calendar: { deadlineDays: 7 },
  email: { newerThanDays: 2, maxResults: 50 },
  tasks: { pageSize: 100 },
};

export interface AdaptiveSuggestion {
  section: keyof SectionConfig;
  action: 'disable';
  relevanceScore: number;
  projectedTokenSavings: number;
}

export interface AdaptiveStats {
  queryCount: number;
  categoryDistribution: Record<string, number>;
  sectionRelevance: Record<string, number>;
  currentConfig: SectionConfig;
  suggestions: AdaptiveSuggestion[];
  fetchProfile: FetchProfile;
}

/** Minimum queries required before we surface suggestions. */
const MIN_QUERIES_FOR_SUGGESTION = 5;

/** Sections below this relevance score are candidates for disabling. */
const SUGGESTION_THRESHOLD = 0.15;

/**
 * Maps specific query categories to the snapshot section they signal a need for.
 * 'general' queries are excluded — they don't signal any particular section need
 * and must not inflate relevance scores for sections that aren't truly needed.
 */
const CATEGORY_SIGNALS: Partial<Record<string, keyof SectionConfig>> = {
  calendar: 'calendar',
  email: 'email',
  tasks: 'tasks',
  slack: 'slack',
  // 'general' intentionally absent
};

/**
 * Estimates token count for a snapshot section by measuring its formatted
 * plain-text character length and dividing by 4 (rough chars-per-token).
 */
function estimateSectionTokens(snapshot: WorkStateSnapshot, section: keyof SectionConfig): number {
  let chars = 0;

  if (section === 'calendar') {
    for (const evt of snapshot.calendar.today) {
      chars += evt.title.length + 30;
    }
    chars += snapshot.calendar.free_blocks.length * 25;
    for (const evt of snapshot.calendar.upcoming_deadlines) {
      chars += evt.title.length + 20;
    }
    chars += 80; // section headers
  } else if (section === 'email') {
    for (const t of snapshot.email.action_required) {
      chars += t.subject.length + t.snippet.length + t.counterparty.length + 10;
    }
    for (const t of snapshot.email.awaiting_reply) {
      chars += t.subject.length + t.counterparty.length + 10;
    }
    chars += 60; // headers + unread count line
  } else if (section === 'tasks') {
    for (const t of [...snapshot.tasks.overdue, ...snapshot.tasks.due_today, ...snapshot.tasks.in_progress]) {
      chars += t.title.length + 20;
    }
    chars += 80; // section headers
  } else if (section === 'slack' && snapshot.slack) {
    for (const dm of snapshot.slack.dm_action_required) {
      chars += dm.counterparty.length + dm.snippet.length + 10;
    }
    for (const dm of snapshot.slack.dm_awaiting_reply) {
      chars += dm.counterparty.length + dm.snippet.length + 20;
    }
    chars += 60; // section headers
  }

  return Math.round(chars / 4);
}

function lerp(min: number, max: number, t: number): number {
  return min + t * (max - min);
}

/**
 * Derives a FetchProfile from the recent query distribution.
 * Sections with higher query share get deeper fetch parameters (longer time
 * windows, larger result counts). Returns DEFAULT_FETCH_PROFILE when fewer
 * than 5 specific queries have been logged — no behavioural change for new users.
 *
 * @returns FetchProfile with per-provider fetch parameters.
 */
export function computeFetchProfile(): FetchProfile {
  const queries = readRecentQueries(100);
  const specific = queries.filter(q => q.category !== 'general');
  if (specific.length < MIN_QUERIES_FOR_SUGGESTION) return DEFAULT_FETCH_PROFILE;

  const total = specific.length;
  const calendarWeight = specific.filter(q => q.category === 'calendar').length / total;
  const emailWeight    = specific.filter(q => q.category === 'email').length / total;
  const tasksWeight    = specific.filter(q => q.category === 'tasks').length / total;

  return {
    calendar: { deadlineDays: Math.round(lerp(3, 14, calendarWeight)) },
    email: {
      newerThanDays: Math.round(lerp(1, 7, emailWeight)),
      maxResults:    Math.round(lerp(10, 100, emailWeight)),
    },
    tasks: { pageSize: Math.round(lerp(50, 200, tasksWeight)) },
  };
}

/**
 * Computes adaptive stats from the recent query log:
 * category distribution, per-section relevance scores, disable suggestions,
 * and the current adaptive fetch profile.
 *
 * @returns AdaptiveStats with suggestions ready for the dashboard.
 */
export function computeAdaptiveStats(): AdaptiveStats {
  const queries = readRecentQueries(100);
  const currentConfig = readAdaptiveConfig();
  const snapshot = readLatestSnapshot();

  const categoryDistribution: Record<string, number> = {
    calendar: 0, email: 0, tasks: 0, slack: 0, general: 0,
  };

  for (const q of queries) {
    categoryDistribution[q.category] = (categoryDistribution[q.category] ?? 0) + 1;
  }

  const total = queries.length;

  // Only count specific queries (calendar/email/tasks) — general queries don't
  // signal a need for any particular section and must not inflate scores.
  const specificQueries = queries.filter(q => q.category !== 'general');
  const specificTotal = specificQueries.length;

  // For each section, relevance = fraction of specific queries that signal it.
  // Defaults to 1 (fully relevant) when there's no specific signal data yet.
  const sectionRelevance: Record<string, number> = { calendar: 1, email: 1, tasks: 1, slack: 1 };
  if (specificTotal > 0) {
    for (const section of ['calendar', 'email', 'tasks', 'slack'] as Array<keyof SectionConfig>) {
      const needed = specificQueries.filter(q => CATEGORY_SIGNALS[q.category] === section).length;
      sectionRelevance[section] = needed / specificTotal;
    }
  }

  const suggestions: AdaptiveSuggestion[] = [];

  if (total >= MIN_QUERIES_FOR_SUGGESTION && specificTotal >= MIN_QUERIES_FOR_SUGGESTION) {
    for (const section of ['calendar', 'email', 'tasks', 'slack'] as Array<keyof SectionConfig>) {
      // Only suggest disabling sections that are currently enabled
      if (!currentConfig[section]) continue;

      const relevance = sectionRelevance[section] ?? 1;
      if (relevance < SUGGESTION_THRESHOLD) {
        const tokenSavings = snapshot ? estimateSectionTokens(snapshot, section) : 0;
        suggestions.push({
          section,
          action: 'disable',
          relevanceScore: relevance,
          projectedTokenSavings: tokenSavings,
        });
      }
    }
  }

  return {
    queryCount: total,
    categoryDistribution,
    sectionRelevance,
    currentConfig,
    suggestions,
    fetchProfile: computeFetchProfile(),
  };
}
