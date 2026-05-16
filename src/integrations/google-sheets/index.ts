import { registry } from '@/core/registry';
import { SheetsAdapter } from './adapter';
import { makeSheetsClient } from '@/lib/authorized-client';

registry.registerAdapter('google-sheets', (context: any) => {
  const connectionId = typeof context === 'string' ? context : context.connectionId;
  const sheetName = typeof context === 'string' ? undefined : context.sheetName;
  const client = makeSheetsClient(connectionId);
  return new SheetsAdapter(client, sheetName);
});
