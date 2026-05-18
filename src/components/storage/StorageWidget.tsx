import { auth } from '@/auth';
import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq, and } from 'drizzle-orm';
import { StorageWidgetClient } from './StorageWidgetClient';

/**
 * 🏛️ STORAGE WIDGET (Server Component)
 * ──────────────────────────────────
 * Root component for the unified storage explorer dashboard.
 * Performs secure authentication check at the edge, queries the Drizzle ORM database
 * to fetch connection IDs securely, and passes client parameters safely down.
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
          Inicia sesión con tu cuenta de colectivo para acceder al almacenamiento virtual soberano.
        </p>
      </div>
    );
  }

  // Fetch active integrations for the authenticated user from the database
  const activeIntegrations = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.userId, session.user.id),
        eq(integrations.isActive, true)
      )
    );

  // Map to connectionIds: Record<string, string>
  const connectionIds: Record<string, string> = {};
  for (const integration of activeIntegrations) {
    if (integration.connectionId) {
      connectionIds[integration.type] = integration.connectionId;
    }
  }

  return (
    <StorageWidgetClient 
      userId={session.user.id}
      connectionIds={connectionIds} 
    />
  );
}

export default StorageWidget;
