/**
 * 🧮 ARTEFACTO: schema.ts
 * ────────────
 * CAPA: Core / Persistence (Universal Contract)
 * VERSIÓN: 2.1.0-Agnostic
 * COMMIT: P2-M1.1-SCHEMA-UNIVERSAL-ATOM
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Definición de la ontología del sistema (Records, Integrations, Ports).
 * - Implementación del "Átomo Universal NEXT" para interoperabilidad total.
 * - Esquema de persistencia para flujos de autenticación y sincronización (Auth.js).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Mantener la tabla 'records' como un almacén agnóstico (Uso estricto de JSONB 'data').
 * - NEVER: Añadir columnas específicas para propiedades de integraciones externas (ej. 'notion_id').
 * - NEVER: Cambiar tipos de ID fuera de UUID v4 para mantener la unicidad global.
 * - ALWAYS: Garantizar que cada registro tenga un 'integrationId' válido para trazabilidad.
 * 
 * 📜 ADR: [2026-05-05] AGNOSTIC_DATA_PERSISTENCE
 * - DECISIÓN: Utilizar JSONB para campos dinámicos para evitar migraciones costosas al añadir adaptadores.
 * - IMPACTO: Flexibilidad absoluta en el esquema de datos de terceros.
 * 
 * 🔑 KEYWORDS: #AgnosticRecord #UniversalAtom #DrizzleORM #SovereignStorage #JSONB
 * 🔗 RELATIONSHIPS: [IntegrationAdapter, InngestJobs, PortDesigner]
 */

import { pgTable, text, timestamp, jsonb, uuid, boolean, primaryKey, integer } from "drizzle-orm/pg-core";
export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
 * AUTH.JS TABLES (Drizzle Adapter)
 */
export const users = pgTable("user", {
  id: text("id").notNull().primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").notNull().primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

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
