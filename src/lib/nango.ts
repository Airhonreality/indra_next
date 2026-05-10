/**
 * 📡 ARTEFACTO: nango.ts
 * ────────────
 * CAPA: Lib / Infrastructure (The Muscle)
 * VERSIÓN: 1.0.0
 * COMMIT: P2-M1.0-INFRA-NANGO-BRIDGE
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Puente de bajo nivel con la infraestructura de Nango.hq.
 * - Gestión de secretos de entorno y configuración del cliente Node.js.
 * - Proxying de peticiones autorizadas hacia silos externos.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Usar variables de entorno para el Secret Key. Nunca commitear claves reales.
 * - NEVER: Invocar 'callSiloProxy' directamente desde el cliente sin validación previa de sesión/permisos en el servidor.
 * - NEVER: Permitir que el 'providerConfigKey' sea inyectado arbitrariamente desde el frontend.
 * - ALWAYS: Tratar los errores de Nango como fallos críticos de infraestructura.
 * 
 * 📜 ADR: [2026-05-01] NANGO_FOR_OAUTH_RESILIENCE
 * - DECISIÓN: Delegar la complejidad de OAuth y refresco de tokens a Nango para centrar el core en orquestación.
 * - IMPACTO: Eliminación de la lógica de 'Token Refresh' dentro del repositorio.
 * 
 * 🔑 KEYWORDS: #Nango #OAuth #Proxy #Infrastructure #SiloConnection
 * 🔗 RELATIONSHIPS: [AuthorizedClient, IntegrationsTable, NextAuth]
 */

import { Nango } from '@nangohq/node';
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
