export interface ScenarioEventDef {
  id: string;
  label: string;
  icon: string;
  color: string;
}

/** Mars event type definitions matching TurnEvent['type'] from kernel/state.ts */
export const MARS_EVENT_DEFINITIONS: ScenarioEventDef[] = [
  { id: 'crisis', label: 'Crisis', icon: '⚠️', color: '#ef4444' },
  { id: 'decision', label: 'Decision', icon: '⚡', color: '#f59e0b' },
  { id: 'birth', label: 'Birth', icon: '👶', color: '#22c55e' },
  { id: 'death', label: 'Death', icon: '💀', color: '#6b7280' },
  { id: 'promotion', label: 'Promotion', icon: '⬆️', color: '#3b82f6' },
  { id: 'relationship', label: 'Relationship', icon: '💕', color: '#ec4899' },
  { id: 'tool_forge', label: 'Tool Forged', icon: '🔧', color: '#8b5cf6' },
  { id: 'system', label: 'System', icon: '⚙️', color: '#64748b' },
];
