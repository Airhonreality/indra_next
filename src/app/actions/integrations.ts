'use server';

import { db } from '@/lib/db';
import { integrations } from '@/core/db/schema';
import { eq } from 'drizzle-orm';

export async function getActiveIntegrations() {
  return await db
    .select({
      id: integrations.id,
      label: integrations.label,
      type: integrations.type,
    })
    .from(integrations)
    .where(eq(integrations.isActive, true));
}
