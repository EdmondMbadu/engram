import {
  customPublicUrlPath,
  customPublicUrlRouteMatches,
  customPublicUrlSlugError,
  normalizeCustomPublicUrlSlug,
} from './custom-public-url';

describe('custom public URLs', () => {
  it('normalizes human-friendly input deterministically', () => {
    expect(normalizeCustomPublicUrlSlug('  Cape May Gems!  ')).toBe('cape-may-gems');
    expect(normalizeCustomPublicUrlSlug('Montréal___Cafés')).toBe('montreal-cafes');
    expect(normalizeCustomPublicUrlSlug('many---spaces')).toBe('many-spaces');
  });

  it('rejects reserved, short, and UUID-shaped slugs', () => {
    expect(customPublicUrlSlugError('u')).toContain('at least');
    expect(customPublicUrlSlugError('admin')).toContain('reserved');
    expect(customPublicUrlSlugError('750dfe0a-d492-4965-86dd-b8dcc2d98aca')).toContain('system-style');
  });

  it('builds the public paths requested by the product', () => {
    expect(customPublicUrlPath('board', 'capemaygems')).toBe('/boards/capemaygems');
    expect(customPublicUrlPath('collection', 'capemaygems')).toBe('/collections/capemaygems');
  });

  it('recognizes a loaded resource by either its permanent ID or custom slug', () => {
    const id = '750dfe0a-d492-4965-86dd-b8dcc2d98aca';
    expect(customPublicUrlRouteMatches(id, id, 'cape-may-gems')).toBeTrue();
    expect(customPublicUrlRouteMatches('Cape-May-Gems', id, 'cape-may-gems')).toBeTrue();
    expect(customPublicUrlRouteMatches('another-board', id, 'cape-may-gems')).toBeFalse();
  });
});
