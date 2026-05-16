import { registry } from '@/core/registry';
import { GoogleDriveAdapter } from './adapter';

registry.registerAdapter('google-drive', (connectionId: string) => {
  return new GoogleDriveAdapter(connectionId);
});
