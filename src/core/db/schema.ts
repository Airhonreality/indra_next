import { pgTable, text, timestamp, jsonb, uuid, boolean } from "drizzle-orm/pg-core";

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
