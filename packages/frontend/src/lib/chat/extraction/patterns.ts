/**
 * Extraction Patterns
 *
 * Consolidated regex patterns for extracting profile data from user messages.
 * Merged from chat.ts and onboardingExtractor.ts.
 */

// =============================================================================
// Service Names (to exclude from name extraction)
// =============================================================================
export const SERVICE_NAMES = [
  'netflix',
  'spotify',
  'amazon',
  'google',
  'apple',
  'microsoft',
  'facebook',
  'instagram',
  'twitter',
  'youtube',
  'disney',
  'hulu',
  'hbo',
  'prime',
  'uber',
  'lyft',
  'doordash',
  'grubhub',
  'venmo',
  'paypal',
  'cash',
  'adobe',
  'dropbox',
  'notion',
  'slack',
  'zoom',
  'discord',
  'playstation',
  'xbox',
  'nintendo',
  'steam',
  'twitch',
  'hello',
  'thanks',
  'okay',
  'sure',
  'great',
  'good',
  'yes',
  'no',
];

// =============================================================================
// Currency Detection by City
// =============================================================================
export const EUR_CITIES = [
  'paris',
  'lyon',
  'marseille',
  'toulouse',
  'bordeaux',
  'lille',
  'nantes',
  'nice',
  'montpellier',
  'strasbourg',
  'berlin',
  'munich',
  'hamburg',
  'frankfurt',
  'cologne',
  'rome',
  'milan',
  'naples',
  'turin',
  'florence',
  'madrid',
  'barcelona',
  'valencia',
  'seville',
  'amsterdam',
  'rotterdam',
  'brussels',
  'antwerp',
  'vienna',
  'lisbon',
  'porto',
  'dublin',
  'prague',
  'warsaw',
  'budapest',
  'athens',
  'helsinki',
  'stockholm',
  'copenhagen',
  'oslo',
  'zurich',
  'geneva',
];

export const GBP_CITIES = [
  'london',
  'manchester',
  'birmingham',
  'leeds',
  'glasgow',
  'liverpool',
  'edinburgh',
  'bristol',
  'sheffield',
  'newcastle',
  'cardiff',
  'belfast',
  'oxford',
  'cambridge',
];

export const USD_CITIES = [
  'new york',
  'los angeles',
  'chicago',
  'houston',
  'phoenix',
  'philadelphia',
  'san antonio',
  'san diego',
  'dallas',
  'san jose',
  'austin',
  'san francisco',
  'seattle',
  'denver',
  'boston',
  'washington',
  'miami',
  'atlanta',
  'portland',
  'detroit',
  'las vegas',
  'toronto',
  'vancouver',
  'montreal',
  'sydney',
  'melbourne',
];

