import { registry } from '@/core/registry';
import { MegaAdapter } from './adapter';
import { MegaCredentials } from '@/core/types/integration';

registry.registerAdapter('mega', (context: MegaCredentials) => {
  return new MegaAdapter(context);
}, MegaAdapter.meta);
