/**
 * Prospection Categories Configuration
 *
 * 10 job categories optimized for student employment.
 * Each category includes search templates, platform suggestions,
 * and estimated earnings/effort levels.
 */

import type { ProspectionCategory, CategoryIconName } from '~/lib/prospectionTypes';

// =============================================================================
// Category Definitions
// =============================================================================

export const PROSPECTION_CATEGORIES: ProspectionCategory[] = [
  {
    id: 'service',
    label: 'Service & Hospitality',
    icon: 'UtensilsCrossed',
    description: 'Restaurants, cafes, bars - serving, bartending, kitchen help',
    examples: ['Waiter', 'Barista', 'Bartender', 'Kitchen helper'],
    queryTemplate: 'emploi étudiant serveur restaurant',
    // Enriched: +bakery, night_club, meal_delivery for more results
    googlePlaceTypes: [
      'restaurant',
      'cafe',
      'bar',
      'bakery',
      'night_club',
      'meal_takeaway',
      'meal_delivery',
    ],
    platforms: ['Indeed', 'StudentJob', 'HelloWork'],
    avgHourlyRate: { min: 11, max: 14 },
    effortLevel: 4,
  },
  {
    id: 'retail',
    label: 'Retail & Sales',
    icon: 'ShoppingBag',
    description: 'Stores, supermarkets, shopping malls - cashier, stock, sales',
    examples: ['Cashier', 'Sales associate', 'Stock clerk', 'Inventory'],
    queryTemplate: 'emploi étudiant vendeur magasin',
    // Enriched: many more store types for comprehensive coverage
    googlePlaceTypes: [
      'store',
      'shopping_mall',
      'supermarket',
      'clothing_store',
      'convenience_store',
      'department_store',
      'electronics_store',
      'shoe_store',
      'home_goods_store',
      'book_store',
      'pet_store',
      'drugstore',
      'florist',
      'jewelry_store',
      'liquor_store',
    ],
    platforms: ['Indeed', 'Carrefour Jobs', 'Monoprix'],
    avgHourlyRate: { min: 11, max: 13 },
    effortLevel: 3,
  },
  {
    id: 'cleaning',
    label: 'Cleaning & Maintenance',
    icon: 'Sparkles',
    description: 'Hotels, gyms, offices - cleaning, housekeeping',
    examples: ['Housekeeper', 'Cleaner', 'Janitor', 'Room attendant'],
    queryTemplate: 'emploi étudiant ménage nettoyage',
    // Enriched: +spa, movie_theater, stadium, hospital - all need cleaning staff
    googlePlaceTypes: [
      'lodging',
      'gym',
      'spa',
      'movie_theater',
      'stadium',
      'hospital',
      'school',
      'university',
    ],
    platforms: ['Indeed', 'O2', 'Shiva'],
    avgHourlyRate: { min: 11, max: 15 },
    effortLevel: 4,
  },
  {
    id: 'handyman',
    label: 'Handyman & Moving',
    icon: 'Wrench',
    description: 'Small repairs, moving help, assembly services',
    examples: ['Moving helper', 'Furniture assembly', 'Small repairs', 'Gardening'],
    queryTemplate: 'emploi étudiant bricolage déménagement',
    // Added: hardware_store, furniture_store - potential for assembly/delivery jobs
    googlePlaceTypes: ['hardware_store', 'furniture_store', 'home_goods_store'],
    platforms: ['TaskRabbit', 'Frizbiz', 'YoupiJob'],
    avgHourlyRate: { min: 12, max: 20 },
    effortLevel: 5,
  },
  {
    id: 'childcare',
    label: 'Childcare & Pet sitting',
    icon: 'Baby',
    description: 'Babysitting, after-school care, pet sitting',
    examples: ['Babysitter', 'After-school helper', 'Dog walker', 'Pet sitter'],
    queryTemplate: 'emploi étudiant babysitting garde enfant',
    // Enriched: +primary_school, secondary_school, pet_store
    googlePlaceTypes: ['school', 'primary_school', 'secondary_school', 'pet_store'],
    platforms: ['Yoopies', 'Bsit', 'Nounou-Top', 'DogBuddy'],
    avgHourlyRate: { min: 10, max: 15 },
    effortLevel: 2,
  },
  {
    id: 'tutoring',
    label: 'Tutoring & Lessons',
    icon: 'GraduationCap',
    description: 'Academic tutoring, language lessons, music classes',
    examples: ['Math tutor', 'Language teacher', 'Music lessons', 'Test prep'],
    queryTemplate: 'cours particuliers étudiant soutien scolaire',
    // Enriched: +book_store, primary/secondary schools
    googlePlaceTypes: [
      'library',
      'university',
      'school',
      'primary_school',
      'secondary_school',
      'book_store',
    ],
    platforms: ['Superprof', 'Kelprof', 'Acadomia', 'Complétude'],
    avgHourlyRate: { min: 15, max: 30 },
    effortLevel: 2,
  },
  {
    id: 'events',
    label: 'Events & Promo',
    icon: 'PartyPopper',
    description: 'Trade shows, promotional events, hostessing',
    examples: ['Hostess', 'Promoter', 'Event staff', 'Brand ambassador'],
    queryTemplate: 'emploi étudiant hôtesse événement promotion',
    // Added: venues where events happen
    googlePlaceTypes: ['shopping_mall', 'stadium', 'night_club', 'movie_theater'],
    platforms: ['Hotesse.com', 'Jobbing', 'Student Pop'],
    avgHourlyRate: { min: 12, max: 18 },
    effortLevel: 3,
  },
  {
    id: 'interim',
    label: 'Temp Agencies',
    icon: 'Clock',
    description: 'Various missions through temp work agencies',
    examples: ['Warehouse work', 'Factory', 'Administrative', 'Reception'],
    queryTemplate: 'emploi intérim étudiant missions',
    // Platform-only: temp agencies are searched online, not on maps
    googlePlaceTypes: [],
    platforms: ['Adecco', 'Manpower', 'Randstad', 'Synergie'],
    avgHourlyRate: { min: 11, max: 14 },
    effortLevel: 4,
  },
  {
    id: 'digital',
    label: 'Digital & Remote',
    icon: 'Laptop',
    description: 'Freelance, data entry, content creation, social media',
    examples: ['Social media manager', 'Data entry', 'Transcription', 'Virtual assistant'],
    queryTemplate: 'emploi étudiant télétravail freelance digital',
    // Coworking spots - kept minimal as this is mostly remote work
    googlePlaceTypes: ['cafe', 'library'],
    platforms: ['Malt', 'Fiverr', 'Upwork', 'Comeup'],
    avgHourlyRate: { min: 12, max: 25 },
    effortLevel: 2,
  },
  {
    id: 'campus',
    label: 'Campus Jobs',
    icon: 'Building',
    description: 'Jobs within your university or school',
    examples: ['Library assistant', 'Lab monitor', 'Tutor center', 'IT helpdesk'],
    queryTemplate: 'emploi étudiant campus université bibliothèque',
    googlePlaceTypes: ['university', 'library', 'school'],
    platforms: ['University job board', 'Jobaviz'],
    avgHourlyRate: { min: 11, max: 13 },
    effortLevel: 2,
  },
  {
    id: 'beauty',
    label: 'Beauty & Wellness',
    icon: 'Sparkles',
    description: 'Salons, spas, wellness centers - reception, assistance',
    examples: ['Salon receptionist', 'Spa assistant', 'Nail technician helper'],
    queryTemplate: 'emploi étudiant salon coiffure esthétique',
    googlePlaceTypes: ['beauty_salon', 'hair_care', 'spa', 'gym'],
    platforms: ['Indeed', 'StudentJob', 'Jooble'],
    avgHourlyRate: { min: 11, max: 14 },
    effortLevel: 2,
  },
  {
    id: 'auto',
    label: 'Automotive & Gas',
    icon: 'Wrench',
    description: 'Gas stations, car wash - attendant, cashier',
    examples: ['Gas station attendant', 'Car wash worker', 'Service assistant'],
    queryTemplate: 'emploi étudiant station service lavage auto',
    googlePlaceTypes: ['gas_station', 'car_wash'],
    platforms: ['Indeed', 'TotalEnergies Jobs', 'StudentJob'],
    avgHourlyRate: { min: 11, max: 13 },
    effortLevel: 3,
  },
];

