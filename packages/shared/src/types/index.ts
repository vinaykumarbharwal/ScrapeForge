export type PlanType = 'free' | 'pro' | 'team';

export type TaskStatus = 'active' | 'paused' | 'archived';

export type RunStatus = 'running' | 'success' | 'failed' | 'cancelled';

export type ExportFormat = 'csv' | 'json' | 'xlsx';

export type ExportStatus = 'pending' | 'success' | 'failed';

export type NotificationChannel = 'email' | 'webhook' | 'slack';

export interface SelectorField {
  name: string;
  selector: string;
  type: 'text' | 'attr' | 'html';
  attr?: string;
}

export interface PaginationConfig {
  type: 'next_button' | 'url_pattern' | 'infinite_scroll';
  selector?: string; // used for next_button
  urlTemplate?: string; // used for url_pattern (e.g. "https://example.com/products?page={page}")
  maxPages: number;
}

export interface TaskConfig {
  taskId: string;
  startUrl: string;
  pagination: PaginationConfig;
  fields: SelectorField[];
  rateLimitMs?: number;
  useProxy?: boolean;
}

export interface ColumnSchema {
  name: string;
  pg_type: string;
  nullable: boolean;
  samples?: string[];
}

export interface RawField {
  rawName: string;
  samples: string[];
  tagPath?: string;
  attrs?: Record<string, string>;
}

export interface InferredType {
  type: string;
  pg: string;
  confidence: number;
}

export interface SchemaDiff {
  isNewTable: boolean;
  added: ColumnSchema[];
  removed: ColumnSchema[];
  typeChanged: ColumnSchema[];
  typeNarrowed: ColumnSchema[];
  newColumns: ColumnSchema[];
}

export interface ScraperResult {
  rowCount: number;
  pageCount: number;
  status: RunStatus;
  error?: string;
}

export interface ScraperEvent {
  type: 'run_success' | 'run_failed' | 'run_slow' | 'schema_changed' | 'schema_warning' | 'quota_near_limit';
  taskId: string;
  runId: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, any>;
}
