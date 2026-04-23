import type { KnowledgeBundle } from '../types.js';

/**
 * Lunar Outpost knowledge bundle. DOI-linked citations organized by topic.
 * Covers Artemis program science, regolith toxicology, ISRU, low-gravity
 * physiology, power systems, communications, and habitat engineering.
 */
export const LUNAR_KNOWLEDGE_BUNDLE: KnowledgeBundle = {
  topics: {
    'water-ice': {
      canonicalFacts: [
        { claim: 'LCROSS mission confirmed water ice in permanently shadowed craters at the lunar south pole', source: 'Colaprete et al. 2010, Science', url: 'https://doi.org/10.1126/science.1186986', doi: '10.1126/science.1186986' },
        { claim: 'Chandrayaan-1 Moon Mineralogy Mapper detected widespread hydroxyl/water on the lunar surface', source: 'Pieters et al. 2009, Science', url: 'https://doi.org/10.1126/science.1178658', doi: '10.1126/science.1178658' },
        { claim: 'Neutron spectrometer data from Lunar Prospector mapped hydrogen concentrations in polar cold traps', source: 'Feldman et al. 1998, Science', url: 'https://doi.org/10.1126/science.281.5382.1496', doi: '10.1126/science.281.5382.1496' },
        { claim: 'ISRU water extraction from lunar regolith could yield 100-1000 kg per excavation cycle', source: 'Sanders & Larson 2015, NASA ISRU Roadmap', url: 'https://www.nasa.gov/isru' },
      ],
      counterpoints: [
        { claim: 'Permanently shadowed crater temperatures reach 40K, requiring heated extraction equipment', source: 'Paige et al. 2010, Science', url: 'https://doi.org/10.1126/science.1187726' },
        { claim: 'Ice deposits may be mixed with regolith at low concentrations (1-10% by weight), complicating extraction', source: 'Li et al. 2018, PNAS', url: 'https://doi.org/10.1073/pnas.1802345115' },
      ],
      departmentNotes: {
        mining: 'Water ice extraction requires operating in permanently shadowed craters at 40K. Heated drills and volatile capture systems needed.',
        'life-support': 'Water budget: 2.5L per person per day drinking, 25L total with recycling losses.',
      },
    },
    regolith: {
      canonicalFacts: [
        { claim: 'Lunar regolith contains nano-scale iron particles and is abrasive and electrostatically charged', source: 'Taylor et al. 2005', url: 'https://doi.org/10.1016/j.asr.2005.01.020', doi: '10.1016/j.asr.2005.01.020' },
        { claim: 'Apollo astronauts reported regolith irritation: eye, skin, and respiratory symptoms after EVA', source: 'NASA Apollo Lessons Learned', url: 'https://www.nasa.gov/artemis' },
        { claim: 'Lunar dust adheres to all surfaces via van der Waals forces and triboelectric charging', source: 'Abbas et al. 2007, JGR', url: 'https://doi.org/10.1029/2005JE002625', doi: '10.1029/2005JE002625' },
        { claim: 'Simulated lunar dust causes inflammation and DNA damage in human lung cells in vitro', source: 'Lam et al. 2013, Inhalation Toxicology', url: 'https://doi.org/10.3109/08958378.2013.803614', doi: '10.3109/08958378.2013.803614' },
      ],
      counterpoints: [
        { claim: 'No established occupational exposure limits exist for lunar dust; Apollo exposures were brief', source: 'Cain 2010, Acta Astronautica', url: 'https://doi.org/10.1016/j.actaastro.2010.01.012' },
      ],
      departmentNotes: {
        medical: 'Regolith dust is a respiratory and ocular hazard. Chronic exposure effects unknown. No safe dose established.',
        engineering: 'Airlock dust mitigation is critical. Electrostatic precipitation and magnetic filtration under development.',
      },
    },
    'low-gravity': {
      canonicalFacts: [
        { claim: 'Lunar gravity is 1.62 m/s2 (1/6 Earth). Long-term partial gravity physiological effects are unknown.', source: 'NASA Human Research Program', url: 'https://www.nasa.gov/hrp' },
        { claim: 'ISS bone density studies show 1-2% loss per month in microgravity; partial gravity effects are modeled but untested', source: 'Sibonga et al. 2019, npj Microgravity', url: 'https://doi.org/10.1038/s41526-019-0075-2', doi: '10.1038/s41526-019-0075-2' },
        { claim: 'Muscle atrophy in microgravity averages 5% per week without countermeasures', source: 'Fitts et al. 2010, J Physiol', url: 'https://doi.org/10.1113/jphysiol.2009.178517', doi: '10.1113/jphysiol.2009.178517' },
        { claim: 'Cardiovascular deconditioning occurs within days of reduced gravity exposure', source: 'Hughson et al. 2018, CMAJ', url: 'https://doi.org/10.1503/cmaj.180343', doi: '10.1503/cmaj.180343' },
      ],
      counterpoints: [
        { claim: 'Centrifuge-based artificial gravity countermeasures remain experimental and unproven for partial-g stays', source: 'Clément 2017', url: 'https://doi.org/10.1007/s12217-017-9544-3' },
      ],
      departmentNotes: {
        medical: 'Exercise countermeasures designed for 0g may be insufficient for 1/6g long-duration stays. Children born in 1/6g may never tolerate Earth gravity.',
        'life-support': 'Fluid systems behave differently in 1/6g. Waste processing and water recycling require redesign.',
      },
    },
    power: {
      canonicalFacts: [
        { claim: 'Lunar south pole peaks of eternal light receive near-continuous sunlight for solar power', source: 'Bussey et al. 2010, Icarus', url: 'https://doi.org/10.1016/j.icarus.2010.08.005', doi: '10.1016/j.icarus.2010.08.005' },
        { claim: 'NASA Kilopower fission reactor designed for 1-10 kW lunar surface power', source: 'NASA STMD Kilopower', url: 'https://www.nasa.gov/kilopower' },
        { claim: 'Lunar south pole illumination varies from 80-90% annually at optimal ridge locations', source: 'Mazarico et al. 2011, Icarus', url: 'https://doi.org/10.1016/j.icarus.2010.10.030', doi: '10.1016/j.icarus.2010.10.030' },
      ],
      counterpoints: [
        { claim: 'Lunar night at non-polar locations lasts 14 Earth days, requiring energy storage or nuclear backup', source: 'Engineering analysis', url: 'https://www.nasa.gov/artemis' },
        { claim: 'Solar panel degradation from micrometeorite impacts and regolith coating reduces efficiency over time', source: 'Katzan & Edwards 1991, NASA', url: 'https://ntrs.nasa.gov/citations/19910013747' },
      ],
      departmentNotes: {
        engineering: 'Solar viable at poles. Nuclear required for non-polar or lava tube locations. Redundancy critical.',
        mining: 'Mining operations at permanently shadowed craters require independent power (no solar).',
      },
    },
    communications: {
      canonicalFacts: [
        { claim: 'Earth-Moon signal delay is approximately 1.3 seconds one-way', source: 'NASA', url: 'https://moon.nasa.gov/' },
        { claim: 'Lunar far side requires relay satellite for Earth communication (Queqiao relay for Chang\'e 4)', source: 'ESA/CNSA', url: 'https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Exploration/Gateway' },
        { claim: 'NASA LunaNet will provide lunar communication and navigation infrastructure', source: 'NASA LunaNet', url: 'https://esc.gsfc.nasa.gov/projects/LunaNet' },
      ],
      counterpoints: [
        { claim: 'South pole topology creates line-of-sight gaps between crater floor operations and rim-mounted antennas', source: 'Lunar terrain analysis', url: 'https://www.nasa.gov/artemis' },
      ],
      departmentNotes: {
        communications: 'Near-real-time communication possible from south pole rim. Crater floor ops need local relay network.',
      },
    },
    infrastructure: {
      canonicalFacts: [
        { claim: 'Lunar lava tubes can be hundreds of meters wide, providing natural radiation shielding', source: 'Haruyama et al. 2009, GRL', url: 'https://doi.org/10.1029/2009GL040635', doi: '10.1029/2009GL040635' },
        { claim: 'In-situ resource utilization (ISRU) can produce construction materials from lunar regolith', source: 'NASA ISRU', url: 'https://www.nasa.gov/isru' },
        { claim: 'Regolith sintering at 1100C produces structural bricks without imported binder', source: 'Meurisse et al. 2018, Acta Astronautica', url: 'https://doi.org/10.1016/j.actaastro.2017.11.005', doi: '10.1016/j.actaastro.2017.11.005' },
        { claim: 'ESA demonstrated 3D-printed structures using simulated lunar regolith', source: 'ESA 3D Printing on the Moon', url: 'https://www.esa.int/Enabling_Support/Space_Engineering_Technology/Building_a_lunar_base_with_3D_printing' },
      ],
      counterpoints: [
        { claim: 'Micrometeorite flux on the lunar surface averages 1 impact/m2/time for particles >1mm', source: 'Grun et al. 2011', url: 'https://doi.org/10.1016/j.pss.2011.04.011' },
      ],
      departmentNotes: {
        engineering: 'Regolith sintering and 3D printing for habitat construction under active development. Lava tubes offer pre-built volume.',
        mining: 'Construction material extraction from regolith reduces Earth supply dependency.',
      },
    },
    radiation: {
      canonicalFacts: [
        { claim: 'Lunar surface receives approximately 380 mSv/time from galactic cosmic rays (no magnetic field or atmosphere)', source: 'Reitz et al. 2012, Planetary and Space Science', url: 'https://doi.org/10.1016/j.pss.2012.02.005', doi: '10.1016/j.pss.2012.02.005' },
        { claim: 'Solar particle events can deliver 100+ mSv in hours on the unshielded lunar surface', source: 'Townsend et al. 2011', url: 'https://doi.org/10.1016/j.asr.2011.04.017', doi: '10.1016/j.asr.2011.04.017' },
        { claim: 'CRaTER instrument on LRO measured lunar surface dose equivalent of 57-75 mrad/day', source: 'Spence et al. 2010, Space Science Reviews', url: 'https://doi.org/10.1007/s11214-009-9584-8', doi: '10.1007/s11214-009-9584-8' },
      ],
      counterpoints: [],
      departmentNotes: {
        medical: 'Career dose limits may be reached within 2-3 years of surface exposure without adequate shielding.',
        engineering: '2-3 meters of regolith shielding reduces radiation to near-Earth-surface levels.',
      },
    },
    psychology: {
      canonicalFacts: [
        { claim: 'Antarctic overwinter crews exhibit depression rates of 20-60% during isolation periods', source: 'Palinkas & Suedfeld 2008', url: 'https://doi.org/10.1146/annurev.psych.58.110405.085726', doi: '10.1146/annurev.psych.58.110405.085726' },
        { claim: 'Mars-500 520-day isolation study documented psychological decline, altered sleep, and interpersonal conflict', source: 'Basner et al. 2014, PNAS', url: 'https://doi.org/10.1073/pnas.1212646110', doi: '10.1073/pnas.1212646110' },
        { claim: 'Circadian disruption from lack of natural daylight cycle affects cognition and mood', source: 'Barger et al. 2014, Lancet Neurology', url: 'https://doi.org/10.1016/S1474-4422(14)70122-X', doi: '10.1016/S1474-4422(14)70122-X' },
      ],
      counterpoints: [],
      departmentNotes: {
        medical: 'Lunar day/night cycle (29.5 Earth days) disrupts circadian rhythms. Artificial lighting protocol essential.',
      },
    },
    mining: {
      canonicalFacts: [
        { claim: 'Lunar regolith contains ilmenite (FeTiO3) which can be reduced to produce oxygen', source: 'Allen et al. 1996, JGR', url: 'https://doi.org/10.1029/96JE00141', doi: '10.1029/96JE00141' },
        { claim: 'Helium-3 concentrations in lunar regolith estimated at 20-30 ppb, potentially valuable for fusion energy', source: 'Wittenberg et al. 1986, Fusion Technology', url: 'https://doi.org/10.13182/FST86-A24972', doi: '10.13182/FST86-A24972' },
        { claim: 'Rare earth elements in lunar highland anorthosite accessible via simple beneficiation', source: 'Crawford 2015, Progress in Physical Geography', url: 'https://doi.org/10.1177/0309133314567585', doi: '10.1177/0309133314567585' },
      ],
      counterpoints: [
        { claim: 'Lunar mining economics depend on in-situ use; export to Earth is unlikely to be cost-effective', source: 'Duke et al. 2006, Acta Astronautica', url: 'https://doi.org/10.1016/j.actaastro.2006.02.029' },
      ],
      departmentNotes: {
        mining: 'Priority resources: water ice (life support), oxygen (from ilmenite), construction regolith.',
        engineering: 'Mining equipment must handle abrasive regolith, low gravity, and vacuum conditions.',
      },
    },
    artemis: {
      canonicalFacts: [
        { claim: 'Artemis program targets sustained lunar presence by late 2020s with Gateway orbital station', source: 'NASA Artemis', url: 'https://www.nasa.gov/artemis' },
        { claim: 'Lunar Gateway will orbit in near-rectilinear halo orbit (NRHO) providing south pole access', source: 'NASA Gateway', url: 'https://www.nasa.gov/gateway' },
        { claim: 'Artemis Base Camp concept envisions a 30-day surface habitation capability at the south pole', source: 'NASA Artemis Plan 2020', url: 'https://www.nasa.gov/artemis' },
      ],
      counterpoints: [],
      departmentNotes: {
        communications: 'Gateway relay enables continuous comms with south pole surface elements.',
      },
    },
  },
  categoryMapping: {
    environmental: ['regolith', 'radiation', 'power'],
    resource: ['water-ice', 'power', 'mining', 'regolith'],
    medical: ['low-gravity', 'regolith', 'radiation', 'psychology'],
    psychological: ['psychology', 'communications'],
    political: ['communications', 'artemis'],
    infrastructure: ['infrastructure', 'power', 'mining'],
    social: ['psychology', 'communications', 'low-gravity'],
    technological: ['infrastructure', 'communications', 'mining', 'artemis'],
  },
};
