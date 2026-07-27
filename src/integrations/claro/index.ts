import { registry } from '@/core/registry';
import { ClaroAdapter } from './adapter';

const DEFAULT_BASE_URL = process.env.CLARO_DRIVE_BASE_URL ?? 'https://www.clarodrive.com';

registry.registerAdapter('claro', (context?: { baseUrl?: string; username?: string; password?: string }) => {
  return new ClaroAdapter({
    baseUrl: context?.baseUrl ?? DEFAULT_BASE_URL,
    username: context?.username ?? '',
    password: context?.password ?? '',
  });
}, ClaroAdapter.meta);

