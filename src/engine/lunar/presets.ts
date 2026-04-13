export interface LunarKeyPersonnel {
  name: string;
  department: string;
  role: string;
  specialization: string;
  age: number;
  featured: boolean;
}

export interface LunarLeaderPreset {
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

export const LUNAR_DEFAULT_KEY_PERSONNEL: LunarKeyPersonnel[] = [
  { name: 'Dr. Sarah Anderson', department: 'medical', role: 'Chief Medical Officer', specialization: 'Aerospace Medicine', age: 42, featured: true },
  { name: 'James Mueller', department: 'engineering', role: 'Chief Engineer', specialization: 'Structural Systems', age: 48, featured: true },
  { name: 'Dr. Yuki Nakamura', department: 'mining', role: 'Mining Operations Lead', specialization: 'ISRU Engineering', age: 39, featured: true },
  { name: 'Chen Wei', department: 'life-support', role: 'Life Support Chief', specialization: 'ECLSS Design', age: 44, featured: true },
  { name: 'Maria Santos', department: 'communications', role: 'Communications Officer', specialization: 'Deep Space Networks', age: 36, featured: true },
];

export const LUNAR_DEFAULT_LEADERS: LunarLeaderPreset[] = [
  {
    name: 'Commander Sarah Lindgren',
    archetype: 'The Pioneer',
    colony: 'Shackleton Base',
    hexaco: { openness: 0.85, conscientiousness: 0.60, extraversion: 0.75, agreeableness: 0.65, emotionality: 0.35, honestyHumility: 0.70 },
    instructions: 'You are Commander Sarah Lindgren, "The Pioneer." You balance ambition with crew safety. You push boundaries but respect engineering limits. You communicate openly. Your HEXACO profile drives your leadership style.',
  },
  {
    name: 'Commander Raj Patel',
    archetype: 'The Methodologist',
    colony: 'Artemis Station',
    hexaco: { openness: 0.35, conscientiousness: 0.90, extraversion: 0.40, agreeableness: 0.70, emotionality: 0.60, honestyHumility: 0.85 },
    instructions: 'You are Commander Raj Patel, "The Methodologist." You follow procedures. You document everything. You prioritize crew welfare over discovery timelines. Cautious, thorough, transparent. Your HEXACO profile drives your leadership style.',
  },
];
