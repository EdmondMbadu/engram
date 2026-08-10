import { createHash } from 'node:crypto';

export type CityBoardRecord = Record<string, unknown>;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function finiteInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? Math.trunc(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function safeIcon(value: unknown): string {
  const requested = text(value, 64).toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  const icon = requested === 'handball' ? 'sports_handball' : requested;
  return /^(?:dashboard|dashboard_customize|travel_explore|location_city|location_on|restaurant|local_cafe|local_bar|nightlife|beach_access|festival|hiking|directions_walk|directions_car|museum|history_edu|shopping_bag|storefront|favorite|auto_awesome|public|sports_handball|sports_basketball|sports_soccer|sports_football|sports_baseball|sports_tennis|sports_volleyball|fitness_center|music_note|palette|photo_camera|park|family_restroom|school|menu_book|theater_comedy|stadium|spa|pets)$/.test(icon)
    ? icon
    : 'dashboard_customize';
}

export function cityBoardAtlasId(board: CityBoardRecord | null | undefined): string {
  if (!board) return '';
  return text(board.atlas_id || board.generated_for_atlas_id, 180);
}

export function cityBoardListingId(atlasId: string, boardId: string): string {
  const key = `${atlasId}\u0000${boardId}`;
  return `city_board_${createHash('sha256').update(key).digest('hex').slice(0, 40)}`;
}

export function isPublicCityBoard(board: CityBoardRecord | null | undefined): boolean {
  if (!board || !cityBoardAtlasId(board)) return false;
  return board.visibility === 'public'
    && board.editorial_status === 'published'
    && board.city_listing_status === 'listed'
    && !board.deleted_at;
}

export function cityBoardListingPayload(
  boardId: string,
  board: CityBoardRecord,
): CityBoardRecord {
  const atlasId = cityBoardAtlasId(board);
  if (!atlasId || !isPublicCityBoard(board)) {
    throw new Error('Only approved public city boards can be projected.');
  }
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const featuredRank = Math.min(9_999, finiteInteger(board.city_feature_order, 9_999));
  return {
    board_id: boardId,
    atlas_id: atlasId,
    title: text(board.title, 100) || 'Untitled board',
    description: text(board.description, 280),
    icon: safeIcon(board.icon),
    tone: text(board.tone, 24) || 'teal',
    image_url: text(board.imageUrl, 2_000),
    kind: text(board.kind, 40) || 'standard',
    card_count: cards.length,
    publisher_name: text(board.owner_display_name, 100) || 'LivingWiki',
    publisher_type: text(board.publisher_type, 40),
    featured_rank: featuredRank,
    approved_at: board.approved_at ?? null,
    updated_at_iso: text(board.updated_at_iso, 64),
    visibility: 'public',
    editorial_status: 'published',
    city_listing_status: 'listed',
  };
}
