/**
 * D1 binding contract used by this application and Drizzle's D1 adapter.
 * Keep query results unknown until callers supply a row type or validate them.
 * https://developers.cloudflare.com/d1/worker-api/
 * These declarations provide types only; the Worker runtime supplies the binding.
 */
interface D1Meta {
  duration: number;
  size_after: number;
  rows_read: number;
  rows_written: number;
  last_row_id: number;
  changed_db: boolean;
  changes: number;
  served_by?: string;
}

interface D1Response {
  success: boolean;
  meta: D1Meta;
  error?: string;
}

interface D1Result<T = Record<string, unknown>> extends D1Response {
  results: T[];
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
  dump(): Promise<ArrayBuffer>;
}

declare module "cloudflare:workers" {
  export const env: { readonly DB: D1Database };
}
