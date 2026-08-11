import type { AtlasItem } from './atlas.models';
import { buildPublicWikiLiveItem } from './public-wiki-catalog';

describe('public university catalog mapping', () => {
  it('keeps a university out of the city category and exposes source-backed facts', () => {
    const atlas: AtlasItem = {
      id: 'university-1',
      user_id: 'admin-1',
      wiki_type: 'university',
      name: 'Example University',
      slug: 'example-university',
      description: 'A source-aware institution guide.',
      landing_summary: null,
      is_public: true,
      logo_url: 'https://example.edu/logo.png',
      hero_url: 'https://commons.wikimedia.org/example.jpg',
      video_url: null,
      cover_color: '#173f35',
      city_config: null,
      university_config: {
        enabled: true,
        unit_id: '123456',
        ope_id: null,
        official_name: 'Example University',
        city: 'Example City',
        state: 'CA',
        country_code: 'US',
        website: 'https://example.edu/',
        accreditation_agency: null,
        control: 'Public',
        highest_degree: 'Graduate degree',
        latitude: 34,
        longitude: -118,
        undergraduate_enrollment: 12000,
        admission_rate: 0.4,
        completion_rate: 0.8,
        retention_rate: 0.9,
        average_net_price: 18000,
        median_earnings_10_year: 70000,
        data_year: 2026,
        cohort_rank: 42,
        cohort_score: 87.5,
        cohort_version: 'test-2026',
        source_url: 'https://collegescorecard.ed.gov/data/',
        source_fetched_at: '2026-08-11T00:00:00.000Z',
      },
    };

    const item = buildPublicWikiLiveItem(atlas);
    expect(item.category).toBe('Universities');
    expect(item.universityUnitId).toBe('123456');
    expect(item.universityState).toBe('CA');
    expect(item.undergraduateEnrollment).toBe(12000);
    expect(item.population).toBeNull();
    expect(item.link).toBe('/chat/example-university');
  });
});
