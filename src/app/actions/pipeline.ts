'use server';

// Side-effect: register all adapters
import '@/integrations/notion/index';
import '@/integrations/google-sheets/index';
import '@/integrations/storage/index';

import { inngest } from '@/lib/inngest';
import { registry } from '@/core/registry';

export interface IntegrationRef {
  integration: string;
  connectionId?: string;
  id: string;
  context?: Record<string, unknown>;
}

export interface PipelineJobResult {
  jobId: string;
}

/**
 * ABSOLUTE RULE: Every pipeline execution fires via Inngest.
 * No synchronous data movement. Returns jobId immediately.
 */
export async function executePipeline(
  source: IntegrationRef,
  target: IntegrationRef,
  options?: {
    fieldMap?: Record<string, string>;
    limit?: number;
    dryRun?: boolean;
  }
): Promise<PipelineJobResult> {
  const jobId = `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await inngest.send({
    id: jobId,
    name: 'indra/pipeline.run',
    data: { source, target, options: options ?? {} },
  });

  return { jobId };
}

/**
 * List all sources across all registered adapters.
 * Each integration config carries its connectionId / basePath.
 */
export type SourceItem = {
  id: string;
  label: string;
  type: 'database' | 'spreadsheet' | 'file' | 'folder';
  integration: string;
  connectionId?: string;
};

export async function listSources(
  integration: string,
  context: { connectionId?: string; basePath?: string } = {}
): Promise<SourceItem[]> {
  try {
    const adapter = registry.resolve(integration, context);
    const result = await adapter.listSources();
    if (!result.ok) return [];

    return result.data.map(s => ({
      ...s,
      integration,
      connectionId: context.connectionId,
    }));
  } catch {
    return [];
  }
}

export async function getSourceSchema(
  integration: string,
  sourceId: string,
  context: { connectionId?: string; basePath?: string } = {}
) {
  try {
    const adapter = registry.resolve(integration, context);
    const result = await adapter.getSchema(sourceId);
    const baseFields = result.ok ? result.data : [];

    // Si tenemos un connectionId, buscamos campos dinámicos en la DB
    if (context.connectionId) {
      const { db } = await import('@/lib/db');
      const { integrations } = await import('@/core/db/schema');
      const { eq } = await import('drizzle-orm');

      const config = await db.select()
        .from(integrations)
        .where(eq(integrations.connectionId, context.connectionId))
        .limit(1);

      if (config[0]?.dynamicSchema) {
        return [...baseFields, ...config[0].dynamicSchema];
      }
    }

    return baseFields;
  } catch (error) {
    console.error('Error fetching schema:', error);
    return [];
  }
}
