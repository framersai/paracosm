/**
 * Mars colonist name lists and department distribution.
 * Extracted from kernel/colonist-generator.ts.
 */

export const MARS_FIRST_NAMES = [
  'Aria', 'Dietrich', 'Yuki', 'Marcus', 'Elena', 'Kwame', 'Sofia', 'Jin',
  'Amara', 'Liam', 'Priya', 'Omar', 'Mei', 'Carlos', 'Ingrid', 'Tariq',
  'Nadia', 'Henrik', 'Aisha', 'Pavel', 'Luna', 'Ravi', 'Zara', 'Felix',
  'Anya', 'Diego', 'Kira', 'Hassan', 'Signe', 'Jamal', 'Mila', 'Chen',
  'Fatima', 'Anders', 'Keiko', 'David', 'Olga', 'Kofi', 'Leila', 'Sven',
  'Rosa', 'Idris', 'Hana', 'Bruno', 'Daria', 'Emeka', 'Yara', 'Tomas',
  'Nia', 'Viktor',
];

export const MARS_LAST_NAMES = [
  'Chen', 'Voss', 'Tanaka', 'Webb', 'Kowalski', 'Okafor', 'Petrov', 'Kim',
  'Santos', 'Johansson', 'Patel', 'Al-Rashid', 'Nakamura', 'Fernandez', 'Berg',
  'Ibrahim', 'Volkov', 'Singh', 'Torres', 'Andersen', 'M\u00fcller', 'Zhang',
  'Osei', 'Larsson', 'Ahmad', 'Costa', 'Ivanova', 'Park', 'Eriksson', 'Diallo',
  'Sato', 'Rivera', 'Lindqvist', 'Mensah', 'Kato', 'Morales', 'Holm', 'Yusuf',
  'Takahashi', 'Reyes', 'Nkomo', 'Li', 'Herrera', 'Bakker', 'Ito', 'Mendez',
  'Dahl', 'Owusu', 'Yamamoto', 'Cruz',
];

/** Names used for Mars-born children in progression.ts */
export const MARS_CHILD_NAMES = [
  'Nova', 'Kai', 'Sol', 'Tera', 'Eos', 'Zan', 'Lyra', 'Orion',
  'Vega', 'Juno', 'Atlas', 'Iris', 'Clio', 'Pax', 'Io', 'Thea',
];

export type Department = 'medical' | 'engineering' | 'agriculture' | 'science' | 'administration' | 'psychology' | 'governance';

export const MARS_DEPARTMENT_DISTRIBUTION: Department[] = [
  'engineering', 'engineering', 'engineering', 'engineering',
  'medical', 'medical', 'medical',
  'agriculture', 'agriculture', 'agriculture',
  'science', 'science', 'science',
  'administration', 'administration',
  'psychology',
];

export const MARS_SPECIALIZATIONS: Record<string, string[]> = {
  medical: ['General Medicine', 'Radiation Medicine', 'Surgery', 'Psychiatry', 'Emergency Medicine'],
  engineering: ['Structural', 'Life Support', 'Power Systems', 'Communications', 'Robotics'],
  agriculture: ['Hydroponics', 'Soil Science', 'Botany', 'Nutrition', 'Water Systems'],
  science: ['Geology', 'Atmospheric Science', 'Biology', 'Chemistry', 'Astrophysics'],
  administration: ['Operations', 'Logistics', 'HR', 'Communications', 'Planning'],
  psychology: ['Clinical Psychology', 'Social Psychology', 'Occupational Therapy'],
  governance: ['Policy', 'Law', 'Diplomacy'],
};
