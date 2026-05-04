'use server';

import { db } from '@/lib/db';
import { ingestionPorts } from '@/core/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { PortConfig, PortFieldSchema } from '@/core/db/schema';

export async function getIngestionPorts() {
  return await db.select().from(ingestionPorts).orderBy(ingestionPorts.createdAt);
}

export async function createIngestionPort(data: {
  label: string;
  slug: string;
  integrationId: string;
  targetPath: string;
  config: PortConfig;
  schema: PortFieldSchema[];
}) {
  const [newPort] = await db.insert(ingestionPorts).values({
    ...data,
    isActive: true,
  }).returning();

  revalidatePath('/dashboard/ports');
  return newPort;
}

export async function updateIngestionPort(id: string, data: Partial<{
  label: string;
  slug: string;
  targetPath: string;
  config: PortConfig;
  schema: PortFieldSchema[];
  isActive: boolean;
}>) {
  const [updated] = await db
    .update(ingestionPorts)
    .set(data)
    .where(eq(ingestionPorts.id, id))
    .returning();

  revalidatePath('/dashboard/ports');
  return updated;
}

export async function deleteIngestionPort(id: string) {
  await db.delete(ingestionPorts).where(eq(ingestionPorts.id, id));
  revalidatePath('/dashboard/ports');
}
