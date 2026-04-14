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
  last_updated: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  summary_status?: 'pending' | 'ready' | 'failed';
  summary_error?: string | null;
}

export interface WikiTopicJobRecord {
  user_id: string;
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
  question: string;
  answer: string;
  cited_entry_ids: string[];
  cited_passages: QueryCitationSnapshot[];
  knowledge_gap?: boolean;
  created_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updated_at?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
}

export interface PreparedUpload {
  documentId: string;
  storagePath: string;
  fileType: SupportedFileType;
}

export interface AskAtlasResponse {
  answer: string;
  citedEntryIds: string[];
  citedPassages: QueryCitationSnapshot[];
  scopedTopicIds: string[];
  knowledgeGap: boolean;
}
