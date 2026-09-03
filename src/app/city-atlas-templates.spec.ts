import { CITY_ATLAS_TEMPLATES, findCityAtlasTemplate } from './city-atlas-templates';

describe('city atlas templates', () => {
  it('includes a fully configured international Guatemala City template', () => {
    const template = findCityAtlasTemplate('guatemala-city');

    expect(template).not.toBeNull();
    expect(template?.name).toBe('LivingWiki: Guatemala City');
    expect(template?.heroUrl).toBe('/assets/public-wikis/guatemala-city-hero.jpg');
    expect(template?.cityConfig).toEqual(jasmine.objectContaining({
      enabled: true,
      city_name: 'Guatemala City',
      region_name: 'Guatemala Department',
      country_code: 'GT',
      timezone: 'America/Guatemala',
      census_state_code: null,
      census_place_code: null,
      airnow_zip_code: null,
      latitude: 14.641667,
      longitude: -90.513333,
    }));
    expect(template?.cityConfig.metadata).toEqual(jasmine.objectContaining({
      global_region: 'Americas',
      population: 923392,
      population_year: 2018,
      population_scope: 'city_proper',
      population_confidence: 'high',
    }));
  });

  it('keeps every city slug unique', () => {
    const slugs = CITY_ATLAS_TEMPLATES.map((template) => template.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
