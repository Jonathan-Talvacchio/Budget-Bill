/**
 * Commonly used bills and services. Amounts are intentionally not included:
 * prices change often and vary by region and plan, so the user enters their own.
 * Logos are never fetched remotely — that would reveal a user's services to a third party.
 */
import type { Category, Frequency } from './schema';

export type CatalogItem = {
  id: string;
  name: string;
  category: Category;
  frequency: Frequency;
};

const item = (id: string, name: string, category: Category, frequency: Frequency = 'monthly') => ({
  id,
  name,
  category,
  frequency,
});

export const CATALOG: readonly CatalogItem[] = [
  // Housing
  item('rent', 'Rent', 'housing'),
  item('mortgage', 'Mortgage', 'housing'),
  item('hoa', 'HOA Dues', 'housing'),
  item('property-tax', 'Property Tax', 'housing', 'yearly'),
  item('storage-unit', 'Storage Unit', 'housing'),
  // Utilities
  item('electric', 'Electricity', 'utilities'),
  item('gas-utility', 'Natural Gas', 'utilities'),
  item('water', 'Water & Sewer', 'utilities'),
  item('trash', 'Trash & Recycling', 'utilities'),
  // Phone & internet
  item('internet', 'Home Internet', 'phone-internet'),
  item('mobile', 'Mobile Phone', 'phone-internet'),
  item('cable-tv', 'Cable / Satellite TV', 'phone-internet'),
  // Streaming
  item('netflix', 'Netflix', 'streaming'),
  item('hulu', 'Hulu', 'streaming'),
  item('disney-plus', 'Disney+', 'streaming'),
  item('max', 'Max', 'streaming'),
  item('prime-video', 'Prime Video', 'streaming'),
  item('apple-tv', 'Apple TV+', 'streaming'),
  item('paramount-plus', 'Paramount+', 'streaming'),
  item('peacock', 'Peacock', 'streaming'),
  item('youtube-premium', 'YouTube Premium', 'streaming'),
  item('youtube-tv', 'YouTube TV', 'streaming'),
  item('crunchyroll', 'Crunchyroll', 'streaming'),
  // Music & audio
  item('spotify', 'Spotify', 'music-audio'),
  item('apple-music', 'Apple Music', 'music-audio'),
  item('youtube-music', 'YouTube Music', 'music-audio'),
  item('audible', 'Audible', 'music-audio'),
  item('siriusxm', 'SiriusXM', 'music-audio'),
  // Software & cloud
  item('icloud', 'iCloud+', 'software-cloud'),
  item('google-one', 'Google One', 'software-cloud'),
  item('dropbox', 'Dropbox', 'software-cloud'),
  item('microsoft-365', 'Microsoft 365', 'software-cloud', 'yearly'),
  item('adobe-cc', 'Adobe Creative Cloud', 'software-cloud'),
  item('chatgpt', 'ChatGPT Plus', 'software-cloud'),
  item('claude', 'Claude Pro', 'software-cloud'),
  item('password-manager', 'Password Manager', 'software-cloud', 'yearly'),
  item('vpn', 'VPN', 'software-cloud', 'yearly'),
  item('domain-hosting', 'Domain / Web Hosting', 'software-cloud', 'yearly'),
  item('xbox-game-pass', 'Xbox Game Pass', 'software-cloud'),
  item('playstation-plus', 'PlayStation Plus', 'software-cloud', 'yearly'),
  item('nintendo-online', 'Nintendo Switch Online', 'software-cloud', 'yearly'),
  // Insurance
  item('auto-insurance', 'Auto Insurance', 'insurance'),
  item('home-insurance', 'Homeowners Insurance', 'insurance', 'yearly'),
  item('renters-insurance', 'Renters Insurance', 'insurance'),
  item('health-insurance', 'Health Insurance', 'insurance'),
  item('life-insurance', 'Life Insurance', 'insurance'),
  item('dental-vision', 'Dental / Vision Insurance', 'insurance'),
  item('pet-insurance', 'Pet Insurance', 'insurance'),
  // Transportation
  item('car-payment', 'Car Payment', 'transportation'),
  item('car-registration', 'Vehicle Registration', 'transportation', 'yearly'),
  item('transit-pass', 'Transit Pass', 'transportation'),
  item('parking', 'Parking', 'transportation'),
  // Loans & debt
  item('student-loan', 'Student Loan', 'loans-debt'),
  item('personal-loan', 'Personal Loan', 'loans-debt'),
  item('credit-card', 'Credit Card Payment', 'loans-debt'),
  // Health & fitness
  item('gym', 'Gym Membership', 'health-fitness'),
  item('fitness-app', 'Fitness App', 'health-fitness'),
  item('prescriptions', 'Prescriptions', 'health-fitness'),
  // Memberships
  item('amazon-prime', 'Amazon Prime', 'memberships', 'yearly'),
  item('costco', 'Costco Membership', 'memberships', 'yearly'),
  item('sams-club', "Sam's Club Membership", 'memberships', 'yearly'),
  item('news', 'News Subscription', 'memberships'),
  item('childcare', 'Childcare', 'other'),
  item('charity', 'Charitable Donation', 'other'),
];

export function searchCatalog(query: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...CATALOG];
  return CATALOG.filter((c) => c.name.toLowerCase().includes(q));
}
