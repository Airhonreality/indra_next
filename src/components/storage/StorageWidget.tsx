import { auth } from '@/auth';
import { db } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { integrations, storageConnections } from '@/core/db/schema';
import { StorageWidgetClient } from './StorageWidgetClient';
import type { StorageConnectionDescriptor } from './storage-types';

type IntegrationRow = typeof integrations.$inferSelect;
type StorageRow = typeof storageConnections.$inferSelect;

function toIntegrationConnection(row: IntegrationRow): StorageConnectionDescriptor {
  return {
    id: row.id,
    type: row.type,
    label: row.label || row.type,
    connectionId: row.connectionId || row.id,
    isActive: row.isActive,
    source: 'integration',
    config: row.config ?? null,
  };
}

function toStorageConnection(row: StorageRow): StorageConnectionDescriptor {
  return {
    id: row.id,
    type: row.provider,
    label: row.label,
    connectionId: row.id,
    isActive: row.isActive,
    source: 'storage',
    config: row.config ?? null,
  };
}

/**
 * Storage widget server component.
 * Resolves all active connections, including dedicated storage accounts, and
 * forwards a traceable list to the client shell.
 */
export async function StorageWidget() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="p-8 border border-border/40 rounded-2xl bg-background/30 backdrop-blur-md text-center space-y-2 animate-in fade-in duration-300">
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          Acceso Restringido
        </p>
        <p className="text-xs text-zinc-500">
          Inicia sesion con tu cuenta para acceder al almacenamiento virtual.
        </p>
      </div>
    );
  }

  const [activeIntegrations, activeStorageConnections] = await Promise.all([
    db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.userId, session.user.id),
          eq(integrations.isActive, true)
        )
      ),
    db
      .select()
      .from(storageConnections)
      .where(
        and(
          eq(storageConnections.userId, session.user.id),
          eq(storageConnections.isActive, true)
        )
      ),
  ]);

  const connections: StorageConnectionDescriptor[] = [
    ...activeIntegrations.map(toIntegrationConnection),
    ...activeStorageConnections.map(toStorageConnection),
  ].sort(compareConnections);

  return (
    <StorageWidgetClient
      userId={session.user.id}
      connections={connections}
    />
  );
}

export default StorageWidget;

function compareConnections(a: StorageConnectionDescriptor, b: StorageConnectionDescriptor) {
  return a.type.localeCompare(b.type) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
}
