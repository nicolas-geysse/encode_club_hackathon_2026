/**
 * Certification → Job Category Mapping
 *
 * Maps professional certifications to job categories they boost.
 * Used by jobScoring.ts to increase profile match score.
 *
 * Phase 5: Certifications Impact
 */

export interface CertificationDefinition {
  /** Canonical ID (lowercase, no spaces) */
  id: string;
  /** Display name */
  name: string;
  /** Alternative names/spellings for fuzzy matching */
  aliases: string[];
  /** Job categories this certification boosts */
  boostsCategories: string[];
  /** Score bonus when matched (0.1-0.5) */
  bonus: number;
  /** Country/region where certification is common */
  region: 'FR' | 'UK' | 'US' | 'INT';
  /** Description for UI */
  description: string;
}

/**
 * Certification Registry
 * Organized by region for clarity
 */
export const CERTIFICATION_REGISTRY: CertificationDefinition[] = [
  // =============================================================================
  // France (FR)
  // =============================================================================
  {
    id: 'bafa',
    name: 'BAFA',
    aliases: ['bafa', 'brevet animation', 'animateur'],
    boostsCategories: ['childcare', 'events', 'campus'],
    bonus: 0.3,
    region: 'FR',
    description: 'Animation certification for youth activities',
  },
  {
    id: 'bnssa',
    name: 'BNSSA',
    aliases: ['bnssa', 'sauveteur aquatique', 'lifeguard', 'maitre nageur'],
    boostsCategories: ['events', 'beauty'], // pools, spas
    bonus: 0.3,
    region: 'FR',
    description: 'Lifeguard certification for aquatic supervision',
  },
  {
    id: 'psc1',
    name: 'PSC1',
    aliases: ['psc1', 'premiers secours', 'first aid', 'secourisme'],
    boostsCategories: ['childcare', 'events', 'service', 'retail'], // Universal safety bonus
    bonus: 0.15,
    region: 'FR',
    description: 'First aid certification (level 1)',
  },
  {
    id: 'sst',
    name: 'SST',
    aliases: ['sst', 'sauveteur secouriste travail'],
    boostsCategories: ['handyman', 'interim', 'cleaning'], // Workplace safety
    bonus: 0.15,
    region: 'FR',
    description: 'Workplace first aid certification',
  },
  {
    id: 'caces',
    name: 'CACES',
    aliases: ['caces', 'chariot élévateur', 'forklift'],
    boostsCategories: ['interim', 'handyman', 'retail'], // Warehouse/logistics
    bonus: 0.25,
    region: 'FR',
    description: 'Forklift/machinery operation license',
  },
  {
    id: 'haccp',
    name: 'HACCP',
    aliases: ['haccp', 'hygiène alimentaire', 'food safety', 'food hygiene'],
    boostsCategories: ['service'], // Food service
    bonus: 0.2,
    region: 'FR',
    description: 'Food safety and hygiene certification',
  },

  // =============================================================================
  // UK
  // =============================================================================
  {
    id: 'dbs',
    name: 'DBS Check',
    aliases: ['dbs', 'dbs check', 'crb', 'criminal record'],
    boostsCategories: ['childcare', 'tutoring', 'campus'],
    bonus: 0.2,
    region: 'UK',
    description: 'Background check for working with children/vulnerable',
  },
  {
    id: 'nplq',
    name: 'NPLQ',
    aliases: ['nplq', 'pool lifeguard', 'rlss'],
    boostsCategories: ['events', 'beauty'],
    bonus: 0.3,
    region: 'UK',
    description: 'National Pool Lifeguard Qualification',
  },
  {
    id: 'first_aid_uk',
    name: 'First Aid at Work',
    aliases: ['first aid', 'faw', 'first aid at work', 'st john'],
    boostsCategories: ['childcare', 'events', 'service', 'retail'],
    bonus: 0.15,
    region: 'UK',
    description: 'Workplace first aid certification (UK)',
  },
  {
    id: 'sia',
    name: 'SIA License',
    aliases: ['sia', 'door supervisor', 'security'],
    boostsCategories: ['events', 'retail'],
    bonus: 0.25,
    region: 'UK',
    description: 'Security Industry Authority license',
  },

  // =============================================================================
  // US
  // =============================================================================
  {
    id: 'cpr_aed',
    name: 'CPR/AED',
    aliases: ['cpr', 'aed', 'cpr/aed', 'american heart', 'red cross cpr'],
    boostsCategories: ['childcare', 'events', 'service', 'retail'],
    bonus: 0.15,
    region: 'US',
    description: 'CPR and defibrillator certification',
  },
  {
    id: 'lifeguard_us',
    name: 'Lifeguard Certification',
    aliases: ['lifeguard', 'red cross lifeguard', 'pool attendant'],
    boostsCategories: ['events', 'beauty'],
    bonus: 0.3,
    region: 'US',
    description: 'American Red Cross lifeguard certification',
  },
  {
    id: 'food_handler',
    name: 'Food Handler Card',
    aliases: ['food handler', 'servsafe', 'food safety'],
    boostsCategories: ['service'],
    bonus: 0.2,
    region: 'US',
    description: 'Food handling permit/certification',
  },
  {
    id: 'tabc',
    name: 'TABC/Alcohol Server',
    aliases: ['tabc', 'tips', 'alcohol server', 'bartender license'],
    boostsCategories: ['service', 'events'],
    bonus: 0.2,
    region: 'US',
    description: 'Alcohol serving certification',
  },

  // =============================================================================
  // International (INT)
  // =============================================================================
  {
    id: 'tefl',
    name: 'TEFL/TESOL',
    aliases: ['tefl', 'tesol', 'celta', 'english teaching', 'esl'],
    boostsCategories: ['tutoring'],
    bonus: 0.3,
    region: 'INT',
    description: 'Teaching English as a Foreign Language',
  },
  {
    id: 'padi',
    name: 'PADI',
    aliases: ['padi', 'scuba', 'diving', 'dive master', 'ssi'],
    boostsCategories: ['events'], // Water sports/tourism
    bonus: 0.25,
    region: 'INT',
    description: 'Scuba diving certification',
  },
  {
    id: 'driving_license',
    name: 'Driving License',
    aliases: ['permis', 'permis b', 'driving license', "driver's license", 'license'],
    boostsCategories: ['handyman', 'interim', 'service'], // Delivery, moving
    bonus: 0.15,
    region: 'INT',
    description: 'Valid driving license',
  },
];

