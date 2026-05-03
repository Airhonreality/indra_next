import { BaseAdapter } from '@/integrations/shared/base-adapter';
import type { AuthorizedClient } from '@/lib/authorized-client';
import type { FieldSchema, OperationResult } from '@/core/types/integration';
import type { Record as IndraRecord } from '@/core/types/integration';

function slugify(str: string): string {
  return String(str).toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
}

export class NotionAdapter extends BaseAdapter {
  readonly id = 'notion';
  readonly label = 'Notion';

  constructor(private readonly client: AuthorizedClient) {
    super();
  }

  async testConnection(): Promise<OperationResult<boolean>> {
    try {
      await this.client.post('/search', { page_size: 1 });
      return this.result(true);
    } catch (e) {
      return this.error(`Notion connection failed: ${(e as Error).message}`);
    }
  }

  async listSources(): Promise<OperationResult<{ id: string; label: string; type: 'database' | 'spreadsheet' | 'file' | 'folder' }[]>> {
    try {
      const response = await this.client.post('/search', {
        filter: { value: 'database', property: 'object' },
        page_size: 100,
      });
      const sources = (response.results ?? []).map((db: any) => ({
        id: db.id as string,
        label: this.extractTitle(db.title) || 'Untitled',
        type: 'database' as const,
      }));
      return this.result(sources, { count: sources.length });
    } catch (e) {
      return this.error(`listSources failed: ${(e as Error).message}`);
    }
  }

  async getSchema(sourceId: string): Promise<OperationResult<FieldSchema[]>> {
    try {
      const db = await this.client.get(`/databases/${sourceId}`);
      return this.result(this.schemaToFields(db.properties ?? {}));
    } catch (e) {
      return this.error(`getSchema failed: ${(e as Error).message}`);
    }
  }

  async getRecords(sourceId: string, options?: {
    cursor?: string;
    limit?: number;
    filter?: object;
    sort?: { field: string; direction: 'asc' | 'desc' }[];
  }): Promise<OperationResult<IndraRecord[]>> {
    try {
      const dbMeta = await this.client.get(`/databases/${sourceId}`);
      const fields = this.schemaToFields(dbMeta.properties ?? {});

      let allRows: any[] = [];
      let hasMore = true;
      let cursor = options?.cursor;
      const limit = options?.limit ?? 0;

      while (hasMore) {
        const payload: any = { page_size: limit > 0 && limit < 100 ? limit : 100 };
        if (cursor) payload.start_cursor = cursor;
        if (options?.filter) payload.filter = options.filter;
        if (options?.sort?.length) {
          payload.sorts = options.sort.map(s => ({
            property: s.field,
            direction: s.direction === 'asc' ? 'ascending' : 'descending',
          }));
        }

        const page = await this.client.post(`/databases/${sourceId}/query`, payload);
        allRows = allRows.concat(page.results ?? []);
        hasMore = page.has_more && (limit === 0 || allRows.length < limit);
        cursor = page.next_cursor ?? undefined;

        if (limit > 0 && allRows.length >= limit) { allRows = allRows.slice(0, limit); break; }
        if (allRows.length > 10_000) break; // safety
      }

      const rawRecords = allRows.map(p => this.rowToRecord(p, sourceId));
      const relationFields = fields.filter(f => f.type === 'relation');
      const records = await this.resolveRelationNames(rawRecords, relationFields, 100);

      return this.result(records, { count: records.length, hasMore, cursor });
    } catch (e) {
      return this.error(`getRecords failed: ${(e as Error).message}`);
    }
  }

