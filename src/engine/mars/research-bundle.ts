import type { KnowledgeBundle } from '../types.js';

/**
 * Mars knowledge bundle. Extracted from research/knowledge-base.ts.
 * All DOI-linked citations organized by topic with category mapping.
 */
export const MARS_KNOWLEDGE_BUNDLE: KnowledgeBundle = {
  topics: {
    radiation: {
      canonicalFacts: [
        { claim: 'Mars surface radiation averages 0.67 mSv/day, approximately 20x Earth background', source: 'Hassler et al. 2014, Science', url: 'https://doi.org/10.1126/science.1244797', doi: '10.1126/science.1244797' },
        { claim: 'NASA radiation risk model establishes dose-response for astronaut cancer risk', source: 'Cucinotta et al. 2010', url: 'https://doi.org/10.1667/RR2397.1', doi: '10.1667/RR2397.1' },
        { claim: 'September 2017 solar event measured by Curiosity RAD showed significant dose spike', source: 'Guo et al. 2018, GRL', url: 'https://doi.org/10.1029/2018GL077731', doi: '10.1029/2018GL077731' },
      ],
      counterpoints: [],
      departmentNotes: {
        medical: 'Acute radiation syndrome threshold: 100 mSv causes blood count changes. 1000+ mSv is life-threatening.',
        engineering: 'Reinforced core habitat rated for CME. Expansion modules have minimal shielding.',
      },
    },
    water: {
      canonicalFacts: [
        { claim: 'Mars subsurface ice confirmed at multiple latitudes by MARSIS and SHARAD radar', source: 'Plaut et al. 2007', url: 'https://doi.org/10.1126/science.1139672', doi: '10.1126/science.1139672' },
        { claim: 'MOXIE on Perseverance demonstrated in-situ oxygen extraction from Mars atmosphere', source: 'NASA Mars 2020', url: 'https://mars.nasa.gov/mars2020/spacecraft/instruments/moxie/' },
        { claim: 'Mars atmosphere contains 0.03% water vapor, seasonally variable', source: 'Smith 2004, Icarus', url: 'https://doi.org/10.1016/j.icarus.2003.09.027', doi: '10.1016/j.icarus.2003.09.027' },
      ],
      counterpoints: [
        { claim: 'Deep drilling risks contaminating pristine subsurface aquifers with biological material', source: 'Planetary protection protocols', url: 'https://planetaryprotection.nasa.gov/' },
      ],
      departmentNotes: {
        engineering: 'Deep drilling requires significant power draw. WAVAR system proven on ISS heritage.',
        agriculture: 'Water shortfall directly impacts food production capacity.',
      },
    },
    food: {
      canonicalFacts: [
        { claim: 'Hydroponics can produce 2-5x crop yield per area compared to soil farming', source: 'NASA Advanced Life Support', url: 'https://www.nasa.gov/humans-in-space/eclss/' },
      ],
      counterpoints: [],
      departmentNotes: { agriculture: 'Hydroponics eliminates soil contact entirely but requires 30% more power.' },
    },
    perchlorate: {
      canonicalFacts: [
        { claim: 'Phoenix lander detected 0.5-1% calcium perchlorate in Mars soil globally', source: 'Hecht et al. 2009, Science', url: 'https://doi.org/10.1126/science.1172339', doi: '10.1126/science.1172339' },
        { claim: 'Perchlorate is a thyroid toxin at chronic exposure above 0.7 ug/kg/day', source: 'EPA reference dose', url: 'https://www.epa.gov/sdwa/perchlorate-drinking-water' },
        { claim: 'Perchlorate-reducing bacteria (Dechloromonas) can bioremediate contaminated soil', source: 'Davila et al. 2013', url: 'https://doi.org/10.1089/ast.2013.0995', doi: '10.1089/ast.2013.0995' },
      ],
      counterpoints: [
        { claim: 'Bioremediation has not been tested in Mars atmospheric conditions', source: 'Cockell 2014', url: 'https://doi.org/10.1089/ast.2013.1129' },
      ],
      departmentNotes: {
        medical: 'Perchlorate exposure pathway: ingestion via contaminated crops. Thyroid disruption risk.',
        agriculture: 'Hydroponics eliminates soil contact. Bioremediation requires 2-year R&D.',
      },
    },
    'life-support': {
      canonicalFacts: [
        { claim: 'NASA ECLSS regenerative life support on ISS supports 6-7 crew on ~11,000 kg system', source: 'NASA ECLSS', url: 'https://www.nasa.gov/humans-in-space/eclss/' },
        { claim: 'Mars habitat sizing for 100+ crew requires modular expandable architecture', source: 'Do et al. 2016, AIAA', url: 'https://doi.org/10.2514/6.2016-5526', doi: '10.2514/6.2016-5526' },
      ],
      counterpoints: [
        { claim: 'Rapid population increase strains life support beyond designed capacity', source: 'Engineering analysis', url: 'https://www.nasa.gov/humans-in-space/eclss/' },
      ],
      departmentNotes: { engineering: 'Life support expansion requires 18 months construction.' },
    },
    'bone-density': {
      canonicalFacts: [
        { claim: 'ISS bone density studies show significant loss in microgravity', source: 'Sibonga et al. 2019, npj Microgravity', url: 'https://doi.org/10.1038/s41526-019-0075-2', doi: '10.1038/s41526-019-0075-2' },
        { claim: 'Mars gravity is 3.72 m/s2 (38% of Earth)', source: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
        { claim: 'Cardiovascular adaptation in spaceflight includes cardiac chamber enlargement', source: 'Hughson et al. 2018, CMAJ', url: 'https://doi.org/10.1503/cmaj.180343', doi: '10.1503/cmaj.180343' },
      ],
      counterpoints: [],
      departmentNotes: { medical: 'Mars-born children show 12% lower bone mineral density. May never tolerate Earth gravity.' },
    },
    psychology: {
      canonicalFacts: [
        { claim: 'Mars-500 study observed depression, altered sleep cycles, and social withdrawal in 520-day isolation', source: 'Basner et al. 2014, PNAS', url: 'https://doi.org/10.1073/pnas.1212646110', doi: '10.1073/pnas.1212646110' },
        { claim: 'Antarctic overwinter studies document psychological effects of long-term isolation', source: 'Palinkas & Suedfeld 2008', url: 'https://doi.org/10.1146/annurev.psych.58.110405.085726', doi: '10.1146/annurev.psych.58.110405.085726' },
      ],
      counterpoints: [],
      departmentNotes: { psychology: 'Clinical depression rates in isolated populations range from 20-40%.' },
    },
    isolation: {
      canonicalFacts: [
        { claim: 'Solar conjunction blocks Earth-Mars communication for approximately 14 days', source: 'NASA Solar Conjunction', url: 'https://mars.nasa.gov/all-about-mars/night-sky/solar-conjunction/' },
        { claim: 'Mars-Earth light delay ranges from 4 to 24 minutes one-way', source: 'NASA', url: 'https://mars.nasa.gov/all-about-mars/night-sky/solar-conjunction/' },
      ],
      counterpoints: [],
      departmentNotes: { engineering: 'Colony must handle emergencies autonomously during blackout periods.' },
    },
    governance: {
      canonicalFacts: [
        { claim: 'Communication delay makes real-time governance of off-world colonies impractical', source: 'Zubrin 1996, The Case for Mars', url: 'https://en.wikipedia.org/wiki/The_Case_for_Mars' },
      ],
      counterpoints: [],
      departmentNotes: { governance: 'No legal framework for extraterrestrial sovereignty exists in current international law.' },
    },
    terraforming: {
      canonicalFacts: [
        { claim: 'Jakosky & Edwards (2018) concluded Mars lacks sufficient CO2 for significant atmospheric thickening', source: 'Jakosky & Edwards 2018, Nature Astronomy', url: 'https://doi.org/10.1038/s41550-018-0529-6', doi: '10.1038/s41550-018-0529-6' },
        { claim: 'Zubrin & McKay (1993) argued terraforming is feasible with sufficient energy input', source: 'Zubrin & McKay 1993', url: 'https://doi.org/10.1089/153110703769016389', doi: '10.1089/153110703769016389' },
      ],
      counterpoints: [
        { claim: 'Mars atmospheric pressure is 0.6 kPa vs Earth 101.3 kPa. Gap is enormous.', source: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
      ],
      departmentNotes: {},
    },
    infrastructure: {
      canonicalFacts: [
        { claim: 'Arcadia Planitia contains extensive subsurface ice deposits detected by MARSIS radar', source: 'Mars Express MARSIS', url: 'https://www.esa.int/Science_Exploration/Space_Science/Mars_Express' },
        { claim: 'CRISM spectrometer detected diverse hydrated minerals in Valles Marineris walls', source: 'Murchie et al. 2009, JGR', url: 'https://doi.org/10.1029/2009JE003342', doi: '10.1029/2009JE003342' },
      ],
      counterpoints: [
        { claim: 'Valles Marineris terrain slopes up to 30 degrees increase construction difficulty', source: 'HiRISE terrain analysis', url: 'https://www.uahirise.org/' },
      ],
      departmentNotes: { engineering: 'Flat terrain dramatically simplifies construction. Slopes require terracing.' },
    },
    communication: {
      canonicalFacts: [
        { claim: 'Solar conjunction blocks Earth-Mars communication for approximately 14 days', source: 'NASA Solar Conjunction', url: 'https://mars.nasa.gov/all-about-mars/night-sky/solar-conjunction/' },
      ],
      counterpoints: [],
      departmentNotes: {},
    },
    population: {
      canonicalFacts: [
        { claim: 'Hohmann transfer window Earth-Mars occurs every 26 months with 6-9 month transit', source: 'NASA Mars missions', url: 'https://science.nasa.gov/planetary-science/programs/mars-exploration/' },
      ],
      counterpoints: [],
      departmentNotes: { psychology: 'Rapid population influx creates social integration challenges.' },
    },
    'solar-events': {
      canonicalFacts: [
        { claim: 'Mars lost its global magnetic field approximately 4 billion years ago', source: 'Acuna et al. 1999, Science', url: 'https://doi.org/10.1126/science.284.5415.790', doi: '10.1126/science.284.5415.790' },
        { claim: 'September 2017 solar event measured by Curiosity RAD showed significant dose spike', source: 'Guo et al. 2018, GRL', url: 'https://doi.org/10.1029/2018GL077731', doi: '10.1029/2018GL077731' },
      ],
      counterpoints: [],
      departmentNotes: {
        medical: 'Acute exposure of 100-500 mSv over 6 hours during CME events.',
        engineering: 'Core habitat shielded (50+ g/cm2). Expansion modules minimal (5-10 g/cm2).',
      },
    },
    generational: {
      canonicalFacts: [
        { claim: 'Complex adaptive systems exhibit path dependence where early decisions compound', source: 'Arthur 1994', url: 'https://en.wikipedia.org/wiki/Increasing_returns' },
      ],
      counterpoints: [],
      departmentNotes: {},
    },
    independence: {
      canonicalFacts: [
        { claim: 'Communication delay makes real-time governance of off-world colonies impractical', source: 'Zubrin 1996', url: 'https://en.wikipedia.org/wiki/The_Case_for_Mars' },
      ],
      counterpoints: [],
      departmentNotes: { governance: 'Self-sufficiency in food and water is a prerequisite for political independence.' },
    },
    medical: {
      canonicalFacts: [
        { claim: 'Mars surface radiation averages 0.67 mSv/day', source: 'Hassler et al. 2014', url: 'https://doi.org/10.1126/science.1244797', doi: '10.1126/science.1244797' },
      ],
      counterpoints: [],
      departmentNotes: { medical: 'Radiation exposure identical at both candidate sites. Long-term cumulative dose is the primary concern.' },
    },
  },
  categoryMapping: {
    environmental: ['radiation', 'solar-events', 'infrastructure'],
    resource: ['water', 'food', 'perchlorate', 'life-support'],
    medical: ['medical', 'radiation', 'bone-density'],
    psychological: ['psychology', 'isolation', 'generational'],
    political: ['governance', 'independence', 'communication'],
    infrastructure: ['infrastructure', 'life-support'],
    social: ['psychology', 'generational', 'population'],
    technological: ['communication', 'infrastructure'],
  },
};
