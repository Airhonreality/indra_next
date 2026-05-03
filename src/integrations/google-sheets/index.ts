import { registry } from '@/core/registry';
import { SheetsAdapter } from './adapter';
import { makeSheetsClient } from '@/lib/authorized-client';

registry.register('google-sheets', (context: { connectionId: string; sheetName?: string }) => {
  const client = makeSheetsClient(context.connectionId);
  return new SheetsAdapter(client, context.sheetName);
});
