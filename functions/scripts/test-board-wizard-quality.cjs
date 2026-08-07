const assert = require('node:assert/strict');
const {
  buildBoardWizardFictionalCharacterSearchQueries,
  buildBoardWizardFictionalCharacterWikipediaTitles,
  buildBoardWizardCommonsSearchQueries,
  buildBoardWizardContextualImagePrompt,
  buildBoardWizardImageRecoveryQueries,
  buildBoardWizardPlaceSearchQueries,
  disambiguateBoardWizardFictionalCharacterEntities,
  isBoardWizardFictionalCharacter,
  rankBoardWizardPlaceCandidates,
  scoreBoardWizardFictionalCharacterImageResult,
  shouldResolveBoardWizardCardAsPlace,
  stripBoardWizardReferenceTitleDescriptor,
  wikipediaPageTitleMatchScore,
} = require('../lib/board-wizard-image-quality.js');
const {
  shouldGroundAndVerifyBoardWizardBatch,
  boardWizardResearchMode,
} = require('../lib/board-wizard-generation-quality.js');
const { resolveBoardWizardMediaKind } = require('../lib/board-wizard-media-quality.js');

const score = (query, pageTitle, candidates) =>
  wikipediaPageTitleMatchScore(query, pageTitle, candidates);

assert.ok(score('Marie Curie physicist portrait', 'Marie Curie', ['Marie Curie']) >= 80);
assert.equal(score('Marie Curie physicist portrait', 'Pierre Curie', ['Marie Curie']), 0);
assert.equal(score('Ada Lovelace portrait', 'Augusta Leigh', ['Ada Lovelace']), 0);
assert.ok(score('Titanic 1997 official movie poster', 'Titanic (1997 film)', ['Titanic (1997 film)', 'Titanic']) >= 80);
assert.equal(score('Titanic 1997 official movie poster', 'Titanic museum', ['Titanic (1997 film)']), 0);
assert.ok(score('Beatles band portrait', 'The Beatles', ['The Beatles']) >= 80);
assert.equal(score('Beatles band portrait', 'Beatles Ashram', ['The Beatles']), 0);
assert.equal(stripBoardWizardReferenceTitleDescriptor('Star-Lord'), 'Star-Lord');
assert.equal(stripBoardWizardReferenceTitleDescriptor('Spider-Man: Peter Parker'), 'Spider-Man');
assert.equal(stripBoardWizardReferenceTitleDescriptor('Titanic - official poster'), 'Titanic');

const shouldVerify = (prompt, count = 12, mode = 'describe') =>
  shouldGroundAndVerifyBoardWizardBatch({ mode, prompt, count });
assert.equal(shouldVerify('complete chronological list of a real-world set'), true);
assert.equal(shouldVerify('list of historical scientists with pictures'), true);
assert.equal(shouldVerify('all championship winners in order'), true);
assert.equal(shouldVerify('twenty independent items', 20), true);
assert.equal(shouldVerify('five creative taco ideas', 5), false);
assert.equal(shouldVerify('complete list from this source URL', 30, 'url'), true);
assert.equal(shouldVerify('SOURCE PAGE COULD NOT BE FETCHED. Use grounded web research.', 12, 'url'), true);
assert.equal(shouldGroundAndVerifyBoardWizardBatch({mode:'url', prompt:'Use this article', count:15, sourceManifest:{items:[1]}}), true);
assert.equal(boardWizardResearchMode({mode:'url', prompt:'Top destinations', sourceManifest:{items:[1]}}), 'source');
assert.equal(boardWizardResearchMode({mode:'describe', prompt:'Top places to visit, ranked with an insider point of view'}), 'curated');
assert.equal(boardWizardResearchMode({mode:'paste', prompt:'', pastedList:'1. A'}), 'source');
assert.equal(resolveBoardWizardMediaKind({
  title: 'Glenfiddich', subtitle: 'Dufftown, Speyside', entity_type: 'place', image_intent: 'place',
  image_query: 'Glenfiddich distillery visitor centre', media_kind: 'none',
}), 'none');
assert.equal(resolveBoardWizardMediaKind({
  title: 'The Balvenie', subtitle: 'Book a tour', entity_type: 'place', image_intent: 'place',
  image_query: 'The Balvenie distillery',
}), 'none');
assert.equal(resolveBoardWizardMediaKind({
  title: 'A real song', subtitle: 'Artist name', entity_type: 'work', image_intent: 'cover',
  image_query: 'A real song Artist name cover art', media_kind: 'song',
}), 'song');

