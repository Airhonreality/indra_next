---
name: INDRA NEXT - Project State
description: Architecture, completed missions, and key decisions for the INDRA NEXT sovereign data infrastructure project
type: project
---

Phase 1 (chassis) was complete before my involvement. Phase 2 (adapter implementations) was built in session of 2026-05-03.

**Why:** User wants a universal data pipeline where all sources (Notion, Sheets, files) are treated symmetrically.

**How to apply:** Always follow the Master Prompt (docs/CLAUDE_CODE_MASTER_PROMPT.md) for architectural decisions. Key rules: no if/else for adapter instantiation, adapters receive AuthorizedClient (not Nango directly), adapters must implement IntegrationAdapter.

## Completed as of 2026-05-03

- `src/lib/authorized-client.ts` — AuthorizedClient interface + NangoAuthorizedClient + DirectFetchClient + factory helpers
- `src/core/registry.ts` — AdapterRegistry (dynamic, context-aware, no if/else)
- `src/core/types/integration.ts` — Added Transformer interface and makeFieldMapTransformer helper
- `src/integrations/notion/adapter.ts` — Full NotionAdapter porting from provider_notion.gs (flattenProperties, resolveRelationNames with Promise.all, schemaToFields, pushRecords)
- `src/integrations/notion/index.ts` — Self-registers with registry
- `src/integrations/google-sheets/adapter.ts` — SheetsAdapter using Sheets REST API v4 via Nango
- `src/integrations/google-sheets/index.ts` — Self-registers
- `src/integrations/storage/adapter.ts` — StorageAdapter (JSON + CSV, fs-based, upsert logic)
- `src/integrations/storage/index.ts` — Self-registers, reads STORAGE_BASE_PATH env
- `src/core/engines/pipeline.ts` — DataPipeline (agnostic engine, dryRun support, transformer support)
- `src/inngest/functions/run-agnostic-pipeline.ts` — Inngest v4 durable workflow (event: 'indra/pipeline.run')
- `src/app/api/inngest/route.ts` — Updated to register runAgnosticPipeline

## Pre-existing unresolved issues (NOT my code)
Missing npm packages: clsx, tailwind-merge, postgres, class-variance-authority, @base-ui/react/button

## Key architectural decisions
- Inngest v4 API: createFunction takes 2 args — options object (with `triggers` array inside) + handler
- `Record` interface name conflicts with TypeScript built-in; use `type { Record as IndraRecord }` import alias in new files
- SheetsAdapter.listSources() calls Google Drive API to list spreadsheets
- StorageAdapter sourceId = relative file path from basePath (env: STORAGE_BASE_PATH, default: ./data)
- Nango providerConfigKey: 'notion' for Notion, 'google-sheets' for Sheets

## Completed Phase 3 UI (2026-05-03) — Missions 7-9

- `src/components/ui/input.tsx`, `label.tsx`, `select.tsx`, `badge.tsx` — minimal shadcn-style primitives
- `src/components/widget-projector/index.tsx` — auto-generates form from FieldSchema[], Zod v4 validation, all canonical types
- `src/components/fractal-viewer/index.tsx` — hierarchical silo navigator, server-action driven, recursive expansion, lucide icons
- `src/app/actions/pipeline.ts` — Server Actions: executePipeline (fires Inngest, returns jobId) + listSources + getSourceSchema
- `src/app/page.tsx` — Dashboard wiring all three: FractalViewer + PipelineBuilder + WidgetProjector

### Key gotchas
- Zod v4: use `z.coerce.number()` not `z.number({ coerce: true })`
- Installed: @base-ui/react, clsx, tailwind-merge, class-variance-authority, tw-animate-css (were missing from node_modules)
- Inngest send API: `inngest.send({ id, name, data })`

## Still pending
- Inngest Motor Peristáltico: sync/preview workflow variants
- Real-time job status polling in UI using jobId
- Authentication / connectionId management UI
