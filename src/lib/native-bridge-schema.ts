/**
 * Native Bridge Validation Schemas
 *
 * Zod schemas for validating native bridge types.
 * Used to ensure daemon responses and events conform to contract.
 */

import { z } from 'zod';

/**
 * Schema for NativeBridgeStatus responses.
 * Validates the shape returned by GET /api/desktop/bridge
 */
export const NativeBridgeStatusSchema = z.object({
  capability: z.enum(['cfapi-windows', 'fuse-linux', 'none']),
  isRunning: z.boolean(),
  lastCheck: z.string().datetime(),
  rootPath: z.string(),
  syncStatus: z.enum(['idle', 'syncing', 'error']),
  errorMessage: z.string().optional(),
  message: z.string().optional(),
});

export type NativeBridgeStatusParsed = z.infer<typeof NativeBridgeStatusSchema>;

/**
 * Schema for NativeBridgeSyncEvent payloads.
 * Validates events from daemon sync stream.
 */
export const NativeBridgeSyncEventSchema = z.object({
  type: z.enum(['file-downloaded', 'file-uploaded', 'file-deleted', 'sync-complete', 'error']),
  timestamp: z.string().datetime(),
  filePath: z.string(),
  provider: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
  errorMessage: z.string().optional(),
});

export type NativeBridgeSyncEventParsed = z.infer<typeof NativeBridgeSyncEventSchema>;

/**
 * Parse and validate a status response.
 * @throws ZodError if validation fails
 */
export function parseNativeBridgeStatus(raw: unknown): NativeBridgeStatusParsed {
  return NativeBridgeStatusSchema.parse(raw);
}

/**
 * Parse and validate a sync event.
 * @throws ZodError if validation fails
 */
export function parseNativeBridgeSyncEvent(raw: unknown): NativeBridgeSyncEventParsed {
  return NativeBridgeSyncEventSchema.parse(raw);
}

/**
 * Safe parse: returns { success: true, data } or { success: false, error }
 */
export function tryParseNativeBridgeStatus(raw: unknown) {
  return NativeBridgeStatusSchema.safeParse(raw);
}

/**
 * Safe parse: returns { success: true, data } or { success: false, error }
 */
export function tryParseNativeBridgeSyncEvent(raw: unknown) {
  return NativeBridgeSyncEventSchema.safeParse(raw);
}