const designerShoeCard = {
  title: 'Miu Miu x New Balance 530 SL',
  subtitle: 'A slim-profile designer sneaker collaboration',
  notes: 'A polished low-profile sneaker for fashion-conscious teenagers.',
  type: 'shop',
  entity_name: 'Miu Miu x New Balance 530 SL',
  entity_type: 'product',
  image_intent: 'product',
  image_context: 'designer sneaker collaboration · silver and brown colorways',
  image_query: 'Miu Miu New Balance 530 SL official product',
  tags: ['designer shoes', 'sneakers'],
};
const designerShoeRecovery = buildBoardWizardImageRecoveryQueries(
  designerShoeCard,
  'Top 10 Designer Shoes for Teenagers',
);
assert.match(designerShoeRecovery[0], /Miu Miu New Balance 530 SL official product/i);
assert.ok(designerShoeRecovery.some((query) => /designer product photograph/i.test(query)));
const designerShoePrompt = buildBoardWizardContextualImagePrompt(
  designerShoeCard,
  'Top 10 Designer Shoes for Teenagers',
  'A polished guide to statement footwear.',
);
assert.match(designerShoePrompt, /Exact card subject: Miu Miu x New Balance 530 SL/i);
assert.match(designerShoePrompt, /Premium editorial studio product photography/i);
assert.match(designerShoePrompt, /omit uncertain lettering and logos/i);

const odysseySceneCard = {
  title: 'Thrinacia',
  subtitle: 'The forbidden cattle of the sun god',
  notes: 'Odysseus warns his starving crew not to harm the sacred cattle of Helios.',
  type: 'note',
  entity_name: 'Thrinacia',
  entity_type: 'event',
  image_intent: 'event',
  image_context: 'island of Helios · sacred cattle · Homer’s Odyssey',
  image_query: 'Thrinacia cattle of Helios Odyssey scene',
};
const odysseyRecovery = buildBoardWizardImageRecoveryQueries(
  odysseySceneCard,
  'The Odyssey: Homer’s Epic Journey of Adventure, Temptation, Survival, and Homecoming',
);
assert.ok(odysseyRecovery.some((query) => /Thrinacia.*Helios.*Odyssey.*painting illustration/i.test(query)));
const odysseyPrompt = buildBoardWizardContextualImagePrompt(
  odysseySceneCard,
  'The Odyssey: Homer’s Epic Journey',
  'Adventure, temptation, survival, and homecoming.',
);
assert.match(odysseyPrompt, /museum-quality narrative illustration/i);
assert.match(odysseyPrompt, /sacred cattle/i);

const starLordCard = {
  title: 'Star-Lord: Peter Quill',
  subtitle: 'The cosmic leader of the Guardians',
  type: 'note',
  scope: 'region',
  entity_name: 'Star-Lord',
  entity_type: 'fictional_character',
  image_intent: 'character',
  image_context: 'Peter Quill · Marvel Cinematic Universe · Guardians of the Galaxy · portrayed by Chris Pratt',
  image_query: 'Star-Lord portrait',
  media_kind: 'none',
};
assert.equal(isBoardWizardFictionalCharacter(starLordCard), true);
assert.equal(isBoardWizardFictionalCharacter({
  ...starLordCard,
  entity_type: 'person',
  image_intent: 'portrait',
  image_query: 'Star-Lord Peter Quill Marvel character',
}), true);
assert.equal(isBoardWizardFictionalCharacter({
  title: 'Chris Pratt',
  entity_name: 'Chris Pratt',
  entity_type: 'person',
  image_intent: 'portrait',
  image_context: 'actor · Marvel Cinematic Universe',
  image_query: 'Chris Pratt actor portrait',
  media_kind: 'none',
}), false);
assert.equal(shouldResolveBoardWizardCardAsPlace(starLordCard), false);
assert.equal(resolveBoardWizardMediaKind(starLordCard), 'none');
const starLordQueries = buildBoardWizardFictionalCharacterSearchQueries(
  starLordCard,
  'Avengers Assemble: The Top 20 Movie Heroes',
);
assert.match(starLordQueries[0], /Star-Lord.*Peter Quill.*Marvel.*Cinematic.*Universe.*Guardians.*Galaxy.*fictional character/i);
assert.doesNotMatch(buildBoardWizardFictionalCharacterSearchQueries({
  ...starLordCard,
  image_context: '',
}, 'The Top 20 Movie Heroes')[0], /\b20\b/);
assert.ok(scoreBoardWizardFictionalCharacterImageResult(
  starLordCard,
  'Avengers Assemble: The Top 20 Movie Heroes',
  'Star-Lord (Peter Quill) | Marvel Studios | Guardians of the Galaxy | Chris Pratt',
) > 0);
assert.equal(scoreBoardWizardFictionalCharacterImageResult(
  starLordCard,
  'Avengers Assemble: The Top 20 Movie Heroes',
  'A bright star beside the moon in an astronomical night sky',
), 0);
assert.equal(scoreBoardWizardFictionalCharacterImageResult(
  starLordCard,
  'Avengers Assemble: The Top 20 Movie Heroes',
  'Star Lord action figure and collectible toy',
), 0);

