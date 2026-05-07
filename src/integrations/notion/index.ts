import { registry } from '@/core/registry';
import { NotionAdapter } from './adapter';
import { makeNotionClient } from '@/lib/authorized-client';

registry.register('notion', (context: any) => {
  const connectionId = typeof context === 'string' ? context : context.connectionId;
  const client = makeNotionClient(connectionId);
  return new NotionAdapter(client);
});
