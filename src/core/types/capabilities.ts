import { z } from 'zod';

/**
 * CAPABILITY MANIFEST - declaración explícita de lo que un adaptador puede hacer.
 * La UI y los servicios NUNCA hacen duck-typing: leen este manifiesto.
 * Un publish-target (p. ej. YouTube) declara false en casi todo salvo canUpload/canPublish.
 */
export const CapabilityManifestSchema = z.object({
  canListInventory: z.boolean(),
  canDownload: z.boolean(),
  canStream: z.boolean(),
  canUpload: z.boolean(),
  canResumableUpload: z.boolean(),
  canDelete: z.boolean(),
  canRename: z.boolean(),
  canMove: z.boolean(),
  canThumbnail: z.boolean(),
  canQuota: z.boolean(),
  canPublish: z.boolean(),
});

export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

/** Item de inventario normalizado - frontera validada con Zod. */
export const InventoryItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(['folder', 'file', 'page', 'table']),
  rawMimeType: z.string().optional(),
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;

/**
 * Coherencia manifiesto -> implementación. Devuelve la lista de violaciones
 * (vacía = coherente). Es la base de la suite de contrato.
 */
export function auditManifestCoherence(
  adapter: { capabilities?: CapabilityManifest } & Record<string, unknown>
): string[] {
  const v: string[] = [];
  const caps = adapter.capabilities;
  if (!caps) return ['adapter no declara capabilities'];
  const parsed = CapabilityManifestSchema.safeParse(caps);
  if (!parsed.success) return ['capabilities no cumple el esquema Zod: ' + parsed.error.message];
  if (caps.canDownload && typeof adapter.downloadBlob !== 'function')
    v.push('canDownload=true pero downloadBlob no está implementado');
  if (caps.canStream && !caps.canDownload)
    v.push('canStream=true requiere canDownload=true');
  if (caps.canResumableUpload && typeof adapter.createResumableSession !== 'function')
    v.push('canResumableUpload=true pero createResumableSession no está implementado');
  if (caps.canQuota && typeof adapter.getSpace !== 'function')
    v.push('canQuota=true pero getSpace no está implementado');
  return v;
}
