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

export const INDRA_ADAPTERS: ProviderManifest[] = [
  {
    id: 'google-drive',
    label: 'Google Drive',
    icon: 'Cloud',
    description: 'Ingesta soberana de archivos multimedia y documentos desde Google Workspace.',
    capabilities: ['file_upload'],
    configType: 'oauth'
  },
  {
    id: 'notion',
    label: 'Notion',
    icon: 'Database',
    description: 'Sincronización bidireccional y persistencia de bases de datos y páginas estructuradas.',
    capabilities: ['database_sync'],
    configType: 'oauth'
  },
  {
    id: 'google-sheets',
    label: 'Google Sheets',
    icon: 'Table',
    description: 'Extracción tabular y sincronización de celdas de hojas de cálculo operativas.',
    capabilities: ['database_sync'],
    configType: 'oauth'
  },
  {
    id: 'storage',
    label: 'Local Storage',
    icon: 'HardDrive',
    description: 'Almacenamiento directo e implacable en los discos duros locales del servidor host.',
    capabilities: ['file_upload'],
    configType: 'local_path'
  },
  {
    id: 'json-file',
    label: 'JSON Data Vault',
    icon: 'FileJson',
    description: 'Bóveda de almacenamiento de estado en archivos JSON estructurados locales.',
    capabilities: ['database_sync'],
    configType: 'local_path'
  }
];
