import { registry } from '@/core/registry';
import { NotionAdapter } from './adapter';
import { makeNotionClient } from '@/lib/authorized-client';

registry.register('notion', (context: { connectionId: string }) => {
  const client = makeNotionClient(context.connectionId);
  return new NotionAdapter(client);
});
