import { db } from '../lib/db';
import { ingestionPorts } from '../core/db/schema';
import { isNull, eq } from 'drizzle-orm';

/**
 * MIGRACIÓN SOBERANA
 * Asocia todos los proyectos que no tienen userId al usuario proporcionado.
 */
export async function migrateGhostProjects(targetUserId: string) {
  console.log(`[Migration] Starting adoption of ghost projects for user: ${targetUserId}`);
  
  const result = await db
    .update(ingestionPorts)
    .set({ userId: targetUserId })
    .where(isNull(ingestionPorts.userId))
    .returning();
    
  console.log(`[Migration] Successfully adopted ${result.length} ghost projects.`);
  return result;
}