const samWilsonCard = {
  title: 'Sam Wilson: Captain America',
  subtitle: 'The winged Avenger takes up the shield',
  type: 'note',
  scope: 'region',
  entity_name: 'Sam Wilson',
  entity_type: 'fictional_character',
  image_intent: 'character',
  image_context: 'Captain America · Marvel Cinematic Universe · Avengers · portrayed by Anthony Mackie',
  image_query: 'Sam Wilson portrait',
  media_kind: 'none',
};
const samWilsonQueries = buildBoardWizardFictionalCharacterSearchQueries(samWilsonCard, 'Marvel movie heroes');
assert.match(samWilsonQueries[0], /Sam Wilson.*Captain America.*Marvel.*Cinematic.*Universe.*Avengers/i);
const samWilsonWikipediaTitles = buildBoardWizardFictionalCharacterWikipediaTitles(samWilsonCard);
assert.equal(samWilsonWikipediaTitles[0], 'Sam Wilson (Marvel Cinematic Universe)');
assert.ok(samWilsonWikipediaTitles.indexOf('Captain America (Marvel Cinematic Universe)') > 0);
assert.ok(scoreBoardWizardFictionalCharacterImageResult(
  samWilsonCard,
  'Marvel movie heroes',
  'Sam Wilson Captain America in Marvel Studios Avengers, portrayed by Anthony Mackie',
) > 0);
assert.equal(scoreBoardWizardFictionalCharacterImageResult(
  samWilsonCard,
  'Marvel movie heroes',
  'Sam Wilson medieval knight statues and monuments',
), 0);
assert.equal(scoreBoardWizardFictionalCharacterImageResult(
  samWilsonCard,
  'Marvel movie heroes',
  'Portrait of a real person named Sam Wilson at a business conference',
), 0);

const thorCard = {
  title: 'Thor Odinson',
  subtitle: 'The God of Thunder',
  type: 'note',
  entity_name: 'Thor',
  entity_type: 'fictional_character',
  image_intent: 'character',
  image_context: 'Thor Odinson · Marvel Cinematic Universe · Avengers · portrayed by Chris Hemsworth',
  image_query: 'Thor Odinson Marvel Avengers character',
  media_kind: 'none',
};
const thorWikipediaTitles = buildBoardWizardFictionalCharacterWikipediaTitles(thorCard);
assert.equal(thorWikipediaTitles[0], 'Thor (Marvel Cinematic Universe)');
assert.ok(thorWikipediaTitles.indexOf('Thor') > thorWikipediaTitles.indexOf('Thor (Marvel Cinematic Universe)'));
assert.ok(scoreBoardWizardFictionalCharacterImageResult(
  thorCard,
  'Avengers movie heroes',
  'Thor is a fictional character in the Marvel Cinematic Universe portrayed by Chris Hemsworth',
) > 0);
assert.equal(scoreBoardWizardFictionalCharacterImageResult(
  thorCard,
  'Avengers movie heroes',
  'Thor is a hammer-wielding god in Norse mythology, depicted in a medieval manuscript',
), 0);