// =============================================================================
// Name Patterns
// =============================================================================
export const NAME_PATTERNS: RegExp[] = [
  /(?:i'?m|my name is|call me|i am)\s+([A-Z][a-z]+)/i,
  /^([A-Z][a-z]{2,15})(?:\s|$|,|!)/,
];

// =============================================================================
// Diploma/Study Level Patterns
// =============================================================================
export const DIPLOMA_PATTERNS: [RegExp, string][] = [
  [/\b(master'?s?|msc|m\.?s\.?)\b/i, 'Master'],
  [/\b(bachelor'?s?|bsc|b\.?s\.?|ba|b\.?a\.?)\b/i, 'Bachelor'],
  [/\b(phd|ph\.?d\.?|doctorate|doctorat)\b/i, 'PhD'],
  [/\b(freshman|1st year|first year)\b/i, 'Freshman'],
  [/\b(sophomore|2nd year|second year)\b/i, 'Sophomore'],
  [/\b(junior|3rd year|third year)\b/i, 'Junior'],
  [/\b(senior|4th year|fourth year|final year)\b/i, 'Senior'],
  [/\b(graduate|grad student)\b/i, 'Graduate'],
  [/\b(l[1-3]|m[1-2]|bts|dut|licence)\b/i, 'Bachelor'],
];

// =============================================================================
// Field of Study Patterns
// =============================================================================
export const FIELD_PATTERNS: [RegExp, string][] = [
  [
    /\b(computer science|cs|comp sci|computing|informatics|informatique|info)\b/i,
    'Computer Science',
  ],
  [/\b(software engineering|software dev)\b/i, 'Software Engineering'],
  [/\b(data science|data analytics)\b/i, 'Data Science'],
  [/\b(law|legal|juridique|droit)\b/i, 'Law'],
  [/\b(business|commerce|management|mba)\b/i, 'Business'],
  [/\b(economics|econ|économie)\b/i, 'Economics'],
  [/\b(medicine|medical|médecine|med school)\b/i, 'Medicine'],
  [/\b(engineering|ingénieur|engineer)\b/i, 'Engineering'],
  [/\b(psychology|psych|psychologie)\b/i, 'Psychology'],
  [/\b(biology|bio|biologie)\b/i, 'Biology'],
  [/\b(mathematics|math|maths|mathématiques)\b/i, 'Mathematics'],
  [/\b(physics|physique)\b/i, 'Physics'],
  [/\b(chemistry|chem|chimie)\b/i, 'Chemistry'],
  [/\b(marketing)\b/i, 'Marketing'],
  [/\b(finance|financial|comptabilité)\b/i, 'Finance'],
  [/\b(art|arts|design|beaux-arts)\b/i, 'Arts & Design'],
  [/\b(music|musique)\b/i, 'Music'],
  [/\b(history|histoire)\b/i, 'History'],
  [/\b(literature|littérature)\b/i, 'Literature'],
  [/\b(philosophy|philosophie)\b/i, 'Philosophy'],
  [/\b(sociology|sociologie)\b/i, 'Sociology'],
  [/\b(political science|sciences po)\b/i, 'Political Science'],
  [/\b(communications?|journalism|journalisme)\b/i, 'Communications'],
  [/\b(architecture)\b/i, 'Architecture'],
];

// =============================================================================
// City Patterns
// =============================================================================
export const CITY_PATTERNS: [RegExp, string][] = [
  [/\b(london)\b/i, 'London'],
  [/\b(paris)\b/i, 'Paris'],
  [/\b(new york|nyc)\b/i, 'New York'],
  [/\b(los angeles|la)\b/i, 'Los Angeles'],
  [/\b(san francisco|sf)\b/i, 'San Francisco'],
  [/\b(boston)\b/i, 'Boston'],
  [/\b(chicago)\b/i, 'Chicago'],
  [/\b(berlin)\b/i, 'Berlin'],
  [/\b(amsterdam)\b/i, 'Amsterdam'],
  [/\b(barcelona)\b/i, 'Barcelona'],
  [/\b(madrid)\b/i, 'Madrid'],
  [/\b(tokyo)\b/i, 'Tokyo'],
  [/\b(sydney)\b/i, 'Sydney'],
  [/\b(toronto)\b/i, 'Toronto'],
  [/\b(montreal)\b/i, 'Montreal'],
  [/\b(lyon)\b/i, 'Lyon'],
  [/\b(marseille)\b/i, 'Marseille'],
  [/\b(lille)\b/i, 'Lille'],
  [/\b(bordeaux)\b/i, 'Bordeaux'],
];

// =============================================================================
// Skill Patterns
// =============================================================================
export const SKILL_PATTERNS: [RegExp, string][] = [
  [/\b(typescript|ts)\b/i, 'TypeScript'],
  [/\b(javascript|js)\b/i, 'JavaScript'],
  [/\b(python|py)\b/i, 'Python'],
  [/\b(java)\b(?!script)/i, 'Java'],
  [/\b(c\+\+|cpp)\b/i, 'C++'],
  [/\b(c#|csharp)\b/i, 'C#'],
  [/\b(ruby)\b/i, 'Ruby'],
  [/\b(go|golang)\b/i, 'Go'],
  [/\b(rust)\b/i, 'Rust'],
  [/\b(swift)\b/i, 'Swift'],
  [/\b(kotlin)\b/i, 'Kotlin'],
  [/\b(php)\b/i, 'PHP'],
  [/\b(sql)\b/i, 'SQL'],
  [/\b(react)\b/i, 'React'],
  [/\b(vue)\b/i, 'Vue'],
  [/\b(angular)\b/i, 'Angular'],
  [/\b(node|nodejs)\b/i, 'Node.js'],
  [/\b(english)\b/i, 'English'],
  [/\b(french|français)\b/i, 'French'],
  [/\b(spanish|español)\b/i, 'Spanish'],
  [/\b(german|deutsch)\b/i, 'German'],
  [/\b(chinese|mandarin)\b/i, 'Chinese'],
  [/\b(italian|italiano)\b/i, 'Italian'],
  [/\b(japanese|日本語)\b/i, 'Japanese'],
  [/\b(design|figma|photoshop)\b/i, 'Design'],
  [/\b(tutoring|teaching)\b/i, 'Tutoring'],
  [/\b(writing|copywriting)\b/i, 'Writing'],
  [/\b(guitar|piano|music)\b/i, 'Music'],
  [/\b(sports|coaching)\b/i, 'Sports'],
  [/\b(photography)\b/i, 'Photography'],
  [/\b(video editing)\b/i, 'Video Editing'],
  [/\b(babysitting)\b/i, 'Babysitting'],
  [/\b(cleaning)\b/i, 'Cleaning'],
  [/\b(driving|delivery)\b/i, 'Driving'],
];

// =============================================================================
// Certification Patterns
// =============================================================================
export const CERTIFICATION_PATTERNS: { pattern: RegExp; code: string }[] = [
  // France
  { pattern: /\bBAFA\b/i, code: 'BAFA' },
  { pattern: /\bBNSSA\b/i, code: 'BNSSA' },
  { pattern: /\bPSC1\b/i, code: 'PSC1' },
  { pattern: /\bSST\b/i, code: 'SST' },
  // UK
  { pattern: /\bDBS\b/i, code: 'DBS' },
  { pattern: /\b(?:paediatric|pediatric)\s+first\s+aid\b/i, code: 'PFA' },
  { pattern: /\bNPLQ\b/i, code: 'NPLQ' },
  // US
  { pattern: /\bCPR\b/i, code: 'CPR_AHA' },
  { pattern: /\blifeguard\b/i, code: 'LIFEGUARD_RC' },
  { pattern: /\bfood\s+handler\b/i, code: 'FOOD_HANDLER' },
  // International
  { pattern: /\bPADI\s*(?:OW|open\s*water)?\b/i, code: 'PADI_OW' },
  { pattern: /\bPADI\s*(?:DM|divemaster)\b/i, code: 'PADI_DM' },
  { pattern: /\bSSI\b/i, code: 'SSI_OW' },
  { pattern: /\bTEFL\b|\bTESOL\b/i, code: 'TEFL' },
  { pattern: /\bfirst\s*aid\b/i, code: 'PSC1' }, // Generic defaults to PSC1
];

// =============================================================================
// Goal Patterns
// =============================================================================
export const GOAL_PATTERNS: [RegExp, string][] = [
  [/\b(vacation|holiday|trip|travel|vacances|voyage)\b/i, 'Vacation'],
  [/\b(laptop|computer|macbook|pc|ordinateur)\b/i, 'New Laptop'],
  [/\b(emergency fund|rainy day|safety net|urgence)\b/i, 'Emergency Fund'],
  [/\b(car|vehicle|voiture)\b/i, 'Car'],
  [/\b(phone|iphone|smartphone|téléphone)\b/i, 'New Phone'],
  [/\b(apartment|rent|deposit|housing|loyer|caution)\b/i, 'Housing Deposit'],
  [/\b(graduation|degree|diploma)\b/i, 'Graduation'],
  [/\b(savings?|save|épargne)\b/i, 'Savings'],
  [/\b(scooter|bike|vélo|moto)\b/i, 'Vehicle'],
  [/\b(concert|festival)\b/i, 'Entertainment'],
  [/\b(game|console|camera|appareil)\b/i, 'Electronics'],
];

// =============================================================================
// Subscription Patterns
// =============================================================================
export const SUBSCRIPTION_PATTERNS: [RegExp, { name: string; currentCost: number }][] = [
  // Streaming
  [/\b(netflix)\b/i, { name: 'Netflix', currentCost: 15 }],
  [/\b(spotify)\b/i, { name: 'Spotify', currentCost: 10 }],
  [/\b(amazon prime|prime video|prime)\b/i, { name: 'Amazon Prime', currentCost: 15 }],
  [/\b(disney\+?|disney plus)\b/i, { name: 'Disney+', currentCost: 10 }],
  [/\b(hbo max|hbo)\b/i, { name: 'HBO Max', currentCost: 15 }],
  [/\b(hulu)\b/i, { name: 'Hulu', currentCost: 12 }],
  [/\b(apple music|apple tv)\b/i, { name: 'Apple Services', currentCost: 10 }],
  [/\b(youtube premium|youtube music)\b/i, { name: 'YouTube Premium', currentCost: 12 }],
  [/\b(twitch)\b/i, { name: 'Twitch', currentCost: 5 }],
  [/\b(crunchyroll|funimation)\b/i, { name: 'Anime Streaming', currentCost: 8 }],
  // Fitness
  [
    /\b(gym|fitness|planet fitness|basic fit|salle)\b/i,
    { name: 'Gym membership', currentCost: 30 },
  ],
  [/\b(peloton)\b/i, { name: 'Peloton', currentCost: 40 }],
  // Productivity/Cloud
  [/\b(dropbox)\b/i, { name: 'Dropbox', currentCost: 10 }],
  [/\b(icloud)\b/i, { name: 'iCloud', currentCost: 3 }],
  [/\b(google one|google drive)\b/i, { name: 'Google One', currentCost: 3 }],
  [/\b(notion)\b/i, { name: 'Notion', currentCost: 8 }],
  [/\b(adobe|creative cloud)\b/i, { name: 'Adobe Creative Cloud', currentCost: 55 }],
  // Gaming
  [/\b(xbox game pass|game pass)\b/i, { name: 'Xbox Game Pass', currentCost: 15 }],
  [/\b(playstation plus|ps plus|psn)\b/i, { name: 'PlayStation Plus', currentCost: 10 }],
  [/\b(nintendo online|switch online)\b/i, { name: 'Nintendo Online', currentCost: 4 }],
  // Phone/Internet
  [/\b(phone plan|mobile plan|cell plan|téléphone)\b/i, { name: 'Phone plan', currentCost: 50 }],
  [/\b(internet|wifi|broadband)\b/i, { name: 'Internet', currentCost: 50 }],
  // Food delivery
  [/\b(uber eats)\b/i, { name: 'Uber Eats', currentCost: 10 }],
  [/\b(doordash)\b/i, { name: 'DoorDash', currentCost: 10 }],
  [/\b(deliveroo)\b/i, { name: 'Deliveroo', currentCost: 10 }],
];

// =============================================================================
// Inventory Item Patterns
// =============================================================================
export const INVENTORY_PATTERNS: [
  RegExp,
  { name: string; category: string; estimatedValue: number },
][] = [
  // Electronics
  [
    /\b(old laptop|laptop|macbook|computer|pc)\b/i,
    { name: 'Old laptop', category: 'electronics', estimatedValue: 200 },
  ],
  [
    /\b(old phone|iphone|smartphone|android)\b/i,
    { name: 'Old phone', category: 'electronics', estimatedValue: 150 },
  ],
  [/\b(tablet|ipad)\b/i, { name: 'Tablet', category: 'electronics', estimatedValue: 150 }],
  [
    /\b(headphones|airpods|earbuds)\b/i,
    { name: 'Headphones', category: 'electronics', estimatedValue: 50 },
  ],
  [/\b(camera|dslr)\b/i, { name: 'Camera', category: 'electronics', estimatedValue: 300 }],
  [/\b(monitor|screen)\b/i, { name: 'Monitor', category: 'electronics', estimatedValue: 100 }],
  [
    /\b(gaming console|playstation|xbox|nintendo switch)\b/i,
    { name: 'Gaming console', category: 'electronics', estimatedValue: 200 },
  ],
  // Books
  [
    /\b(textbooks?|books?|coursebooks?)\b/i,
    { name: 'Textbooks', category: 'books', estimatedValue: 50 },
  ],
  // Clothing
  [
    /\b(clothes|clothing|shirts?|jeans|jackets?|shoes)\b/i,
    { name: 'Clothes', category: 'clothing', estimatedValue: 50 },
  ],
  [
    /\b(designer|brand|luxury)\s+(?:clothes|items?|bags?)\b/i,
    { name: 'Designer items', category: 'clothing', estimatedValue: 200 },
  ],
  // Sports
  [/\b(bike|bicycle)\b/i, { name: 'Bicycle', category: 'sports', estimatedValue: 150 }],
  [
    /\b(skateboard|skates|rollerblades)\b/i,
    { name: 'Skateboard/Skates', category: 'sports', estimatedValue: 50 },
  ],
  [
    /\b(gym equipment|weights|dumbbells)\b/i,
    { name: 'Gym equipment', category: 'sports', estimatedValue: 100 },
  ],
  // Furniture
  [
    /\b(furniture|desk|chair|lamp|shelf)\b/i,
    { name: 'Furniture', category: 'furniture', estimatedValue: 75 },
  ],
  // Other
  [
    /\b(musical instrument|guitar|piano|keyboard)\b/i,
    { name: 'Musical instrument', category: 'other', estimatedValue: 200 },
  ],
];

// =============================================================================
// Month Names (for deadline parsing)
// =============================================================================
export const ENGLISH_MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export const FRENCH_MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

// =============================================================================
// Risk Keywords (for response evaluation)
// =============================================================================
export const HIGH_RISK_KEYWORDS = [
  'crypto',
  'bitcoin',
  'ethereum',
  'nft',
  'forex',
  'trading',
  'options',
  'leverage',
  'guaranteed',
  'no risk',
  'high return',
  'invest all',
  'all-in',
  'borrow to invest',
];

export const SAFE_KEYWORDS = [
  'savings',
  'budget',
  'save',
  'student aid',
  'scholarship',
  'student job',
  'tutoring',
  'freelance',
  'roommate',
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a name is a known service/product name (not a person's name)
 */
export function isServiceName(name: string): boolean {
  return SERVICE_NAMES.includes(name.toLowerCase());
}

/**
 * Detect currency from city name
 */
export function detectCurrencyFromCity(city: string): 'USD' | 'EUR' | 'GBP' | null {
  const cityLower = city.toLowerCase();

  if (EUR_CITIES.some((c) => cityLower.includes(c))) {
    return 'EUR';
  }
  if (GBP_CITIES.some((c) => cityLower.includes(c))) {
    return 'GBP';
  }
  if (USD_CITIES.some((c) => cityLower.includes(c))) {
    return 'USD';
  }

  return null;
}

/**
 * Match a value against a pattern list and return the first match
 */
export function matchPattern<T>(text: string, patterns: [RegExp, T][]): T | null {
  const lower = text.toLowerCase();
  for (const [pattern, value] of patterns) {
    if (pattern.test(lower)) {
      return value;
    }
  }
  return null;
}

/**
 * Match all patterns and return all matches
 */
export function matchAllPatterns<T>(text: string, patterns: [RegExp, T][]): T[] {
  const lower = text.toLowerCase();
  const results: T[] = [];
  for (const [pattern, value] of patterns) {
    if (pattern.test(lower)) {
      results.push(value);
    }
  }
  return results;
}
