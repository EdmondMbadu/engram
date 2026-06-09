import type {
  AtlasChatGuideConfig,
  CityAtlasConfig,
} from './atlas.models';
import type {
  PublicWikiBadge,
  PublicWikiPriority,
} from './public-wiki-catalog';

export interface CityAtlasTemplate {
  slug: string;
  name: string;
  description: string;
  landingSummary: string;
  sources: string;
  priority: PublicWikiPriority;
  badges: PublicWikiBadge[];
  coverColor: string;
  logoUrl: string | null;
  heroUrl: string | null;
  cityConfig: CityAtlasConfig;
  chatGuide: AtlasChatGuideConfig;
  personaPrompt: string;
}

const livingCitiesLogoUrl = '/assets/image/living-cities.png';

function buildCityPersona(cityName: string, regionName: string, civicFocus: string): string {
  return [
    `You are the Living Wiki guide for ${cityName}.`,
    `Speak with practical local confidence about ${cityName}, ${regionName}, while staying source-aware and clear about uncertainty.`,
    `Prioritize useful civic knowledge: ${civicFocus}.`,
    'Use live internet grounding by default, keep answers concise, readable, and energetic, and include tasteful local emojis when they help the answer feel alive.',
    'When sources are incomplete, say what is known, what is changing, and what the user should verify next.',
  ].join(' ');
}

function cityConfig(input: {
  cityName: string;
  regionName: string;
  timezone: string;
  censusStateCode: string;
  censusPlaceCode: string;
  airnowZipCode: string;
}): CityAtlasConfig {
  return {
    enabled: true,
    city_name: input.cityName,
    region_name: input.regionName,
    country_code: 'US',
    timezone: input.timezone,
    census_state_code: input.censusStateCode,
    census_place_code: input.censusPlaceCode,
    airnow_zip_code: input.airnowZipCode,
    manual_metrics: null,
  };
}

function chatGuide(cityName: string): AtlasChatGuideConfig {
  return {
    name: `${cityName} Guide`,
    label: `Ask about ${cityName} civic life, transit, culture, climate, jobs, food, and local updates.`,
    image_url: livingCitiesLogoUrl,
    banner_url: null,
  };
}

