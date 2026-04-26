import { readRecentQueries } from '../db/queryLog.js';
import { readAdaptiveConfig, type SectionConfig } from '../db/adaptiveConfig.js';
import { readLatestSnapshot } from '../db/snapshot.js';
import type { WorkStateSnapshot } from '@onecall/harness';

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
}

/** Minimum queries required before we surface suggestions. */
const MIN_QUERIES_FOR_SUGGESTION = 5;

/** Sections below this relevance score are candidates for disabling. */
const SUGGESTION_THRESHOLD = 0.15;

/**
 * Maps query categories to the snapshot sections they require.
 * 'general' queries are assumed to need all sections.
 */
const CATEGORY_NEEDS: Record<string, Array<keyof SectionConfig>> = {
  calendar: ['calendar'],
  email: ['email'],
  tasks: ['tasks'],
  general: ['calendar', 'email', 'tasks'],
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
  }

  return Math.round(chars / 4);
}

/**
 * Computes adaptive stats from the recent query log:
 * category distribution, per-section relevance scores, and disable suggestions.
 *
 * @returns AdaptiveStats with suggestions ready for the dashboard.
 */
export function computeAdaptiveStats(): AdaptiveStats {
  const queries = readRecentQueries(100);
  const currentConfig = readAdaptiveConfig();
  const snapshot = readLatestSnapshot();

  const categoryDistribution: Record<string, number> = {
    calendar: 0, email: 0, tasks: 0, general: 0,
  };

  for (const q of queries) {
    categoryDistribution[q.category] = (categoryDistribution[q.category] ?? 0) + 1;
  }

  const total = queries.length;

  // For each section, compute what fraction of queries needed it
  const sectionRelevance: Record<string, number> = { calendar: 1, email: 1, tasks: 1 };
  if (total > 0) {
    for (const section of ['calendar', 'email', 'tasks'] as Array<keyof SectionConfig>) {
      let needed = 0;
      for (const q of queries) {
        const needs = CATEGORY_NEEDS[q.category] ?? CATEGORY_NEEDS.general;
        if (needs.includes(section)) needed++;
      }
      sectionRelevance[section] = needed / total;
    }
  }

  const suggestions: AdaptiveSuggestion[] = [];

  if (total >= MIN_QUERIES_FOR_SUGGESTION) {
    for (const section of ['calendar', 'email', 'tasks'] as Array<keyof SectionConfig>) {
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
  };
}
