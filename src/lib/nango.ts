import { Nango } from '@nangohq/node';

/**
 * NANGO CLIENT
 * The "Muscle" of Indra NEXT.
 * Handles OAuth, Token Refresh, and API Proxying.
 */
export const nango = new Nango({
  secretKey: process.env.NANGO_SECRET_KEY || 'DUMMY_KEY_FOR_BUILD',
});

/**
 * Helper to call any Silo Proxy via Nango.
 * @param providerConfigKey The key defined in Nango (e.g. 'google-drive', 'notion')
 * @param connectionId The ID of the user's connection in Nango
 * @param endpoint The API endpoint
 */
export async function callSiloProxy(
  providerConfigKey: string,
  connectionId: string,
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' = 'GET',
  data?: any
) {
  return nango.proxy({
    method,
    endpoint,
    providerConfigKey,
    connectionId,
    data
  });
}
