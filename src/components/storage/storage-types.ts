export type StorageConnectionSource = 'integration' | 'storage';

export interface StorageConnectionDescriptor {
  id: string;
  type: string;
  label: string;
  connectionId?: string | null;
  isActive?: boolean | null;
  source?: StorageConnectionSource;
  provider?: string;
  detail?: string;
  config?: {
    email?: string;
    bucket?: string;
    baseUrl?: string;
    username?: string;
    basePath?: string;
    [key: string]: unknown;
  } | null;
}
