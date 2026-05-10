/**
 * 📊 ARTEFACTO: IntegrationMetricsGrid.tsx (System Health Dashboard)
 * ────────────
 * CAPA: UI / Features (Health & Status)
 * VERSIÓN: 1.0.0
 * COMMIT: P1-M4.1-UI-HEALTH-DASHBOARD
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Proyección visual del estado de salud y cobertura del sistema (KPIs).
 * - Dashboard de monitorización de nodos de infraestructura y aprovisionamiento.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Reflejar pasivamente los datos entregados por el Kernel/Hook.
 * - NEVER: Calcular métricas o salud del sistema dentro del componente (Solo lectura).
 * - ALWAYS: Mostrar affordances visuales claros basados en los resultados del Integrity Checker.
 * 
 * 📜 PHASE_4_HEALTH: Actúa como la interfaz de usuario para el reporte del Integrity Checker global.
 * 
 * 🔑 KEYWORDS: #HealthDashboard #SystemMetrics #InfrastructureKPI #IntegrityMonitoring
 * 🔗 RELATIONSHIPS: [IntegrityChecker, AgnosticConsoleShell, useIntegrationState]
 */

interface IntegrationMetricsGridProps {
  totalAdapters: number;
  configuredNango: number;
  coverage: number;
}

export function IntegrationMetricsGrid({ totalAdapters, configuredNango, coverage }: IntegrationMetricsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-2 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Entidades / Adaptadores</span>
        <span className="text-3xl font-black text-foreground">{totalAdapters}</span>
        <span className="text-xs text-muted-foreground">Sistemas conocidos por Indra</span>
      </div>
      <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-2 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Aprovisionados en Nango</span>
        <span className="text-3xl font-black text-primary">{configuredNango}</span>
        <span className="text-xs text-muted-foreground">Tokens listos para consumo</span>
      </div>
      <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-2 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cobertura OAuth (KPI)</span>
        <span className="text-3xl font-black text-emerald-600">{coverage}%</span>
        <span className="text-xs text-muted-foreground">Nodos remotos listos</span>
      </div>
    </div>
  );
}
