const assert = require('node:assert/strict');
const {
  buildCityPlaceTextSearchRequest,
  cityPlaceSearchRadiusMeters,
} = require('../lib/city-place-search.js');

const philadelphia = buildCityPlaceTextSearchRequest("  Jim's   Barber  ", {
  cityName: 'Philadelphia',
  regionName: 'Pennsylvania',
  countryCode: 'US',
  latitude: 39.9526,
  longitude: -75.1652,
});

assert.deepEqual(philadelphia, {
  query: "Jim's Barber",
  location: '39.9526,-75.1652',
  radius: cityPlaceSearchRadiusMeters,
  region: 'us',
});
assert.equal(cityPlaceSearchRadiusMeters, 50_000);

const fallback = buildCityPlaceTextSearchRequest('barber', {
  cityName: 'Philadelphia',
  regionName: 'Pennsylvania',
  countryCode: 'US',
  latitude: null,
  longitude: null,
});

assert.deepEqual(fallback, {
  query: 'barber near Philadelphia, Pennsylvania, US',
  region: 'us',
});

const explicitNearbyTown = buildCityPlaceTextSearchRequest('barber Ardmore', {
  cityName: 'Philadelphia',
  regionName: 'Pennsylvania',
  countryCode: 'US',
  latitude: 39.9526,
  longitude: -75.1652,
});

assert.equal(explicitNearbyTown.query, 'barber Ardmore');
assert.equal(explicitNearbyTown.location, '39.9526,-75.1652');

const ukRegion = buildCityPlaceTextSearchRequest('barber', {
  cityName: 'London',
  regionName: 'England',
  countryCode: 'GB',
  latitude: 51.5072,
  longitude: -0.1276,
});

assert.equal(ukRegion.region, 'uk');

console.log('City place search bias tests passed.');