/**
 * Find matching certification by name (fuzzy match)
 */
export function findCertification(name: string): CertificationDefinition | undefined {
  const normalized = name.toLowerCase().trim();

  return CERTIFICATION_REGISTRY.find(
    (cert) =>
      cert.id === normalized ||
      cert.name.toLowerCase() === normalized ||
      cert.aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))
  );
}

/**
 * Get all certifications that boost a specific job category
 */
export function getCertificationsForCategory(categoryId: string): CertificationDefinition[] {
  return CERTIFICATION_REGISTRY.filter((cert) => cert.boostsCategories.includes(categoryId));
}

/**
 * Calculate total certification bonus for a job category
 * Returns the highest single bonus (not cumulative) to avoid over-boosting
 */
export function calculateCertificationBonus(
  userCertifications: string[],
  jobCategoryId: string
): { bonus: number; matchedCertifications: CertificationDefinition[] } {
  const matchedCertifications: CertificationDefinition[] = [];

  for (const certName of userCertifications) {
    const cert = findCertification(certName);
    if (cert && cert.boostsCategories.includes(jobCategoryId)) {
      matchedCertifications.push(cert);
    }
  }

  // Take the highest bonus (avoid stacking multiple bonuses)
  const bonus =
    matchedCertifications.length > 0 ? Math.max(...matchedCertifications.map((c) => c.bonus)) : 0;

  return { bonus, matchedCertifications };
}

/**
 * Check if user has any certification that boosts a category
 */
export function hasCertificationForCategory(
  userCertifications: string[],
  jobCategoryId: string
): boolean {
  return userCertifications.some((certName) => {
    const cert = findCertification(certName);
    return cert && cert.boostsCategories.includes(jobCategoryId);
  });
}
