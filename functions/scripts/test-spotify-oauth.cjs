const assert = require('node:assert/strict');
const { resolveSpotifyOAuthRedirectUri } = require('../lib/spotify-oauth.js');

const publicAppUrl = 'https://livingwiki.com';
const brandedCallback = 'https://livingwiki.com/auth/spotify/callback';

assert.equal(resolveSpotifyOAuthRedirectUri(undefined, publicAppUrl), brandedCallback);
assert.equal(resolveSpotifyOAuthRedirectUri('', `${publicAppUrl}/`), brandedCallback);
assert.equal(
  resolveSpotifyOAuthRedirectUri('https://accounts.example.com/spotify/callback', publicAppUrl),
  'https://accounts.example.com/spotify/callback',
);
assert.equal(
  resolveSpotifyOAuthRedirectUri('http://accounts.example.com/spotify/callback', publicAppUrl),
  brandedCallback,
);
assert.equal(
  resolveSpotifyOAuthRedirectUri('not a URL', publicAppUrl),
  brandedCallback,
);

console.log('Spotify OAuth redirect tests passed.');
