// Indra NEXT Internationalization System (i18n)
// Standardizing nomenclature across the platform

export const i18n = {
  es: {
    common: {
      account: "Mi Cuenta",
      settings: "Configuración",
      save: "Guardar",
      cancel: "Cancelar",
      delete: "Eliminar",
      loading: "Cargando...",
      unauthorized: "No Autorizado",
      status: "Estado",
      active: "Activo",
      inactive: "Inactivo"
    },
    auth: {
      identity: "Identidad",
      login: "Iniciar Sesión",
      logout: "Cerrar Sesión",
      profile: "Perfil de Usuario"
    },
    connections: {
      title: "Conexiones de Almacenamiento",
      subtitle: "Gestiona tus silos de datos y proveedores cloud.",
      add: "Añadir Conexión",
      authorize: "Autorizar Conexión",
      credentials: "Credenciales API",
      provision: "Configurar Proveedor",
      explore: "Explorador de Conexiones",
      discovered: "Infraestructura Descubierta",
      no_infra: "No hay infraestructura configurada"
    },
    portals: {
      title: "Portales de Datos",
      subtitle: "Puntos de entrada públicos para recibir información.",
      create: "Crear Portal",
      manage: "Gestionar Portal",
      fields: "Campos del Formulario",
      slug: "URL del Portal",
      schema: "Esquema de Datos"
    },
    workflow: {
      title: "Editor de Flujos",
      subtitle: "Conecta tus portales con tus conexiones de almacenamiento.",
      builder: "Constructor de Pipeline",
      source: "Origen",
      target: "Destino",
      deploy: "Desplegar Flujo"
    }
  },
  en: {
    // Standard terms in English
    common: {
      account: "My Account",
      settings: "Settings",
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      loading: "Loading...",
      unauthorized: "Unauthorized",
      status: "Status",
      active: "Active",
      inactive: "Inactive"
    },
    auth: {
      identity: "Identity",
      login: "Login",
      logout: "Logout",
      profile: "User Profile"
    },
    connections: {
      title: "Storage Connections",
      subtitle: "Manage your data silos and cloud providers.",
      add: "Add Connection",
      authorize: "Authorize Connection",
      credentials: "API Credentials",
      provision: "Configure Provider",
      explore: "Connections Explorer",
      discovered: "Discovered Infrastructure",
      no_infra: "No infrastructure configured"
    },
    portals: {
      title: "Data Portals",
      subtitle: "Public entry points to receive information.",
      create: "Create Portal",
      manage: "Manage Portal",
      fields: "Form Fields",
      slug: "Portal URL",
      schema: "Data Schema"
    },
    workflow: {
      title: "Workflow Editor",
      subtitle: "Connect your portals with your storage connections.",
      builder: "Pipeline Builder",
      source: "Source",
      target: "Target",
      deploy: "Deploy Workflow"
    }
  }
};

export type Language = 'es' | 'en';
export const defaultLang: Language = 'es'; // Por defecto en español como solicitaste