export const CITY_ATLAS_TEMPLATES: CityAtlasTemplate[] = [
  {
    slug: 'philly',
    name: 'Living Wiki: Philly',
    description:
      'Living Wiki: Philly consolidates the Delaware Valley’s fragmented sustainability and economic data — currently scattered across 60+ agencies, portals, and databases — into the region’s living institutional memory.',
    landingSummary:
      'A city-first civic guide for Philadelphia and the Delaware Valley, focused on sustainability, local updates, neighborhoods, transit, jobs, food, climate, and public data.',
    sources:
      'OpenDataPhilly, DVRPC, PWD, PEA, EPA, Census Bureau, SBN, Green Philly, SEPTA',
    priority: 'high',
    badges: ['evergreen', 'geo'],
    coverColor: '#123f34',
    logoUrl: '/assets/public-wikis/philly-logo.png',
    heroUrl: '/assets/public-wikis/philly-hero.jpg',
    cityConfig: cityConfig({
      cityName: 'Philadelphia',
      regionName: 'Pennsylvania',
      timezone: 'America/New_York',
      censusStateCode: '42',
      censusPlaceCode: '60000',
      airnowZipCode: '19102',
    }),
    chatGuide: chatGuide('Philly'),
    personaPrompt: buildCityPersona(
      'Philadelphia',
      'Pennsylvania',
      'neighborhoods, SEPTA, city services, local news, climate resilience, economic opportunity, culture, food, and civic data',
    ),
  },
  {
    slug: 'boston',
    name: 'Living Wiki: Boston',
    description:
      "Boston's sustainability, innovation, and civic data — universities, transit, climate resilience, healthcare, and the innovation economy.",
    landingSummary:
      'A practical guide to Boston civic life, innovation, universities, transit, climate resilience, public health, neighborhoods, and local updates.',
    sources:
      'Boston Open Data, MBTA, Mass.gov, EPA, Census, Harvard/MIT public research',
    priority: 'high',
    badges: ['geo', 'business'],
    coverColor: '#17465f',
    logoUrl: livingCitiesLogoUrl,
    heroUrl: null,
    cityConfig: cityConfig({
      cityName: 'Boston',
      regionName: 'Massachusetts',
      timezone: 'America/New_York',
      censusStateCode: '25',
      censusPlaceCode: '07000',
      airnowZipCode: '02108',
    }),
    chatGuide: chatGuide('Boston'),
    personaPrompt: buildCityPersona(
      'Boston',
      'Massachusetts',
      'MBTA service, universities, healthcare, climate resilience, neighborhoods, housing, jobs, and civic data',
    ),
  },
  {
    slug: 'portland',
    name: 'Living Wiki: Portland',
    description:
      "Portland's sustainability ecosystem — urban planning, transit, climate action, food systems, and the green economy of the Pacific Northwest.",
    landingSummary:
      'A practical guide to Portland sustainability, planning, transit, climate action, food systems, local culture, public data, and regional updates.',
    sources:
      'Portland Open Data, TriMet, Oregon DEQ, Metro regional government',
    priority: 'med',
    badges: ['geo', 'evergreen'],
    coverColor: '#2d5a3d',
    logoUrl: livingCitiesLogoUrl,
    heroUrl: null,
    cityConfig: cityConfig({
      cityName: 'Portland',
      regionName: 'Oregon',
      timezone: 'America/Los_Angeles',
      censusStateCode: '41',
      censusPlaceCode: '59000',
      airnowZipCode: '97204',
    }),
    chatGuide: chatGuide('Portland'),
    personaPrompt: buildCityPersona(
      'Portland',
      'Oregon',
      'TriMet, land use, climate action, food systems, neighborhoods, public safety, housing, and the green economy',
    ),
  },
  {
    slug: 'austin',
    name: 'Living Wiki: Austin',
    description:
      "Austin's tech ecosystem, energy transition, growth management, and sustainability challenges — from ERCOT grid data to open city records.",
    landingSummary:
      'A practical guide to Austin growth, tech, energy, transit, housing, climate, music culture, local government, and civic data.',
    sources: 'Austin Open Data, ERCOT, Texas PUC, Census, Austin Energy',
    priority: 'med',
    badges: ['geo', 'trending'],
    coverColor: '#744725',
    logoUrl: livingCitiesLogoUrl,
    heroUrl: null,
    cityConfig: cityConfig({
      cityName: 'Austin',
      regionName: 'Texas',
      timezone: 'America/Chicago',
      censusStateCode: '48',
      censusPlaceCode: '05000',
      airnowZipCode: '78701',
    }),
    chatGuide: chatGuide('Austin'),
    personaPrompt: buildCityPersona(
      'Austin',
      'Texas',
      'ERCOT, Austin Energy, tech jobs, housing pressure, transit, growth, music, neighborhoods, and climate stress',
    ),
  },
  {
    slug: 'san-francisco',
    name: 'Living Wiki: San Francisco',
    description:
      "SF's tech ecosystem, housing crisis, transit, climate policy, and civic innovation — compiled from one of the world's best open data programs.",
    landingSummary:
      'A practical guide to San Francisco civic life, technology, housing, transit, climate policy, neighborhoods, public data, and city updates.',
    sources: 'DataSF, SFMTA, SFPUC, Bay Area Census, California state data',
    priority: 'med',
    badges: ['geo', 'ai'],
    coverColor: '#5f3f8c',
    logoUrl: livingCitiesLogoUrl,
    heroUrl: null,
    cityConfig: cityConfig({
      cityName: 'San Francisco',
      regionName: 'California',
      timezone: 'America/Los_Angeles',
      censusStateCode: '06',
      censusPlaceCode: '67000',
      airnowZipCode: '94102',
    }),
    chatGuide: chatGuide('San Francisco'),
    personaPrompt: buildCityPersona(
      'San Francisco',
      'California',
      'Muni, BART, housing, climate policy, tech, city services, neighborhoods, public data, and civic innovation',
    ),
  },
  {
    slug: 'new-york-city',
    name: 'Living Wiki: New York City',
    description:
      "NYC's sustainability infrastructure, transit, climate resilience, and green economy — the largest open data program in the world, compiled.",
    landingSummary:
      'A practical guide to New York City civic life, transit, climate resilience, housing, jobs, neighborhoods, culture, public services, and local updates.',
    sources: 'NYC Open Data (2,700+ datasets), MTA, NYC DEP, PlaNYC, Census',
    priority: 'med',
    badges: ['geo', 'trending'],
    coverColor: '#1d4f7a',
    logoUrl: livingCitiesLogoUrl,
    heroUrl: null,
    cityConfig: cityConfig({
      cityName: 'New York City',
      regionName: 'New York',
      timezone: 'America/New_York',
      censusStateCode: '36',
      censusPlaceCode: '51000',
      airnowZipCode: '10007',
    }),
    chatGuide: chatGuide('New York City'),
    personaPrompt: buildCityPersona(
      'New York City',
      'New York',
      'MTA, housing, climate resilience, borough life, city services, jobs, culture, local news, and open data',
    ),
  },
];

export function findCityAtlasTemplate(slug: string): CityAtlasTemplate | null {
  const normalized = slug.trim().toLowerCase();
  return CITY_ATLAS_TEMPLATES.find((template) => template.slug === normalized) ?? null;
}
