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

export interface DocumentAiUsage {
  model: string;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  call_count: number;
  compile_call_count: number;
  summary_call_count: number;
}

export interface DocumentItem {
  id: string;
  user_id: string;
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

export interface QueryHistoryItem {
  id: string;
  question: string;
  answer: string;
  cited_entry_ids: string[];
  cited_passages: CitationPassage[];
  knowledge_gap?: boolean;
  created_at?: { toDate(): Date } | Date | null;
  updated_at?: { toDate(): Date } | Date | null;
}
