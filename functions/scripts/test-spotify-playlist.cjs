const assert = require('node:assert/strict');
const {
  SPOTIFY_PLAYLIST_SCOPE,
  spotifyCanExportPlaylist,
  spotifyPlaylistContentHash,
  spotifyPlaylistDescription,
  spotifyPlaylistName,
} = require('../lib/spotify-playlist.js');

assert.equal(SPOTIFY_PLAYLIST_SCOPE, 'playlist-modify-private');
assert.equal(spotifyCanExportPlaylist(['streaming']), false);
assert.equal(spotifyCanExportPlaylist(['streaming', SPOTIFY_PLAYLIST_SCOPE]), true);
assert.equal(spotifyPlaylistName('  My   favorites  '), 'My favorites');
assert.equal(spotifyPlaylistName(''), 'LivingWiki music board');
assert.match(spotifyPlaylistDescription('board id'), /board%20id$/);
assert.equal(
  spotifyPlaylistContentHash('board', ['spotify:track:AAAAAAAAAAAA']),
  spotifyPlaylistContentHash('board', ['spotify:track:AAAAAAAAAAAA']),
);
assert.notEqual(
  spotifyPlaylistContentHash('board', ['spotify:track:AAAAAAAAAAAA', 'spotify:track:BBBBBBBBBBBB']),
  spotifyPlaylistContentHash('board', ['spotify:track:BBBBBBBBBBBB', 'spotify:track:AAAAAAAAAAAA']),
);

console.log('Spotify playlist tests passed.');
