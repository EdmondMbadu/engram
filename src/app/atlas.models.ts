export type DocumentStatus =
  | 'pending'
  | 'processing'
  | 'indexed'
  | 'failed'
  | 'deleted';

export type DocumentProcessingStage =
  | 'queued'
  | 'extracting'
  | 'writing_extracts'
  | 'compiling_knowledge'
  | 'writing_entries'
  | 'queuing_topics'
  | 'compiling_articles'
  | 'indexed'
  | 'failed';

export interface DocumentAiUsage {
  model: string;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  call_count: number;
  compile_call_count: number;
  summary_call_count: number;
}

export type CityPulseMetricFormat = 'number' | 'currency' | 'percent';

export interface CityPulseMetricRealtimeConfig {
  anchor_iso: string;
  baseline_value: number;
  rate_per_second: number;
  min_value?: number | null;
}

export interface CityPulseMetric {
  id: string;
  label: string;
  short_label: string;
  description: string;
  format: CityPulseMetricFormat;
  value: number;
  decimals?: number;
  unit_prefix?: string | null;
  unit_suffix?: string | null;
  source_label: string;
  source_detail?: string | null;
  source_url?: string | null;
  methodology?: string | null;
  cadence: 'realtime' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'manual';
  as_of?: string | null;
  realtime?: CityPulseMetricRealtimeConfig | null;
}

export interface CityPulseSnapshot {
  atlas_id: string;
  city_name: string;
  region_name: string | null;
  refreshed_at: string;
  metrics: CityPulseMetric[];
  notes?: string[];
}

export interface CityAtlasMetadata {
  /** Broad directory bucket, such as Africa, Americas, Asia, Europe, or Oceania. */
  global_region: string | null;
  /** Latest known city population, when attached during city creation/import. */
  population: number | null;
  population_year: number | null;
}

export interface CityAtlasConfig {
  enabled: boolean;
  city_name: string | null;
  region_name: string | null;
  country_code: string | null;
  timezone: string | null;
  census_state_code: string | null;
  census_place_code: string | null;
  airnow_zip_code: string | null;
  /** Geographic coordinates, used to place the city on the /dymaxion map. */
  latitude?: number | null;
  longitude?: number | null;
  metadata?: CityAtlasMetadata | null;
  manual_metrics?: CityPulseMetric[] | null;
}

export interface AtlasChatGuideConfig {
  name: string | null;
  label: string | null;
  image_url: string | null;
  banner_url: string | null;
}

export interface AtlasItem {
  id: string;
  user_id: string;
  admin_user_ids?: string[];
  admin_profiles?: AtlasAdminProfile[];
  name: string;
  slug: string;
  description: string | null;
  landing_summary: string | null;
  is_public: boolean;
  logo_url: string | null;
  hero_url: string | null;
  video_url: string | null;
  cover_color: string | null;
  city_config?: CityAtlasConfig | null;
  chat_guide?: AtlasChatGuideConfig | null;
  persona_prompt?: string | null;
  default_answer_mode?: 'wiki' | 'internet' | null;
  newsletter_config?: AtlasNewsletterConfig | null;
  public_voice_phone_number?: string | null;
  created_at?: { toDate(): Date } | Date | null;
  updated_at?: { toDate(): Date } | Date | null;
  stats?: {
    documents: number;
    knowledge_entries: number;
    wiki_topics: number;
    wiki_articles: number;
    chat_threads: number;
  } | null;
}

export interface AtlasAdminProfile {
  user_id: string;
  email: string | null;
  display_name: string | null;
  added_at?: { toDate(): Date } | Date | string | null;
}

export interface AtlasSubscriptionItem {
  id: string;
  atlas_id: string;
  email: string;
  status: 'active' | 'unsubscribed';
  subscriber_user_id?: string | null;
  source?: string | null;
  created_at?: { toDate(): Date } | Date | string | null;
  updated_at?: { toDate(): Date } | Date | string | null;
}

export interface AtlasNewsletterConfig {
  enabled: boolean;
  day_of_week: number;
  send_time: string;
  timezone: string;
  prompt: string;
  last_sent_key?: string | null;
  last_sent_at?: { toDate(): Date } | Date | string | null;
  last_recipient_count?: number | null;
  last_subject?: string | null;
}

export interface AtlasNewsletterTestResult {
  ok: boolean;
  sentTo: string;
  subject: string;
  previewText: string;
  messageId?: string | null;
}

export type AtlasTextMessagingProvider = 'twilio' | 'vapi';

export interface AtlasTextMessagingConfig {
  enabled: boolean;
  provider: AtlasTextMessagingProvider;
  phone_number: string | null;
  vapi_phone_number_id: string | null;
  webhook_token: string;
  webhook_url: string;
  updated_at?: { toDate(): Date } | Date | string | null;
}

export interface AtlasVoiceAgentConfig {
  enabled: boolean;
  phone_number: string | null;
  vapi_phone_number_id: string | null;
  vapi_assistant_id: string | null;
  webhook_token: string;
  tool_url: string;
  updated_at?: { toDate(): Date } | Date | string | null;
}

export interface AtlasUsage {
  documents: number;
  wiki_articles: number;
  knowledge_entries: number;
  wiki_topics: number;
  queries: number;
  chat_threads: number;
  total: number;
}

