import { registry } from '@/core/registry';
import { OneDriveAdapter } from './adapter';

registry.registerAdapter('onedrive', (connectionId: string) => {
  return new OneDriveAdapter(connectionId);
}, OneDriveAdapter.meta);
