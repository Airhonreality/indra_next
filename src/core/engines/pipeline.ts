import type { IntegrationAdapter, Transformer } from '@/core/types/integration';
import type { ActionResult } from '@/core/types/action';

export interface PipelineOptions {
  /** Limit number of records fetched from source. 0 = all. */
  limit?: number;
  /** If true, reads records but does not write to target. */
  dryRun?: boolean;
  /** Optional field-mapping transformer applied to each record. */
  transformer?: Transformer;
  /** Passed through to getRecords as filter */
  filter?: object;
  /** Passed through to getRecords as sort */
  sort?: { field: string; direction: 'asc' | 'desc' }[];
}

export class DataPipeline {
  /**
   * Move records from sourceAdapter → targetAdapter.
   * The engine does not know which silos it is connecting — only the IntegrationAdapter interface.
   */
  async run(
    sourceAdapter: IntegrationAdapter,
    targetAdapter: IntegrationAdapter,
    sourceId: string,
    targetId: string,
    options: PipelineOptions = {}
  ): Promise<ActionResult> {
    const start = Date.now();
    const errors: string[] = [];

    // 1. Read from source
    const readResult = await sourceAdapter.getRecords(sourceId, {
      limit: options.limit,
      filter: options.filter,
      sort: options.sort,
    });

    if (!readResult.ok) {
      return {
        ok: false,
        summary: `Source read failed: ${readResult.error}`,
        details: { recordsRead: 0, recordsWritten: 0, recordsFailed: 0, elapsedMs: Date.now() - start, errors: [readResult.error!] },
      };
    }

    let records = readResult.data;
    const recordsRead = records.length;

    // 2. Transform
    if (options.transformer) {
      const transformed = [];
      for (const record of records) {
        const result = options.transformer.transform(record);
        if (result !== null) transformed.push(result);
      }
      records = transformed;
    }

    // 3. Write to target (skip if dryRun)
    let recordsWritten = 0, recordsFailed = 0;

    if (!options.dryRun && records.length > 0) {
      const writeResult = await targetAdapter.pushRecords(targetId, records);
      if (!writeResult.ok) {
        errors.push(writeResult.error!);
        recordsFailed = records.length;
      } else {
        recordsWritten = writeResult.data.created + writeResult.data.updated;
        recordsFailed = writeResult.data.failed;
      }
    } else if (options.dryRun) {
      recordsWritten = records.length; // simulate
    }

    const elapsedMs = Date.now() - start;
    const mode = options.dryRun ? ' [DRY RUN]' : '';
    const summary = `${recordsRead} read, ${recordsWritten} written, ${recordsFailed} failed in ${elapsedMs}ms${mode}`;

    return {
      ok: recordsFailed === 0 && errors.length === 0,
      summary,
      details: { recordsRead, recordsWritten, recordsFailed, elapsedMs, errors: errors.length ? errors : undefined },
    };
  }
}