export interface DocumentItem {
  id: string;
  user_id: string;
  atlas_id?: string | null;
  filename: string;
  file_type: string;
  storage_path: string | null;
  source_type: 'file' | 'url';
  source_url: string | null;
  status: DocumentStatus;
  processing_stage?: DocumentProcessingStage;
  processed_chunks?: number;
  total_chunks?: number;
  page_count: number;
  wiki_pages_generated: number;
  citation_count: number;
  uploaded_at?: { toDate(): Date } | Date | null;
  indexed_at?: { toDate(): Date } | Date | null;
  last_heartbeat_at?: { toDate(): Date } | Date | null;
  visible: boolean;
  mime_type?: string | null;
  file_size?: number | null;
  title?: string | null;
  ai_usage?: DocumentAiUsage | null;
  error_message?: string | null;
  failure_code?: string | null;
}

export interface WikiTopicItem {
  id: string;
  name: string;
  summary: string;
  entry_ids: string[];
  document_ids: string[];
  user_id: string;
  last_updated?: { toDate(): Date } | Date | null;
}

export interface KnowledgeEntryItem {
  id: string;
  claim: string;
  topic: string;
  related_topics: string[];
  document_id: string;
  user_id: string;
  source: {
    page: number;
    line_start: number;
    line_end: number;
  };
  orphaned: boolean;
}

export interface CitationPassage {
  entry_id: string;
  text: string;
  filename: string;
  page: number;
  line_start: number;
  line_end: number;
}

export interface MappableLocation {
  name: string;
  search_query: string;
  address_hint?: string | null;
}

export interface TravelGuideCard {
  id: string;
  title: string;
  subtitle?: string | null;
  description: string;
  neighborhood?: string | null;
  best_for?: string | null;
  vibe?: string | null;
  local_tip?: string | null;
  cost?: string | null;
  time_hint?: string | null;
  image_url?: string | null;
  map_query?: string | null;
  source_url?: string | null;
}

export interface TravelGuideStructuredResponse {
  title?: string | null;
  summary?: string | null;
  cards: TravelGuideCard[];
  route?: string | null;
  next_actions?: string[];
}

export interface AnswerCardItem {
  id: string;
  atlasId: string | null;
  atlasName: string | null;
  question: string;
  answerPreview: string;
  title: string;
  subtitle: string;
  keyFacts: string[];
  didYouKnow: string[];
  mappableLocations: MappableLocation[];
  likeCount: number;
  sourceThreadId: string | null;
  sourceAnswerMode: 'wiki' | 'internet' | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AnswerQuizOptionItem {
  id: string;
  text: string;
}

export interface AnswerQuizQuestionItem {
  id: string;
  prompt: string;
  options: AnswerQuizOptionItem[];
}

export interface AnswerQuizLeaderboardItem {
  rank: number;
  displayName: string;
  score: number;
  total: number;
  percent: number;
  elapsedMs: number;
  attempts: number;
  updatedAt: string | null;
}

export interface AnswerQuizItem {
  id: string;
  answerCardId: string;
  atlasId: string | null;
  atlasName: string | null;
  title: string;
  description: string;
  sourceQuestion: string;
  questionCount: number;
  questions: AnswerQuizQuestionItem[];
  leaderboard: AnswerQuizLeaderboardItem[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AnswerQuizGradeResult {
  questionId: string;
  selectedOptionId: string | null;
  correctOptionId: string;
  correct: boolean;
  explanation: string;
}

export interface AnswerQuizGrade {
  score: number;
  total: number;
  percent: number;
  results: AnswerQuizGradeResult[];
}

export interface ChatThreadItem {
  id: string;
  kind: 'thread';
  title: string;
  last_question: string;
  last_answer_preview: string;
  message_count: number;
  user_turn_count: number;
  is_shared?: boolean;
  shared_at?: { toDate(): Date } | Date | null;
  created_at?: { toDate(): Date } | Date | null;
  updated_at?: { toDate(): Date } | Date | null;
}

export interface QueryHistoryItem {
  id: string;
  kind?: 'legacy';
  question: string;
  answer: string;
  cited_entry_ids: string[];
  cited_passages: CitationPassage[];
  knowledge_gap?: boolean;
  created_at?: { toDate(): Date } | Date | null;
  updated_at?: { toDate(): Date } | Date | null;
}

export type ChatHistoryItem = ChatThreadItem | QueryHistoryItem;

export interface WikiArticleItem {
  id: string;
  user_id: string;
  atlas_id?: string | null;
  title: string;
  content: string;
  summary: string;
  source_documents: Array<{
    document_id: string;
    filename: string;
    pages: number[];
  }>;
  related_articles: string[];
  word_count: number;
  created_at?: { toDate(): Date } | Date | null;
  last_updated?: { toDate(): Date } | Date | null;
}

export interface ChatStoredMessage {
  id: string;
  thread_id: string;
  user_id: string;
  answer_mode?: 'wiki' | 'internet';
  role: 'user' | 'assistant';
  text: string;
  cited_passages?: CitationPassage[];
  mappable_locations?: MappableLocation[];
  travel_guide?: TravelGuideStructuredResponse | null;
  knowledge_gap?: boolean;
  answer_card_id?: string | null;
  answer_quiz_id?: string | null;
  created_at?: { toDate(): Date } | Date | null;
}
