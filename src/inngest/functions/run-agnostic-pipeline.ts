// Side-effect: register all adapters before pipeline runs
import '@/integrations/notion/index';
import '@/integrations/google-sheets/index';
import '@/integrations/storage/index';

import { inngest } from '@/lib/inngest';
import { registry } from '@/core/registry';
import { DataPipeline } from '@/core/engines/pipeline';
import { makeFieldMapTransformer } from '@/core/types/integration';

/**
 * Durable Inngest workflow: move data between any two registered adapters.
 *
 * Event payload shape:
 * {
 *   source: { integration: 'notion', connectionId: '...', id: 'db-id', context?: {} }
 *   target: { integration: 'storage', connectionId?: '...', id: 'output.json', context?: {} }
 *   options?: { fieldMap?, limit?, dryRun? }
 * }
 */
export const runAgnosticPipeline = inngest.createFunction(
  { id: 'run-agnostic-pipeline', name: 'Run Agnostic Pipeline', triggers: [{ event: 'indra/pipeline.run' }] },
  async ({ event, step }: { event: any; step: any }) => {
    const { source, target, options = {} } = event.data as {
      source: { integration: string; connectionId?: string; id: string; context?: Record<string, any> };
      target: { integration: string; connectionId?: string; id: string; context?: Record<string, any> };
      options?: { fieldMap?: Record<string, string>; limit?: number; dryRun?: boolean };
    };

    const result = await step.run('execute-pipeline', async () => {
      const sourceContext = { connectionId: source.connectionId, ...source.context };
      const targetContext = { connectionId: target.connectionId, ...target.context };

      const sourceAdapter = registry.resolveAdapter(source.integration, sourceContext);
      const targetAdapter = registry.resolveAdapter(target.integration, targetContext);

      const transformer = options.fieldMap
        ? makeFieldMapTransformer(options.fieldMap)
        : undefined;

      const pipeline = new DataPipeline();
      return pipeline.run(sourceAdapter, targetAdapter, source.id, target.id, {
        limit: options.limit,
        dryRun: options.dryRun,
        transformer,
      });
    });

    return result;
  }
);
