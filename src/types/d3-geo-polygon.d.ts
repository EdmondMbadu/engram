// Minimal ambient types for the subset of d3-geo-polygon we use.
// The package ships no type definitions; we only need geoAirocean (the
// Fuller / Dymaxion projection) to compute marker positions on /dymaxion.
declare module 'd3-geo-polygon' {
  import type { GeoProjection } from 'd3-geo';
  export function geoAirocean(): GeoProjection;
}
