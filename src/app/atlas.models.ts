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

export interface AtlasItem {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_public: boolean;
  logo_url: string | null;
  hero_url: string | null;
  video_url: string | null;
  cover_color: string | null;
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

export interface AtlasUsage {
  documents: number;
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
  role: 'user' | 'assistant';
  text: string;
  cited_passages?: CitationPassage[];
  knowledge_gap?: boolean;
  created_at?: { toDate(): Date } | Date | null;
}
