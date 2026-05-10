/**
 * 🧩 ARTEFACTO: registry.ts
 * ────────────
 * CAPA: Core / Orchestration (Inventory of Capabilities)
 * VERSIÓN: 1.0.1
 * COMMIT: P2-M3.2-ADR-REGISTRY-PATTERN
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Inventario centralizado de fábricas de adaptadores de integración.
 * - Resolución dinámica de capacidades en tiempo de ejecución (Dependency Injection).
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Validar que el ID del adaptador sea único en el registro global.
 * - NEVER: Importar manualmente los archivos de adaptadores dentro de este archivo (evita Circular Dependencies).
 * - NEVER: Almacenar instancias pesadas; solo registrar 'factories' (funciones perezosas).
 * - ALWAYS: Lanzar errores descriptivos con la lista de adaptadores disponibles en caso de fallo de resolución.
 * 
 * 📜 ADR: [2026-05-06] LAZY_ADAPTER_REGISTRATION
 * - DECISIÓN: Usar un patrón Registry con funciones Factory para evitar cargar todos los adaptadores en memoria al inicio.
 * - IMPACTO: Reducción drástica del bundle size y tiempo de arranque del servidor.
 * 
 * 🔑 KEYWORDS: #AdapterRegistry #DependencyInjection #Orchestration #LazyLoading
 * 🔗 RELATIONSHIPS: [IntegrationAdapter, AuthorizedClient, Actions_Records]
 */

import type { IntegrationAdapter } from '@/core/types/integration';

type AdapterFactory<C = unknown> = (context: C) => IntegrationAdapter;

class AdapterRegistry {
  private readonly factories = new Map<string, AdapterFactory>();

  register<C>(id: string, factory: AdapterFactory<C>): void {
    this.factories.set(id, factory as AdapterFactory);
  }

  resolve<C = unknown>(id: string, context?: C): IntegrationAdapter {
    const factory = this.factories.get(id);
    if (!factory) {
      const available = [...this.factories.keys()].join(', ') || '(none)';
      throw new Error(`Adapter '${id}' is not registered. Available: ${available}`);
    }
    return factory(context);
  }

  list(): string[] {
    return [...this.factories.keys()];
  }
}

export const registry = new AdapterRegistry();
