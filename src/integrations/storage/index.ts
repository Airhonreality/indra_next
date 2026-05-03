import { registry } from '@/core/registry';
import { StorageAdapter } from './adapter';

const DEFAULT_BASE = process.env.STORAGE_BASE_PATH ?? './data';

registry.register('storage', (context?: { basePath?: string }) => {
  return new StorageAdapter(context?.basePath ?? DEFAULT_BASE);
});
