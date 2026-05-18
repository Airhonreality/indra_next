import { registry } from '@/core/registry';
import { StorageUnion } from './index';

// Register the StorageUnion meta-adapter for metadata lookup
registry.registerAdapter('storage-union', () => {
  return new StorageUnion([]);
}, StorageUnion.meta);
