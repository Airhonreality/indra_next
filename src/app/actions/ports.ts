'use server';

import { db } from '@/lib/db';
import { ingestionPorts } from '@/core/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { PortConfig, PortFieldSchema } from '@/core/db/schema';
import { auth } from "@/auth";
import { RoutingService } from '@/core/services/routing';

export async function getIngestionPorts() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  return await db
    .select()
    .from(ingestionPorts)
    .where(eq(ingestionPorts.userId, session.user.id))
    .orderBy(ingestionPorts.createdAt);
}

export async function createIngestionPort(data: {
  label: string;
  slug: string;
  integrationId: string;
  targetPath: string;
  config: PortConfig;
  schema: PortFieldSchema[];
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  // ENFORCE AXIOMATIC NAMING (Intelligence Decoupled)
  let finalSlug = data.slug;
  if (!RoutingService.isValidSlug(data.slug)) {
    finalSlug = RoutingService.generateSlug(data.label || 'port');
  }

  const [newPort] = await db.insert(ingestionPorts).values({
    ...data,
    slug: finalSlug,
    userId: session.user.id,
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
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const [updated] = await db
    .update(ingestionPorts)
    .set(data)
    .where(and(eq(ingestionPorts.id, id), eq(ingestionPorts.userId, session.user.id)))
    .returning();

  revalidatePath('/dashboard/ports');
  return updated;
}

export async function deleteIngestionPort(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  await db
    .delete(ingestionPorts)
    .where(and(eq(ingestionPorts.id, id), eq(ingestionPorts.userId, session.user.id)));
    
  revalidatePath('/dashboard/ports');
}
export async function rescueGhostProjects() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const result = await db
    .update(ingestionPorts)
    .set({ userId: session.user.id })
    .where(isNull(ingestionPorts.userId))
    .returning();
    
  revalidatePath('/dashboard/ports');
  return result.length;
}
