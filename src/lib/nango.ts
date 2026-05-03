import { Nango } from '@nangohq/node';

/**
 * NANGO CLIENT
 * The "Muscle" of Indra NEXT.
 * Handles OAuth, Token Refresh, and API Proxying.
 */
export const nango = new Nango({
  secretKey: process.env.NANGO_SECRET_KEY!,
});

/**
 * Helper to call the Notion Proxy via Nango.
 * @param connectionId The ID of the user's connection in Nango
 * @param endpoint The Notion API endpoint (e.g., '/databases/{id}/query')
 */
export async function callNotionProxy(connectionId: string, endpoint: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', data?: any) {
  return nango.proxy({
    method,
    endpoint,
    providerConfigKey: 'notion', // Defined in your Nango dashboard
    connectionId,
    data
  });
}
