import { GET as unionGET } from '@/app/api/storage/union/route';

export const dynamic = 'force-dynamic';

/**
 * 🔗 Proxy Route: delegates /api/integrations/storage-union/inventory GET requests
 * to the unified storage union handler (/api/storage/union).
 * This ensures that AgnosticTree with integrationId='storage-union' functions seamlessly.
 */
export async function GET(req: Request) {
  return unionGET(req);
}
