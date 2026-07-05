import { describe, expect, it } from 'vitest';
import { CapabilityManifestSchema, auditManifestCoherence } from '@/core/types/capabilities';
import { GoogleDriveAdapter } from '@/integrations/google-drive/adapter';
import { SheetsAdapter } from '@/integrations/google-sheets/adapter';
import { NotionAdapter } from '@/integrations/notion/adapter';
import { StorageAdapter } from '@/integrations/storage/adapter';
import { MegaAdapter } from '@/integrations/mega/adapter';
import { YouTubeAdapter } from '@/integrations/youtube/adapter';
import { OneDriveAdapter } from '@/integrations/onedrive/adapter';
import { StorageUnion } from '@/integrations/storage-union';

const mockClient = {
  get: async () => ({}),
  post: async () => ({}),
  patch: async () => ({}),
  request: async () => ({ data: {} }),
};

const adapters = [
  new GoogleDriveAdapter('test-connection'),
  new SheetsAdapter(mockClient as any),
  new NotionAdapter(mockClient as any),
  new StorageAdapter('C:\\tmp'),
  new MegaAdapter({ applicationKey: 'test-key' }),
  new YouTubeAdapter('test-connection'),
  new OneDriveAdapter('test-connection'),
  new StorageUnion([]),
];

describe('Storage adapter contract', () => {
  it.each(adapters)('%s exposes a coherent capability manifest', (adapter) => {
    const parsed = CapabilityManifestSchema.safeParse(adapter.capabilities);
    expect(parsed.success, `${adapter.id}: invalid capabilities manifest`).toBe(true);

    const violations = auditManifestCoherence(adapter as any);
    expect(violations, `${adapter.id}: ${violations.join('; ')}`).toEqual([]);

    expect(adapter.id, `${adapter.id}: id must be non-empty`).toBeTruthy();
    expect(adapter.label, `${adapter.id}: label must be non-empty`).toBeTruthy();
  });
});
