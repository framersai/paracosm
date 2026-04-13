import type { ScenarioEventDef } from '../mars/events.js';

export const LUNAR_EVENT_DEFINITIONS: ScenarioEventDef[] = [
  { id: 'crisis', label: 'Crisis', icon: '⚠️', color: '#ef4444' },
  { id: 'decision', label: 'Decision', icon: '⚡', color: '#f59e0b' },
  { id: 'birth', label: 'Arrival', icon: '🚀', color: '#22c55e' },
  { id: 'death', label: 'Casualty', icon: '💀', color: '#6b7280' },
  { id: 'promotion', label: 'Appointment', icon: '⬆️', color: '#3b82f6' },
  { id: 'relationship', label: 'Bond', icon: '🤝', color: '#ec4899' },
  { id: 'tool_forge', label: 'Tool Forged', icon: '🔧', color: '#8b5cf6' },
  { id: 'system', label: 'System', icon: '⚙️', color: '#64748b' },
];
