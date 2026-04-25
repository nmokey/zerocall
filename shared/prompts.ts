export interface Prompt {
  id: string;
  text: string;
}

export const PROMPTS: Prompt[] = [
  { id: 'p01', text: "What are my action items from Arvind's lab?" },
  { id: 'p02', text: "What should I focus on right now?" },
  { id: 'p03', text: "Am I free at 3pm today?" },
  { id: 'p04', text: "Did Sarah reply to me?" },
  { id: 'p05', text: "What deadlines do I have coming up this week?" },
  { id: 'p06', text: "What meetings do I have today?" },
  { id: 'p07', text: "What tasks are overdue?" },
  { id: 'p08', text: "Who am I still waiting to hear back from?" },
  { id: 'p09', text: "What's the most urgent thing on my plate right now?" },
  { id: 'p10', text: "Do I have any free blocks this afternoon to get deep work done?" },
  { id: 'p11', text: "What emails need my attention today?" },
  { id: 'p12', text: "What are my tasks due today?" },
  { id: 'p13', text: "Summarize my work context for the day." },
  { id: 'p14', text: "Is there anything blocking the ICML submission?" },
  { id: 'p15', text: "What's on my calendar for the rest of the day?" },
  { id: 'p16', text: "Who do I need to follow up with?" },
  { id: 'p17', text: "Give me a quick standup summary." },
  { id: 'p18', text: "What tasks are in progress?" },
  { id: 'p19', text: "Do I have any unread emails I should respond to?" },
  { id: 'p20', text: "How should I prioritize the next two hours?" },
];
