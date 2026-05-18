export type ConfigRequirement = 'oauth' | 'local_path' | 'api_key';
export type Capability = 'file_upload' | 'database_sync' | 'webhook_events';

export interface ProviderConfig {
  unique_key: string;
  provider: string;
}

export interface Connection {
  id: string;
  type: string;
  label: string;
  isConnected: boolean;
  dynamicSchema?: any[]; // Replaced FieldSchema for simplicity here, can be imported if needed
}

export interface ProviderManifest {
  id: string;
  label: string;
  icon: string;
  description: string;
  capabilities: Capability[];
  configType: ConfigRequirement;
}

export interface ConnectionMetrics {
  totalAdapters: number;
  configuredNango: number;
  coverage: number;
}

/** Pure selector — compute KPIs from the raw providers list. Zero side effects. */
export function computeMetrics(availableProviders: ProviderConfig[]): ConnectionMetrics {
  const translatedCount = availableProviders.filter((p) =>
    INDRA_ADAPTERS.some((a) => a.id === p.provider)
  ).length;
  return {
    totalAdapters: INDRA_ADAPTERS.length,
    configuredNango: availableProviders.length,
    coverage:
      availableProviders.length > 0
        ? Math.round((translatedCount / availableProviders.length) * 100)
        : 0,
  };
}

export const INDRA_ADAPTERS: ProviderManifest[] = [
  {
    id: 'notion',
    label: 'Notion',
    icon: 'Database',
    description: 'Sincronización bidireccional y persistencia de bases de datos y páginas estructuradas.',
    capabilities: ['database_sync'],
    configType: 'oauth'
  }
];
