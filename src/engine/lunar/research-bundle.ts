import type { KnowledgeBundle } from '../types.js';

export const LUNAR_KNOWLEDGE_BUNDLE: KnowledgeBundle = {
  topics: {
    'water-ice': {
      canonicalFacts: [
        { claim: 'LCROSS mission confirmed water ice in permanently shadowed craters at the lunar south pole', source: 'Colaprete et al. 2010, Science', url: 'https://doi.org/10.1126/science.1186986', doi: '10.1126/science.1186986' },
        { claim: 'Chandrayaan-1 Moon Mineralogy Mapper detected widespread hydroxyl/water on the lunar surface', source: 'Pieters et al. 2009, Science', url: 'https://doi.org/10.1126/science.1178658', doi: '10.1126/science.1178658' },
      ],
      counterpoints: [],
      departmentNotes: { mining: 'Water ice extraction requires operating in permanently shadowed craters at ~40K.' },
    },
    regolith: {
      canonicalFacts: [
        { claim: 'Lunar regolith contains nano-scale iron particles and is abrasive and electrostatically charged', source: 'Taylor et al. 2005', url: 'https://doi.org/10.1016/j.asr.2005.01.020', doi: '10.1016/j.asr.2005.01.020' },
        { claim: 'Apollo astronauts reported regolith irritation and equipment damage from fine lunar dust', source: 'NASA Apollo Lessons Learned', url: 'https://www.nasa.gov/artemis' },
      ],
      counterpoints: [],
      departmentNotes: { medical: 'Regolith dust is a respiratory and ocular hazard. No established exposure limits.' },
    },
    'low-gravity': {
      canonicalFacts: [
        { claim: 'Lunar gravity is 1.62 m/s2 (1/6 Earth). Long-term physiological effects unknown.', source: 'NASA Human Research Program', url: 'https://www.nasa.gov/hrp' },
        { claim: 'ISS data shows significant bone and muscle loss in microgravity; partial gravity effects are modeled but untested', source: 'Sibonga et al. 2019', url: 'https://doi.org/10.1038/s41526-019-0075-2', doi: '10.1038/s41526-019-0075-2' },
      ],
      counterpoints: [],
      departmentNotes: { medical: 'Exercise countermeasures designed for 0g may be insufficient for 1/6g long-duration stays.' },
    },
    power: {
      canonicalFacts: [
        { claim: 'Lunar south pole peaks of eternal light receive near-continuous sunlight for solar power', source: 'Bussey et al. 2010, Icarus', url: 'https://doi.org/10.1016/j.icarus.2010.08.005', doi: '10.1016/j.icarus.2010.08.005' },
        { claim: 'NASA Kilopower fission reactor designed for 1-10 kW lunar surface power', source: 'NASA STMD Kilopower', url: 'https://www.nasa.gov/kilopower' },
      ],
      counterpoints: [
        { claim: 'Lunar night at non-polar locations lasts ~14 Earth days, requiring energy storage or nuclear backup', source: 'Engineering analysis', url: 'https://www.nasa.gov/artemis' },
      ],
      departmentNotes: { engineering: 'Solar viable at poles. Nuclear required for non-polar or lava tube locations.' },
    },
    communications: {
      canonicalFacts: [
        { claim: 'Earth-Moon signal delay is approximately 1.3 seconds one-way', source: 'NASA', url: 'https://moon.nasa.gov/' },
        { claim: 'Lunar far side requires relay satellite for Earth communication (e.g., Queqiao relay for Chang\'e 4)', source: 'ESA/CNSA', url: 'https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Exploration/Gateway' },
      ],
      counterpoints: [],
      departmentNotes: { communications: 'Near-real-time communication possible from south pole. Far side requires relay infrastructure.' },
    },
    infrastructure: {
      canonicalFacts: [
        { claim: 'Lunar lava tubes can be hundreds of meters wide, providing natural radiation shielding', source: 'Haruyama et al. 2009, GRL', url: 'https://doi.org/10.1029/2009GL040635', doi: '10.1029/2009GL040635' },
        { claim: 'In-situ resource utilization (ISRU) can produce construction materials from lunar regolith', source: 'NASA ISRU', url: 'https://www.nasa.gov/isru' },
      ],
      counterpoints: [],
      departmentNotes: { engineering: 'Regolith sintering and 3D printing for habitat construction under active development.' },
    },
  },
  categoryMapping: {
    environmental: ['regolith', 'power'],
    resource: ['water-ice', 'power', 'regolith'],
    medical: ['low-gravity', 'regolith'],
    psychological: ['communications'],
    political: ['communications'],
    infrastructure: ['infrastructure', 'power'],
    social: ['communications', 'low-gravity'],
    technological: ['infrastructure', 'communications'],
  },
};
