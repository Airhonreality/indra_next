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
