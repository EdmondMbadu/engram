declare module 'topojson-client' {
  import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

  export function feature<G extends Geometry = Geometry, P = GeoJsonProperties>(
    topology: unknown,
    object: unknown,
  ): Feature<G, P> | FeatureCollection<G, P>;
}
