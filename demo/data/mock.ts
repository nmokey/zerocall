import type { WorkStateSnapshot } from '@onecall/harness';

export const MOCK_SNAPSHOT: WorkStateSnapshot = {
  as_of: '2026-04-24T09:00:00Z',

  calendar: {
    today: [
      {
        id: 'evt_001',
        title: 'Arvind Lab Meeting',
        start: '2026-04-24T10:00:00Z',
        end: '2026-04-24T11:00:00Z',
        attendees: ['arvind@cs.ucla.edu', 'sarah@cs.ucla.edu', 'ryab@g.ucla.edu'],
        location: 'Boelter 4760',
        meeting_link: 'https://zoom.us/j/123456789',
      },
      {
        id: 'evt_002',
        title: 'CS 269 Lecture',
        start: '2026-04-24T14:00:00Z',
        end: '2026-04-24T15:30:00Z',
        attendees: ['ryab@g.ucla.edu'],
        location: 'Franz Hall 1178',
      },
      {
        id: 'evt_003',
        title: 'Research sync w/ Sarah',
        start: '2026-04-24T16:00:00Z',
        end: '2026-04-24T16:30:00Z',
        attendees: ['sarah@cs.ucla.edu', 'ryab@g.ucla.edu'],
        meeting_link: 'https://meet.google.com/abc-defg-hij',
      },
    ],
    free_blocks: [
      { start: '2026-04-24T09:00:00Z', end: '2026-04-24T10:00:00Z', duration_minutes: 60 },
      { start: '2026-04-24T11:00:00Z', end: '2026-04-24T14:00:00Z', duration_minutes: 180 },
      { start: '2026-04-24T15:30:00Z', end: '2026-04-24T16:00:00Z', duration_minutes: 30 },
    ],
    upcoming_deadlines: [
      {
        id: 'evt_101',
        title: 'CS 269 Project Proposal Due',
        start: '2026-04-26T23:59:00Z',
        end: '2026-04-26T23:59:00Z',
        attendees: [],
      },
      {
        id: 'evt_102',
        title: 'Deadline: ICML submission',
        start: '2026-04-28T17:00:00Z',
        end: '2026-04-28T17:00:00Z',
        attendees: ['arvind@cs.ucla.edu', 'sarah@cs.ucla.edu', 'ryab@g.ucla.edu'],
      },
    ],
  },

  email: {
    action_required: [
      {
        thread_id: 'th_001',
        subject: 'Action items from today\'s lab meeting',
        counterparty: 'Arvind Kumar <arvind@cs.ucla.edu>',
        last_message_at: '2026-04-24T11:15:00Z',
        snippet: 'Hi all, following up on today\'s meeting. Ryan, can you take the lead on the eval pipeline and send a draft by Friday? Sarah will handle the lit review.',
      },
      {
        thread_id: 'th_002',
        subject: 'Re: ICML submission — author list',
        counterparty: 'Sarah Chen <sarah@cs.ucla.edu>',
        last_message_at: '2026-04-24T08:45:00Z',
        snippet: 'Hey Ryan, Arvind wants to finalize the author list today. Can you confirm your middle initial and affiliation for the camera-ready?',
      },
      {
        thread_id: 'th_003',
        subject: 'TA office hours coverage this week',
        counterparty: 'Prof. Cho <cho@cs.ucla.edu>',
        last_message_at: '2026-04-23T17:30:00Z',
        snippet: 'Ryan — are you able to cover Thursday 3-5pm office hours? Marcus is out and I need someone to step in.',
      },
    ],
    awaiting_reply: [
      {
        thread_id: 'th_004',
        subject: 'GPU cluster access request',
        counterparty: 'HPC Support <hpc-support@seas.ucla.edu>',
        last_message_at: '2026-04-22T14:00:00Z',
        snippet: 'Hi, I submitted the access request form for the A100 cluster last week. Just following up to see if there\'s a timeline.',
        waiting_since: '2026-04-22T14:00:00Z',
      },
      {
        thread_id: 'th_005',
        subject: 'Coffee chat?',
        counterparty: 'Marcus Lee <marcus@cs.ucla.edu>',
        last_message_at: '2026-04-23T10:00:00Z',
        snippet: 'Hey Marcus, would love to catch up and hear about your internship. Free any afternoon this week?',
        waiting_since: '2026-04-23T10:00:00Z',
      },
    ],
    unread_count: 14,
  },

  tasks: {
    overdue: [
      {
        id: 'task_001',
        title: 'Write related work section for ICML draft',
        due: '2026-04-22T23:59:00Z',
        status: 'In Progress',
        url: 'https://notion.so/task_001',
        source: 'notion',
      },
    ],
    due_today: [
      {
        id: 'task_002',
        title: 'Set up eval pipeline for benchmark suite',
        due: '2026-04-24T23:59:00Z',
        status: 'Not Started',
        url: 'https://notion.so/task_002',
        source: 'notion',
      },
      {
        id: 'task_003',
        title: 'Review Sarah\'s lit review draft',
        due: '2026-04-24T23:59:00Z',
        status: 'Not Started',
        url: 'https://notion.so/task_003',
        source: 'notion',
      },
    ],
    in_progress: [
      {
        id: 'task_004',
        title: 'Implement attention visualization module',
        status: 'In Progress',
        url: 'https://notion.so/task_004',
        source: 'notion',
      },
      {
        id: 'task_005',
        title: 'Reproduce baseline results from prior paper',
        status: 'In Progress',
        url: 'https://notion.so/task_005',
        source: 'notion',
      },
    ],
  },

  meta: {
    sync_duration_ms: 1840,
    sources: ['gmail', 'gcal', 'notion'],
    errors: [],
  },
};

// Raw responses the "without OneCall" agent would need to make separately
export const MOCK_GMAIL_THREADS = MOCK_SNAPSHOT.email.action_required.concat(
  MOCK_SNAPSHOT.email.awaiting_reply
);

export const MOCK_CALENDAR_EVENTS = [
  ...MOCK_SNAPSHOT.calendar.today,
  ...MOCK_SNAPSHOT.calendar.upcoming_deadlines,
];

export const MOCK_NOTION_TASKS = [
  ...MOCK_SNAPSHOT.tasks.overdue,
  ...MOCK_SNAPSHOT.tasks.due_today,
  ...MOCK_SNAPSHOT.tasks.in_progress,
];
