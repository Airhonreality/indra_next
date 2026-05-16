/**
 * 🧩 ARTEFACTO: registry.ts
 * ────────────
 * CAPA: Core / Orchestration (Universal Capability Registry)
 * VERSIÓN: 2.0.0
 * COMMIT: P3-M9.2-UNIVERSAL-BLOCK-REGISTRY
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Inventario centralizado de adaptadores (Infrastructure) y bloques (UI).
 * - Resolución dinámica de capacidades mediante Inyección de Dependencias.
 * - Desacoplamiento total entre la lógica de negocio y la proyección visual.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Ser la única fuente de verdad para el descubrimiento de capacidades.
 * - NEVER: Almacenar estado mutable; el registro es un catálogo estático/fijo.
 * - ALWAYS: Usar carga perezosa (factories) para evitar hinchazón del bundle.
 * 
 * 📜 ADR: [2026-05-14] UNIFIED_CAPABILITY_DISCOVERY
 * - DECISIÓN: Evolucionar el registro de adaptadores hacia un Registro Universal que incluya Bloques de UI (Agnostic Blocks).
 * - MOTIVO: Permitir que Indra proyecte capacidades (como Ingesta o Visualización) de forma dinámica basada en el manifiesto del proyecto.
 * - IMPACTO: Arquitectura 100% agnóstica donde la UI es una consecuencia de la capacidad registrada.
 * 
 * 🔗 RELATIONSHIPS:
 * - UPSTREAM: [IntegrationAdapter, AgnosticBlocks]
 * - DOWNSTREAM: [DynamicRenderer, LayoutOrchestrator]
 */

import type { IntegrationAdapter } from '@/core/types/integration';

type AdapterFactory<C = unknown> = (context: C) => IntegrationAdapter;
type BlockFactory<P = any> = () => Promise<React.ComponentType<P>>;

class UniversalRegistry {
  private readonly adapterFactories = new Map<string, AdapterFactory>();
  private readonly blockFactories = new Map<string, BlockFactory>();

  /**
   * 🏗️ ADAPTER REGISTRATION (Infrastructure Layer)
   */
  registerAdapter<C>(id: string, factory: AdapterFactory<C>): void {
    this.adapterFactories.set(id, factory as AdapterFactory);
  }

  resolveAdapter<C = unknown>(id: string, context?: C): IntegrationAdapter {
    const factory = this.adapterFactories.get(id);
    if (!factory) throw new Error(`Adapter '${id}' not found in Universal Registry.`);
    return factory(context);
  }

  /**
   * 🎨 BLOCK REGISTRATION (UI/Projection Layer)
   */
  registerBlock<P>(id: string, factory: BlockFactory<P>): void {
    this.blockFactories.set(id, factory as BlockFactory);
  }

  async resolveBlock<P = any>(id: string): Promise<React.ComponentType<P>> {
    const factory = this.blockFactories.get(id);
    if (!factory) throw new Error(`Block '${id}' not found in Universal Registry.`);
    return await factory();
  }

  listCapabilities(): { adapters: string[], blocks: string[] } {
    return {
      adapters: [...this.adapterFactories.keys()],
      blocks: [...this.blockFactories.keys()]
    };
  }
}

export const registry = new UniversalRegistry();

/**
 * 🛰️ CAPABILITY BOOTSTRAP: Registering Agnostic Blocks
 */
registry.registerBlock('INGESTION_SOVEREIGN', async () => {
  const { SovereignIngestor } = await import('@/components/ingestion/sovereign-ingestor');
  return SovereignIngestor;
});

registry.registerBlock('INGESTION_HISTORY', async () => {
  // En el futuro, este será un bloque dedicado
  const { SovereignIngestor } = await import('@/components/ingestion/sovereign-ingestor');
  return SovereignIngestor; 
});
