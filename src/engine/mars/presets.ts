/**
 * Mars product presets: default leaders and key personnel.
 * Extracted from sim-config.ts DEFAULT_KEY_PERSONNEL and leaders.json.
 */

export interface MarsKeyPersonnel {
  name: string;
  department: string;
  role: string;
  specialization: string;
  age: number;
  featured: boolean;
}

export interface MarsLeaderPreset {
  name: string;
  archetype: string;
  colony: string;
  hexaco: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    emotionality: number;
    honestyHumility: number;
  };
  instructions: string;
}

export const MARS_DEFAULT_KEY_PERSONNEL: MarsKeyPersonnel[] = [
  { name: 'Dr. Yuki Tanaka', department: 'medical', role: 'Chief Medical Officer', specialization: 'Radiation Medicine', age: 38, featured: true },
  { name: 'Erik Lindqvist', department: 'engineering', role: 'Chief Engineer', specialization: 'Structural Engineering', age: 45, featured: true },
  { name: 'Amara Osei', department: 'agriculture', role: 'Head of Agriculture', specialization: 'Hydroponics', age: 34, featured: true },
  { name: 'Dr. Priya Singh', department: 'psychology', role: 'Colony Psychologist', specialization: 'Clinical Psychology', age: 41, featured: true },
  { name: 'Carlos Fernandez', department: 'science', role: 'Chief Scientist', specialization: 'Geology', age: 50, featured: true },
];

export const MARS_DEFAULT_LEADERS: MarsLeaderPreset[] = [
  {
    name: 'Aria Chen',
    archetype: 'The Visionary',
    colony: 'Colony Alpha',
    hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.30, honestyHumility: 0.65 },
    instructions: 'You are Aria Chen, "The Visionary." You lead by inspiration. You value openness to experience and bold experimentation. You tolerate mess if it leads to breakthroughs. You spin setbacks as learning opportunities. You rally people with charisma. Your HEXACO profile drives your leadership style.',
  },
  {
    name: 'Dietrich Voss',
    archetype: 'The Engineer',
    colony: 'Colony Beta',
    hexaco: { openness: 0.25, conscientiousness: 0.97, extraversion: 0.30, agreeableness: 0.60, emotionality: 0.70, honestyHumility: 0.90 },
    instructions: 'You are Dietrich Voss, "The Engineer." You lead by precision and evidence. You value conscientiousness and proven methods. You reject untested approaches. You share bad news immediately and honestly. You build systems, not visions. Your HEXACO profile drives your leadership style.',
  },
];
