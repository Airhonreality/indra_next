'use client';

/**
 * ARTEFACTO: ExplorerPanel.tsx
 * CAPA: UI / Features (Explorer Tab)
 *
 * FUNCTIONAL_SCOPE:
 * - Tab del explorador de silos auto-hidratado via useConnections().
 * - El shell no necesita saber nada de conexiones para renderizar este panel.
 */

import { Loader2 } from 'lucide-react';
import { useConnections } from '@/hooks/use-connections';
import { useIndraStore } from '@/stores/indra-store';
import { StorageWidgetClient } from '@/components/storage/StorageWidgetClient';
import type { StorageConnectionDescriptor } from '@/components/storage/storage-types';

export function ExplorerPanel() {
  const { activeConnections, isLoading } = useConnections();
  const userId = useIndraStore((state) => state.userId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground opacity-30" />
      </div>
    );
  }

  const connections = [...activeConnections]
    .filter((connection) => Boolean(connection.id))
    .map((connection) => createConnectionDescriptor(connection))
    .sort(compareConnectionDescriptors);

  return (
    <div className="w-full">
      <StorageWidgetClient userId={userId ?? ''} connections={connections} />
    </div>
  );
}

function createConnectionDescriptor(connection: {
  id: string;
  type: string;
  label: string;
  config?: {
    email?: string;
    bucket?: string;
    username?: string;
    baseUrl?: string;
  };
}): StorageConnectionDescriptor {
  return {
    id: connection.id,
    type: connection.type,
    label: buildConnectionLabel(connection),
    connectionId: connection.id,
    source: 'integration',
    config: connection.config ?? null,
  };
}

function buildConnectionLabel(connection: {
  type: string;
  label: string;
  config?: {
    email?: string;
    bucket?: string;
    username?: string;
    baseUrl?: string;
  };
}) {
  if (connection.label?.trim()) {
    return connection.label.trim();
  }

  if (connection.type === 'mega') {
    return connection.config?.email ? `MEGA [${connection.config.email}]` : 'MEGA';
  }

  if (connection.type === 'claro') {
    const username = connection.config?.username || 'cuenta';
    const baseUrl = connection.config?.baseUrl || 'https://www.clarodrive.com';
    return `Claro Drive [${username}] @ ${baseUrl}`;
  }

  if (connection.type === 's3') {
    const bucket = connection.config?.bucket || 'bucket';
    return `Cloudflare R2 [${bucket}]`;
  }

  return connection.type;
}

function compareConnectionDescriptors(a: StorageConnectionDescriptor, b: StorageConnectionDescriptor) {
  return a.type.localeCompare(b.type) || a.label.localeCompare(b.label) || (a.connectionId ?? a.id).localeCompare(b.connectionId ?? b.id);
}