const lokiCard = {
  ...thorCard,
  title: 'Loki: God of Stories',
  entity_name: 'Loki',
  image_context: 'Loki Laufeyson · Marvel Cinematic Universe · Avengers · portrayed by Tom Hiddleston',
  image_query: 'Loki Marvel Cinematic Universe Tom Hiddleston character',
};
assert.equal(buildBoardWizardFictionalCharacterWikipediaTitles(lokiCard)[0], 'Loki (Marvel Cinematic Universe)');
assert.equal(scoreBoardWizardFictionalCharacterImageResult(
  lokiCard,
  'Avengers movie heroes',
  'Loki is a Norse deity shown in a medieval illustration',
), 0);
assert.ok(scoreBoardWizardFictionalCharacterImageResult(
  lokiCard,
  'Avengers movie heroes',
  'Loki is a Marvel Cinematic Universe fictional character portrayed by Tom Hiddleston',
) > 0);

const deadpoolCard = {
  ...thorCard,
  title: 'Deadpool: Wade Wilson',
  entity_name: 'Deadpool',
  image_context: 'Wade Wilson · Marvel Comics · Marvel Cinematic Universe · portrayed by Ryan Reynolds',
  image_query: 'Deadpool Wade Wilson Marvel Ryan Reynolds fictional character',
};
assert.ok(scoreBoardWizardFictionalCharacterImageResult(
  deadpoolCard,
  'Avengers movie heroes',
  'Deadpool is the Marvel Comics character Wade Wilson, portrayed in film by Ryan Reynolds',
) > 0);

const repairedCaptainAmericas = disambiguateBoardWizardFictionalCharacterEntities([
  {
    ...samWilsonCard,
    title: 'Captain America: Steve Rogers',
    entity_name: 'Captain America',
    image_context: 'Marvel Cinematic Universe · Avengers · portrayed by Chris Evans',
  },
  {
    ...samWilsonCard,
    title: 'Captain America: Sam Wilson',
    entity_name: 'Captain America',
  },
]);
assert.equal(repairedCaptainAmericas[0].entity_name, 'Steve Rogers');
assert.equal(repairedCaptainAmericas[1].entity_name, 'Sam Wilson');
assert.match(repairedCaptainAmericas[0].image_context, /Captain America.*Marvel Cinematic Universe/i);
assert.match(repairedCaptainAmericas[1].image_query, /Sam Wilson.*Captain America.*Marvel.*Cinematic.*Universe/i);

const laphroaigCard = {
  title: 'Laphroaig: The Peat Monster of Islay',
  subtitle: 'Islay | The love-it-or-hate-it medicinal masterpiece',
  type: 'place',
  scope: 'region',
  entity_name: 'Laphroaig Distillery',
  entity_type: 'place',
  image_intent: 'place',
  image_context: 'Islay, Scotland',
  image_query: 'Laphroaig Distillery exterior Islay Scotland',
  place_query: 'Laphroaig Distillery, Islay, Scotland',
  media_kind: 'none',
};
assert.equal(shouldResolveBoardWizardCardAsPlace(laphroaigCard), true);
assert.equal(shouldResolveBoardWizardCardAsPlace({
  title: 'Joe Biden', type: 'place', scope: 'country', entity_type: 'person', image_intent: 'portrait', media_kind: 'none',
}), false);
assert.equal(shouldResolveBoardWizardCardAsPlace({
  title: 'A Song', type: 'place', scope: 'region', entity_type: 'work', image_intent: 'cover', media_kind: 'song',
}), false);
assert.equal(shouldResolveBoardWizardCardAsPlace({
  title: 'The National Museum', type: 'note', scope: 'country', entity_type: 'organization', image_intent: 'place', media_kind: 'none',
}), true);
assert.equal(shouldResolveBoardWizardCardAsPlace({
  title: 'A Camera', type: 'place', scope: 'place', entity_type: 'product', image_intent: 'product', media_kind: 'none',
}), false);

