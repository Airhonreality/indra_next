import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderConfig } from '@/features/connections/integration_types';
import { computeMetrics, type ConnectionMetrics } from '@/features/connections/integration_types';
import type { FieldSchema } from '@/core/types/integration';

export type ConsoleTab = 'nodes' | 'ingestion' | 'workflows' | 'settings' | 'explorer';
export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

// ── Typed schema field — extends the core FieldSchema contract; single source of truth
export interface PortSchemaField extends FieldSchema {
  mapToMetadata?: string;
}

// ── Typed ingestion port (mirrors DB schema, serialized from API)
export interface IngestionPort {
  id: string;
  userId: string;
  integrationId: string;
  targetPath: string;
  config: { pattern?: string; maxFileSizeBytes?: number; allowedMimeTypes?: string[] } | null;
  schema: PortSchemaField[] | null;
  slug: string;
  label: string;
  isActive: boolean | null;
  createdAt: string;
}

interface IndraStore {
  // Slice 1: Invalidation Bus
  _invalidationCounter: Record<string, number>;
  invalidate: (tag: string) => void;

  // Slice 2: UI State (persisted)
  activeTab: ConsoleTab;
  setActiveTab: (tab: ConsoleTab) => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  isInventoryCollapsed: boolean;
  toggleInventory: () => void;

  // Slice 3: Port Editor (IngestionPortList ↔ PortCreator)
  selectedPort: IngestionPort | null;
  selectPort: (port: IngestionPort | null) => void;

  // Slice 4: Session Identity (NOT persisted — set by useSessionSync at Shell mount)
  userId: string | null;
  sessionStatus: SessionStatus;
  setSession: (userId: string | null, status: SessionStatus) => void;

  // Slice 5: Providers Cache (for memoized KPI selector — NOT persisted)
  cachedProviders: ProviderConfig[];
  setCachedProviders: (providers: ProviderConfig[]) => void;
}

// ── Memoized KPI selector: stable reference — Zustand + useShallow in consumers
export const selectMetrics = (s: IndraStore): ConnectionMetrics =>
  computeMetrics(s.cachedProviders);

export const useIndraStore = create<IndraStore>()(
  persist(
    (set) => ({
      // Slice 1
      _invalidationCounter: {},
      invalidate: (tag) =>
        set((s) => ({
          _invalidationCounter: {
            ...s._invalidationCounter,
            [tag]: (s._invalidationCounter[tag] ?? 0) + 1,
          },
        })),

      // Slice 2
      activeTab: 'ingestion',
      setActiveTab: (tab) => set({ activeTab: tab }),
      isSidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
      isInventoryCollapsed: false,
      toggleInventory: () => set((s) => ({ isInventoryCollapsed: !s.isInventoryCollapsed })),

      // Slice 3
      selectedPort: null,
      selectPort: (port) => set({ selectedPort: port }),

      // Slice 4
      userId: null,
      sessionStatus: 'loading',
      setSession: (userId, sessionStatus) => set({ userId, sessionStatus }),

      // Slice 5
      cachedProviders: [],
      setCachedProviders: (cachedProviders) => set({ cachedProviders }),
    }),
    {
      name: 'indra-ui-state',
      // Only persist layout preferences — never session identity or data caches
      partialize: (s) => ({
        activeTab: s.activeTab,
        isSidebarCollapsed: s.isSidebarCollapsed,
        isInventoryCollapsed: s.isInventoryCollapsed,
      }),
    }
  )
);
