// Dictionary for standard technical nomenclature
// Avoids poetic or ambiguous terms

export const i18n = {
  es: {
    common: {
      account: "Cuenta",
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
      identity: "Sesión",
      account: "Cuenta de Usuario",
      login: "Ingresar",
      logout: "Cerrar Sesión",
      profile: "Perfil"
    },
    connections: {
      title: "Conexiones de Almacenamiento",
      subtitle: "Configuración de servicios externos y proveedores cloud.",
      add: "Nueva Conexión",
      authorize: "Conectar Servicio",
      credentials: "Credenciales de Aplicación",
      provision: "Aprovisionar Proveedor",
      explore: "Explorador de Recursos",
      discovered: "Servicios Disponibles",
      no_infra: "No se han detectado proveedores configurados"
    },
    portals: {
      title: "Portales de Datos",
      subtitle: "Configuración de puntos de entrada para recepción de archivos.",
      create: "Nuevo Portal",
      manage: "Administrar Portal",
      fields: "Esquema de Campos",
      slug: "Identificador URL",
      schema: "Definición de Datos"
    },
    workflow: {
      title: "Gestor de Flujos",
      subtitle: "Definición de rutas entre origen y destino.",
      builder: "Constructor de Pipeline",
      source: "Origen",
      target: "Destino",
      deploy: "Ejecutar Pipeline"
    }
  }
};

export type Language = 'es' | 'en';
export const defaultLang: Language = 'es';
