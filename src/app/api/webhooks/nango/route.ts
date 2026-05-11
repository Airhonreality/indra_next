import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * 📡 NANGO WEBHOOK HANDLER
 * Canonical Reconciliation Pattern (as per Engineering Manual v2)
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log('📡 [Nango Webhook]:', payload);

    // Operation: auth.creation or auth.override
    if (payload.type === 'auth' && (payload.operation === 'creation' || payload.operation === 'override')) {
      const connectionId = payload.connectionId;
      const userId = payload.tags?.end_user_id;
      const providerConfigKey = payload.providerConfigKey;

      if (!userId || !connectionId || !providerConfigKey) {
        return NextResponse.json({ error: 'Missing identity data' }, { status: 400 });
      }

      // Reconcile with Indra Database
      const existing = await db.select()
        .from(integrations)
        .where(
          and(
            eq(integrations.userId, userId),
            eq(integrations.type, providerConfigKey)
          )
        );

      if (existing.length > 0) {
        // Update existing record with the new connectionId from Nango
        await db.update(integrations)
          .set({ 
            connectionId, 
            isActive: true,
            updatedAt: new Date()
          })
          .where(eq(integrations.id, existing[0].id));
        console.log(`✅ [Reconciled]: Connection ${connectionId} for User ${userId}`);
      } else {
        // Create new if not exist (optional, usually handled by frontend too)
        await db.insert(integrations).values({
          userId,
          type: providerConfigKey,
          label: `${providerConfigKey.toUpperCase()} (Synced)`,
          connectionId,
          isActive: true
        });
        console.log(`✅ [Created]: New connection ${connectionId} for User ${userId}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('❌ [Webhook Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
