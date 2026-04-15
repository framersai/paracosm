/** Department color map — matches the Paracosm theme. */
export const DEPARTMENT_COLORS: Record<string, string> = {
  medical: '#4ecdc4',
  engineering: '#e8b44a',
  agriculture: '#6aad48',
  psychology: '#9b6b9e',
  governance: '#e06530',
};

/** Fallback color for departments not in the map (custom scenarios). */
export const DEFAULT_DEPT_COLOR = '#a89878';

export interface CellSnapshot {
  agentId: string;
  name: string;
  department: string;
  role: string;
  rank: 'junior' | 'senior' | 'lead' | 'chief';
  alive: boolean;
  marsborn: boolean;
  psychScore: number;
  partnerId?: string;
  childrenIds: string[];
  featured: boolean;
  mood: string;
  shortTermMemory: string[];
}

export interface TurnSnapshot {
  turn: number;
  year: number;
  cells: CellSnapshot[];
  population: number;
  morale: number;
  foodReserve: number;
  deaths: number;
  births: number;
}

/** A node in the force simulation. Extends CellSnapshot with position/velocity. */
export interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;
  department: string;
  rank: 'junior' | 'senior' | 'lead' | 'chief';
  alive: boolean;
  marsborn: boolean;
  psychScore: number;
  partnerId?: string;
  childrenIds: string[];
  featured: boolean;
  mood: string;
}

/** Cell sizes in pixels by rank. */
export const RANK_SIZES: Record<string, number> = {
  junior: 8,
  senior: 10,
  lead: 12,
  chief: 14,
};
