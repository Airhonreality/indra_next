import { registry } from '@/core/registry';
import { GoogleDriveAdapter } from './adapter';

registry.register('google-drive', (connectionId: string) => {
  return new GoogleDriveAdapter(connectionId);
});
