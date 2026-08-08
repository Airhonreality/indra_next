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

import { pgTable, text, timestamp, jsonb, uuid, boolean, primaryKey, integer, unique } from "drizzle-orm/pg-core";
import { FieldSchema } from "@/core/types/integration";
import type { AdapterAccount } from "@auth/core/adapters";
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

/**
 * 📦 STORAGE CONNECTIONS
 * Dedicated table to persist storage settings and encrypted passwords
 */
export const storageConnections = pgTable("storage_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'mega', 'google-drive', 'notion'
  label: text("label").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  encryptedCredentials: text("encrypted_credentials"),
  config: jsonb("config").$type<{
    rootFolderId?: string;
    [key: string]: any;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * 📂 USER FILES (Inventory Cache)
 * Dedicated table to index directories and file metadata per user for lightning-fast lookups
 */
export const userFiles = pgTable("user_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").references(() => storageConnections.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(), // ID inside the upstream provider
  name: text("name").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"), // null for directories
  parentId: text("parent_id"), // Parent directory external ID
  path: text("path"), // Full visual folder path
  metadata: jsonb("metadata").$type<{
    megaHash?: string;
    [key: string]: any;
  }>(),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

/**
 * LOCAL SYNC SETTINGS
 * Stores the user's chosen target for local file sync (which storage provider to push to).
 * One row per user — tracks the provider chosen as destination for "sync local → cloud".
 */
export const localSyncSettings = pgTable("local_sync_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider"), // 'id' of the adapter chosen as target (e.g., 's3', 'mega', 'google-drive'), or null to disable
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * LOCAL SYNC STATE
 * Stores the record of which files have already been synced to the target provider.
 * Used to avoid re-uploading the same file on every Pull() — check by blake3Hash.
 * Unique by (userId, localPath) to prevent duplicate entries for the same file.
 */
export const localSyncState = pgTable(
  "local_sync_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // Same 'id' as in localSyncSettings.provider
    localPath: text("local_path").notNull(), // Full path of the file on the local machine
    blake3Hash: text("blake3_hash").notNull(), // BLAKE3 digest of the file (hex-encoded)
    remoteObjectId: text("remote_object_id"), // Optional: ID/path of the uploaded object in the target provider
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => ({
    // Enforced at the DB level (not just app-code check-then-insert) so concurrent
    // sync requests for the same file can't create duplicate rows.
    userPathUnique: unique("local_sync_state_user_path_unique").on(table.userId, table.localPath),
  })
);

/**
 * DEVICES
 * Stores paired devices linked to a user.
 * Each device has a unique token (hash of the secret, never stored in plaintext).
 * Used for daemon authentication and device identity in the cloud-bridge architecture.
 */
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  tokenHash: text("token_hash").notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * DEVICE PAIRING CODES
 * Short-lived, single-use codes for pairing a device.
 * Generated on the web (secured by user session), claimed by the daemon (headless, no session).
 * Expires in 10 minutes; marks consumed_at when successfully redeemed to prevent replay.
 */
export const devicePairingCodes = pgTable("device_pairing_codes", {
  code: text("code").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
});