  async pushRecords(targetId: string, records: IndraRecord[]): Promise<OperationResult<{ created: number; updated: number; failed: number }>> {
    try {
      const dbMeta = await this.client.get(`/databases/${targetId}`);
      const schema = dbMeta.properties ?? {};

      const results = await Promise.allSettled(
        records.map(record => {
          const properties = this.fieldsToNotionProperties(record.fields, schema);
          if (record.metadata?.source === 'notion') {
            return this.client.patch(`/pages/${record.id}`, { properties });
          }
          return this.client.post('/pages', { parent: { database_id: targetId }, properties });
        })
      );

      let created = 0, updated = 0, failed = 0;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          records[i].metadata?.source === 'notion' ? updated++ : created++;
        } else {
          failed++;
        }
      });

      return this.result({ created, updated, failed });
    } catch (e) {
      return this.error(`pushRecords failed: ${(e as Error).message}`);
    }
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

  private rowToRecord(page: any, dbId: string): IndraRecord {
    return {
      id: page.id,
      fields: this.flattenProperties(page.properties ?? {}),
      metadata: {
        source: 'notion',
        sourceId: dbId,
        createdAt: page.created_time,
        updatedAt: page.last_edited_time,
      },
    };
  }

  private flattenProperties(properties: Record<string, any>): Record<string, any> {
    const flat: Record<string, any> = {};
    for (const key in properties) {
      const prop = properties[key];
      if (!prop || typeof prop !== 'object') { flat[key] = prop ?? null; continue; }
      const type = prop.type;
      switch (type) {
        case 'title':       flat[key] = prop.title?.[0]?.plain_text ?? ''; break;
        case 'rich_text':   flat[key] = prop.rich_text?.[0]?.plain_text ?? ''; break;
        case 'number':      flat[key] = prop.number ?? null; break;
        case 'select':      flat[key] = prop.select?.name ?? null; break;
        case 'status':      flat[key] = prop.status?.name ?? null; break;
        case 'multi_select': flat[key] = (prop.multi_select ?? []).map((o: any) => o.name); break;
        case 'date':        flat[key] = prop.date?.start ?? null; break;
        case 'checkbox':    flat[key] = Boolean(prop.checkbox); break;
        case 'url':         flat[key] = prop.url ?? null; break;
        case 'email':       flat[key] = prop.email ?? null; break;
        case 'phone_number': flat[key] = prop.phone_number ?? null; break;
        case 'relation':    flat[key] = (prop.relation ?? []).map((r: any) => r.id); break;
        case 'people':      flat[key] = (prop.people ?? []).map((p: any) => p.name ?? p.id); break;
        case 'files':       flat[key] = (prop.files ?? []).map((f: any) => f.file?.url ?? f.external?.url ?? null).filter(Boolean); break;
        case 'created_time': flat[key] = prop.created_time ?? null; break;
        case 'last_edited_time': flat[key] = prop.last_edited_time ?? null; break;
        case 'created_by':  flat[key] = prop.created_by?.name ?? prop.created_by?.id ?? null; break;
        case 'last_edited_by': flat[key] = prop.last_edited_by?.name ?? prop.last_edited_by?.id ?? null; break;
        case 'formula': {
          const f = prop.formula;
          flat[key] = f ? (f.type === 'date' ? f.date?.start ?? null : f[f.type] ?? null) : null;
          break;
        }
        case 'rollup': {
          const r = prop.rollup;
          if (!r) { flat[key] = null; break; }
          if (r.type === 'number') flat[key] = r.number ?? null;
          else if (r.type === 'date') flat[key] = r.date?.start ?? null;
          else if (r.type === 'array') flat[key] = r.array?.length ?? 0;
          else flat[key] = null;
          break;
        }
        case 'unique_id':
          flat[key] = prop.unique_id ? (prop.unique_id.prefix ? `${prop.unique_id.prefix}-${prop.unique_id.number}` : prop.unique_id.number) : null;
          break;
        case 'button':      flat[key] = null; break; // UI-only, no data value
        default:            flat[key] = null;
      }
    }
    return flat;
  }

  private async resolveRelationNames(
    records: IndraRecord[],
    relationFields: FieldSchema[],
    limit: number
  ): Promise<IndraRecord[]> {
    if (!relationFields.length || !records.length) return records;

    const allIds = new Set<string>();
    for (const record of records) {
      for (const field of relationFields) {
        const val = record.fields[field.key];
        if (Array.isArray(val)) val.forEach((id: string) => allIds.add(id));
      }
    }

    const idsToResolve = [...allIds].slice(0, limit);
    if (!idsToResolve.length) return records;

    const pages = await Promise.allSettled(
      idsToResolve.map(id => this.client.get(`/pages/${id}`))
    );

    const nameCache: Record<string, string> = {};
    idsToResolve.forEach((id, i) => {
      const r = pages[i];
      nameCache[id] = r.status === 'fulfilled' ? this.extractPageTitle(r.value) ?? id : id;
    });

    return records.map(record => {
      const enriched = { ...record, fields: { ...record.fields } };
      for (const field of relationFields) {
        const val = enriched.fields[field.key];
        if (Array.isArray(val)) {
          enriched.fields[field.key] = val.map((id: string) => nameCache[id] ?? id);
        }
      }
      return enriched;
    });
  }

  private schemaToFields(notionSchema: Record<string, any>): FieldSchema[] {
    return Object.entries(notionSchema).map(([key, prop]) => {
      const t = prop.type as string;
      let type: FieldSchema['type'] = 'string';
      if (t === 'number') type = 'number';
      else if (t === 'date' || t === 'created_time' || t === 'last_edited_time') type = 'date';
      else if (t === 'checkbox') type = 'boolean';
      else if (t === 'select' || t === 'status') type = 'select';
      else if (t === 'multi_select') type = 'multi-select';
      else if (t === 'email') type = 'email';
      else if (t === 'url') type = 'url';
      else if (t === 'files') type = 'file';
      else if (t === 'relation') type = 'relation';
      else if (t === 'formula' || t === 'rollup') type = 'computed';

      const options = [
        ...(prop.select?.options?.map((o: any) => o.name) ?? []),
        ...(prop.multi_select?.options?.map((o: any) => o.name) ?? []),
      ];

      return { key, label: key, type, options: options.length ? options : undefined };
    });
  }

  private fieldsToNotionProperties(fields: Record<string, any>, schema: Record<string, any>): Record<string, any> {
    const props: Record<string, any> = {};
    for (const key in fields) {
      const schemaProp = schema[key];
      if (!schemaProp) continue;
      const val = fields[key];
      const type = schemaProp.type as string;
      switch (type) {
        case 'title':        props[key] = { title: [{ text: { content: String(val ?? '') } }] }; break;
        case 'rich_text':    props[key] = { rich_text: [{ text: { content: String(val ?? '') } }] }; break;
        case 'number':       props[key] = { number: Number(val) }; break;
        case 'select':       props[key] = { select: { name: String(val) } }; break;
        case 'multi_select': props[key] = { multi_select: (Array.isArray(val) ? val : [val]).map((v: any) => ({ name: String(v) })) }; break;
        case 'date':         props[key] = { date: { start: new Date(val).toISOString() } }; break;
        case 'checkbox':     props[key] = { checkbox: Boolean(val) }; break;
        case 'url':          props[key] = { url: String(val) }; break;
        case 'email':        props[key] = { email: String(val) }; break;
        case 'phone_number': props[key] = { phone_number: String(val) }; break;
        case 'relation':     props[key] = { relation: (Array.isArray(val) ? val : [val]).map((id: string) => ({ id })) }; break;
      }
    }
    return props;
  }

  private extractTitle(titleArray: any[]): string {
    return (titleArray ?? []).map((t: any) => t.plain_text ?? '').join('');
  }

  private extractPageTitle(page: any): string | null {
    if (!page?.properties) return null;
    for (const prop of Object.values(page.properties) as any[]) {
      if (prop.type === 'title' && prop.title?.length) return prop.title[0].plain_text ?? null;
    }
    return null;
  }
}
