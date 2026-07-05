import { registry } from '@/core/registry';
import { S3Adapter, S3Credentials } from './adapter';

registry.registerAdapter('s3', (context: S3Credentials) => {
  return new S3Adapter(context);
}, S3Adapter.meta);