// =============================================================================
// Icon Mapping
// =============================================================================

/**
 * Get the icon name for a category
 */
export function getCategoryIcon(categoryId: string): CategoryIconName {
  const category = PROSPECTION_CATEGORIES.find((c) => c.id === categoryId);
  return (category?.icon as CategoryIconName) || 'Building';
}

/**
 * Get category by ID
 */
export function getCategoryById(id: string): ProspectionCategory | undefined {
  return PROSPECTION_CATEGORIES.find((c) => c.id === id);
}

/**
 * Get category color based on effort level
 */
export function getCategoryColor(effortLevel: number): string {
  switch (effortLevel) {
    case 1:
      return 'text-green-600';
    case 2:
      return 'text-emerald-600';
    case 3:
      return 'text-yellow-600';
    case 4:
      return 'text-orange-600';
    case 5:
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Get effort label
 */
export function getEffortLabel(level: number): string {
  switch (level) {
    case 1:
      return 'Very Easy';
    case 2:
      return 'Easy';
    case 3:
      return 'Moderate';
    case 4:
      return 'Physical';
    case 5:
      return 'Demanding';
    default:
      return 'Unknown';
  }
}

/**
 * Format hourly rate range
 */
export function formatHourlyRange(
  range: { min: number; max: number },
  currency: string = 'EUR'
): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '£';
  return `${range.min}-${range.max}${symbol}/h`;
}
