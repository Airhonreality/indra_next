import { pgTable, text, timestamp, jsonb, uuid, boolean } from "drizzle-orm/pg-core";
import type { FieldSchema } from "@/core/types/integration";

/**
 * INTEGRATIONS TABLE
 * Stores the connections to external silos (Notion, Sheets, etc.)
 */
export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // 'notion', 'google-sheets', etc.
  label: text("label").notNull(),
  connectionId: text("connection_id").notNull(), // The Nango Connection ID
  config: jsonb("config").$type<{
    databaseId?: string;
    spreadsheetId?: string;
    [key: string]: any;
  }>(),
  dynamicSchema: jsonb("dynamic_schema").$type<FieldSchema[]>(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * RECORDS TABLE
 * Stores the "Universal Atoms" (Agnostic Data)
 */
export const records = pgTable("records", {
  id: uuid("id").primaryKey().defaultRandom(),
  integrationId: uuid("integration_id").references(() => integrations.id),
  externalId: text("external_id").notNull(), // Original ID in the silo
  data: jsonb("data").notNull(), // The actual "flattened" fields
  metadata: jsonb("metadata").$type<{
    source: string;
    syncedAt: string;
    [key: string]: any;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * INGESTION PORTS TABLE
 * Public upload endpoints. Each port maps to an integration + target path.
 * Third-parties reach a port via /p/[slug] — no Indra account required.
 */
export interface PortConfig {
  /** Path-template with field + metadata placeholders, e.g. "/{project}/{capture_date}" */
  pattern?: string;
  maxFileSizeBytes?: number;
  allowedMimeTypes?: string[];
}

/** Extends FieldSchema with an optional SME metadata key binding */
export interface PortFieldSchema extends FieldSchema {
  /** Maps to a SME metadata path, e.g. "exif.capturedAt" or "video.creationTimeUtc" */
  mapToMetadata?: string;
}

export const ingestionPorts = pgTable("ingestion_ports", {
  id: uuid("id").primaryKey().defaultRandom(),
  integrationId: uuid("integration_id").references(() => integrations.id).notNull(),
  /** Destination folder/bucket/database ID inside the integration */
  targetPath: text("target_path").notNull(),
  config: jsonb("config").$type<PortConfig>(),
  /** Dynamic form fields shown to uploaders */
  schema: jsonb("schema").$type<PortFieldSchema[]>(),
  /** URL-safe unique identifier: /p/[slug] */
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * JOBS TABLE
 * Stores the status of Peristaltic Syncs (Inngest tracking)
 */
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // 'sync', 'migrate', 'transform'
  status: text("status").notNull().default("pending"), // 'pending', 'running', 'completed', 'failed'
  payload: jsonb("payload"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
