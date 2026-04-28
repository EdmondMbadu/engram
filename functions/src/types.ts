export const SUPPORTED_FILE_TYPES = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'txt',
  'md',
  'png',
  'jpg',
  'jpeg',
  'url',
] as const;

export type SupportedFileType = (typeof SUPPORTED_FILE_TYPES)[number];

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

export interface ModelUsage {
  model: string;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  call_count: number;
}

export interface DocumentAiUsage extends ModelUsage {
  compile_call_count: number;
  summary_call_count: number;
}

export interface DocumentRecord {
  user_id: string;
  filename: string;
  file_type: SupportedFileType;
  storage_path: string | null;
  source_type: 'file' | 'url';
  source_url: string | null;
  status: DocumentStatus;
  processing_stage: DocumentProcessingStage;
  processed_chunks: number;
  total_chunks: number;
  page_count: number;
  wiki_pages_generated: number;
  citation_count: number;
  collection_id: string | null;
  atlas_id: string | null;
  uploaded_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  indexed_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  deleted_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  last_heartbeat_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  visible: boolean;
  mime_type: string | null;
  file_size: number | null;
  title: string | null;
  ai_usage: DocumentAiUsage;
  error_message?: string | null;
  failure_code?: string | null;
}

export interface ExtractBlock {
  page: number;
  lineStart: number;
  lineEnd: number;
  text: string;
}

export interface KnowledgeEntryDraft {
  claim: string;
  topic: string;
  related_topics: string[];
  source: {
    page: number;
    line_start: number;
    line_end: number;
  };
}

export interface KnowledgeEntryRecord {
  claim: string;
  topic: string;
  related_topics: string[];
  document_id: string;
  user_id: string;
  atlas_id: string | null;
  source: {
    page: number;
    line_start: number;
    line_end: number;
  };
  orphaned: boolean;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  last_updated: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface TopicEntryPreview {
  id: string;
  claim: string;
  topic: string;
  related_topics: string[];
  document_id: string;
  source: {
    page: number;
    line_start: number;
    line_end: number;
  };
}

export interface WikiTopicRecord {
  name: string;
  summary: string;
  search_text?: string;
  retrieval_entries?: TopicEntryPreview[];
  entry_ids: string[];
  document_ids: string[];
  user_id: string;
  atlas_id: string | null;
  last_updated: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  summary_status?: 'pending' | 'ready' | 'failed';
  summary_error?: string | null;
}

export interface WikiTopicJobRecord {
  user_id: string;
  atlas_id: string | null;
  topic_id: string;
  topic_name: string;
  triggered_by_document_id: string | null;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface QueryCitationSnapshot {
  entry_id: string;
  text: string;
  filename: string;
  page: number;
  line_start: number;
  line_end: number;
}

export interface QueryRecord {
  user_id: string;
  atlas_id: string | null;
  question: string;
  answer: string;
  cited_entry_ids: string[];
  cited_passages: QueryCitationSnapshot[];
  knowledge_gap?: boolean;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updated_at?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
}

export interface ChatThreadRecord {
  user_id: string;
  atlas_id: string | null;
  title: string;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  is_shared?: boolean;
  shared_at?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  last_question: string;
  last_answer_preview: string;
  message_count: number;
  user_turn_count: number;
}

export interface ChatMessageRecord {
  thread_id: string;
  user_id: string;
  atlas_id: string | null;
  role: 'user' | 'assistant';
  text: string;
  cited_passages?: QueryCitationSnapshot[];
  knowledge_gap?: boolean;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface PublicChatThreadRecord {
  atlas_id: string;
  atlas_owner_user_id: string;
  visitor_kind: 'anonymous' | 'authenticated';
  visitor_uid: string | null;
  anonymous_visitor_id: string | null;
  visitor_display_name: string | null;
  visitor_email: string | null;
  title: string;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  last_question: string;
  last_answer_preview: string;
  message_count: number;
  user_turn_count: number;
}

export interface PublicChatMessageRecord {
  thread_id: string;
  atlas_id: string;
  atlas_owner_user_id: string;
  visitor_kind: 'anonymous' | 'authenticated';
  visitor_uid: string | null;
  anonymous_visitor_id: string | null;
  role: 'user' | 'assistant';
  text: string;
  cited_passages?: QueryCitationSnapshot[];
  knowledge_gap?: boolean;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface PreparedUpload {
  documentId: string;
  storagePath: string;
  fileType: SupportedFileType;
}

export interface AtlasRecord {
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_public: boolean;
  logo_url: string | null;
  hero_url: string | null;
  cover_color: string | null;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface AskAtlasResponse {
  answer: string;
  citedEntryIds: string[];
  citedPassages: QueryCitationSnapshot[];
  scopedTopicIds: string[];
  knowledgeGap: boolean;
  threadId: string;
}

export interface WikiArticleRecord {
  user_id: string;
  atlas_id: string | null;
  title: string;
  content: string;
  summary: string;
  source_documents: WikiArticleSource[];
  related_articles: string[];
  word_count: number;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  last_updated: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface WikiArticleSource {
  document_id: string;
  filename: string;
  pages: number[];
}

export interface WikiArticleDraft {
  title: string;
  content: string;
  summary: string;
  related_articles: string[];
  source_pages: Array<{ filename: string; page: number }>;
}

export interface WikiArticlePlan {
  update: Array<{ article_id: string; title: string; reason: string }>;
  create: Array<{ title: string; scope: string }>;
}

export interface WikiIndexEntry {
  article_id: string;
  title: string;
  summary: string;
  document_ids: string[];
}

export interface WikiIndexRecord {
  user_id: string;
  atlas_id: string | null;
  entries: WikiIndexEntry[];
  last_updated: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}
