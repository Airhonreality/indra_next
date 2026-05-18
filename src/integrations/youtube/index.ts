import { registry } from '@/core/registry';
import { YouTubeAdapter } from './adapter';

registry.registerAdapter('youtube', (connectionId: string) => {
  return new YouTubeAdapter(connectionId);
}, YouTubeAdapter.meta);