const placeQueries = buildBoardWizardPlaceSearchQueries(laphroaigCard, 'Scotland');
assert.ok(placeQueries.some((query) => query === 'Laphroaig Distillery'));
assert.ok(placeQueries.some((query) => /Laphroaig Distillery.*Islay/i.test(query)));
const commonsQueries = buildBoardWizardCommonsSearchQueries(laphroaigCard, 'Scotland');
assert.ok(commonsQueries.includes('Laphroaig Distillery'));
assert.ok(commonsQueries.length >= 3);
const personCommonsQueries = buildBoardWizardCommonsSearchQueries({
  title: 'The Scientist: Marie Curie',
  type: 'note',
  entity_name: 'Marie Curie',
  entity_type: 'person',
  image_intent: 'portrait',
  image_query: 'Marie Curie physicist portrait',
  image_context: 'physicist',
  media_kind: 'none',
}, 'Scientists');
assert.equal(personCommonsQueries[0], 'Marie Curie physicist portrait');

const highlandParkCard = {
  title: 'Highland Park: The Viking Soul',
  subtitle: 'Orkney | Heather honey and light peat',
  type: 'place',
  scope: 'region',
  entity_name: 'Highland Park Distillery',
  entity_type: 'place',
  image_intent: 'place',
  image_context: 'Orkney, Scotland',
  media_kind: 'none',
};
const rankedPlaces = rankBoardWizardPlaceCandidates(highlandParkCard, [
  {
    name: 'Highland Park',
    formatted_address: 'Highland Park, Illinois, USA',
    types: ['locality', 'political'],
    photos: [{}],
    user_ratings_total: 1000,
  },
  {
    name: 'Highland Park Whisky Distillery',
    formatted_address: 'Holm Road, Kirkwall, Orkney, Scotland',
    types: ['tourist_attraction', 'establishment'],
    photos: [{}],
    rating: 4.7,
    user_ratings_total: 800,
  },
  {
    name: 'Scapa Distillery',
    formatted_address: 'Kirkwall, Orkney, Scotland',
    types: ['establishment'],
    photos: [{}],
  },
], 'Scotland');
assert.equal(rankedPlaces[0].candidate.name, 'Highland Park Whisky Distillery');
assert.ok(!rankedPlaces.some((item) => item.candidate.name === 'Scapa Distillery'));

const canneryBuildingCard = {
  title: 'Monterey Canning Co. Building 700',
  type: 'place',
  scope: 'place',
  entity_name: 'Monterey Canning Co. Building 700',
  entity_type: 'place',
  image_intent: 'place',
  image_context: 'Pacific Grove, California, US',
  place_query: 'Monterey Canning Co. Building 700, Pacific Grove, California, US',
  locationLat: 36.6154,
  locationLng: -121.8977,
};
const rankedCanneryPlaces = rankBoardWizardPlaceCandidates(canneryBuildingCard, [
  {
    name: 'Cannery Row',
    formatted_address: '700 Cannery Row, Monterey, CA',
    types: ['tourist_attraction'],
    photos: [{}],
    geometry: { location: { lat: 36.6155, lng: -121.8978 } },
  },
  {
    name: 'Cannery Row Antique Mall',
    formatted_address: 'Elsewhere, California',
    types: ['store'],
    photos: [{}],
    geometry: { location: { lat: 37.1, lng: -122.2 } },
  },
], 'Pacific Grove, California');
assert.equal(rankedCanneryPlaces[0].candidate.name, 'Cannery Row');
assert.ok(!rankedCanneryPlaces.some((item) => item.candidate.name === 'Cannery Row Antique Mall'));

const hotelWithAdjacentCityHint = {
  title: 'InterContinental the Clement Hotel',
  type: 'place',
  scope: 'place',
  entity_name: 'InterContinental the Clement Hotel',
  entity_type: 'place',
  image_intent: 'place',
  image_context: 'Pacific Grove, California, US',
  locationLat: 36.6162,
  locationLng: -121.8991,
};
const rankedAdjacentCityHotel = rankBoardWizardPlaceCandidates(hotelWithAdjacentCityHint, [{
  name: 'InterContinental The Clement Monterey, an IHG Hotel',
  formatted_address: '750 Cannery Row, Monterey, CA',
  types: ['lodging'],
  photos: [{}],
  geometry: { location: { lat: 36.6163, lng: -121.8992 } },
}], 'Pacific Grove, California');
assert.equal(rankedAdjacentCityHotel[0].candidate.name, 'InterContinental The Clement Monterey, an IHG Hotel');

console.log('Board wizard image-quality tests passed.');
