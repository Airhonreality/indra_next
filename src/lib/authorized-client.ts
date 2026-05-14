/**
 * 🗝️ ARTEFACTO: authorized-client.ts
 * ────────────
 * CAPA: Lib / Security (The Sovereign Gate)
 * VERSIÓN: 1.1.0-Auth
 * COMMIT: P2-M2.3-ADR-CLEAN-HTTP-BRIDGE
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Abstracción de peticiones HTTP autorizadas mediante Nango Proxy o Fetch Directo.
 * - Desacoplamiento de la lógica del adaptador de la infraestructura de transporte.
 * - Inyección de cabeceras de seguridad y versiones de API por integración.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Ser agnóstico a la API final; el cliente solo entiende 'endpoint' y 'data'.
 * - NEVER: Hardcodear cabeceras específicas de proveedor (ej. 'Notion-Version') dentro de la clase genérica. Usar fábricas.
 * - NEVER: Exponer o loguear el 'Nango-Secret-Key' en ninguna capa del cliente.
 * - ALWAYS: Retornar errores tipados que el Core pueda interpretar sin conocer el código HTTP.
 * 
 * 📜 ADR: [2026-05-08] UNIFIED_AUTHORIZED_TRANSPORT
 * - DECISIÓN: Implementar una interfaz común para Nango Proxy y Fetch para permitir testing y mocks.
 * - IMPACTO: Facilidad de migración entre proveedores de OAuth sin tocar lógica de adaptadores.
 * 
 * 🔑 KEYWORDS: #AuthorizedClient #NangoProxy #DependencyInversion #SecurityGate
 * 🔗 RELATIONSHIPS: [IntegrationAdapter, NangoLib, API_Vault]
 */

import { nango } from '@/lib/nango';
export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  endpoint: string;
  params?: Record<string, string>;
  data?: any;
  headers?: Record<string, string>;
}

export interface AuthorizedResponse<T = any> {
  data: T;
  headers: Record<string, string>;
  status: number;
}

export interface AuthorizedClient {
  get(endpoint: string): Promise<any>;
  post(endpoint: string, data?: any): Promise<any>;
  patch(endpoint: string, data?: any): Promise<any>;
  batchGet(endpoints: string[]): Promise<any[]>;
  request<T = any>(config: RequestConfig): Promise<AuthorizedResponse<T>>;
}

export class NangoAuthorizedClient implements AuthorizedClient {
  constructor(
    private readonly providerConfigKey: string,
    private readonly connectionId: string,
    private readonly extraHeaders?: Record<string, string>
  ) {}

  async request<T = any>(config: RequestConfig): Promise<AuthorizedResponse<T>> {
    // 🛠️ CANONICAL V2 PROXY ENFORCEMENT
    const cleanEndpoint = config.endpoint.startsWith('/') 
      ? config.endpoint.slice(1) 
      : config.endpoint;

    const response = await nango.proxy({
      method: config.method || 'GET',
      endpoint: cleanEndpoint,
      providerConfigKey: this.providerConfigKey,
      connectionId: this.connectionId,
      data: config.data,
      params: config.params,
      headers: { 
        ...this.extraHeaders, 
        ...config.headers
      },
    });

    // Normalize headers to lowercase for axiomatic robustness
    const headers: Record<string, string> = {};
    Object.entries(response.headers || {}).forEach(([k, v]) => {
      headers[k.toLowerCase()] = String(v);
    });

    return {
      data: response.data,
      headers,
      status: response.status
    };
  }

  async get(endpoint: string) { 
    const res = await this.request({ method: 'GET', endpoint }); 
    return res.data;
  }
  async post(endpoint: string, data?: any) { 
    const res = await this.request({ method: 'POST', endpoint, data }); 
    return res.data;
  }
  async patch(endpoint: string, data?: any) { 
    const res = await this.request({ method: 'PATCH', endpoint, data }); 
    return res.data;
  }

  async batchGet(endpoints: string[]): Promise<any[]> {
    return Promise.all(endpoints.map(ep => this.get(ep)));
  }
}

export class DirectFetchClient implements AuthorizedClient {
  constructor(
    private readonly baseUrl: string,
    private readonly headers: Record<string, string>
  ) {}

  async request<T = any>(config: RequestConfig): Promise<AuthorizedResponse<T>> {
    const url = new URL(this.baseUrl + config.endpoint);
    if (config.params) {
      Object.entries(config.params).forEach(([k, v]) => url.searchParams.append(k, v));
    }

    const res = await fetch(url.toString(), {
      method: config.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...this.headers, ...config.headers },
      body: config.data ? JSON.stringify(config.data) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    
    // Normalize headers to lowercase for axiomatic robustness
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { 
      headers[k.toLowerCase()] = v; 
    });

    return { data, headers, status: res.status };
  }

  async get(endpoint: string) { 
    const res = await this.request({ method: 'GET', endpoint }); 
    return res.data;
  }
  async post(endpoint: string, data?: any) { 
    const res = await this.request({ method: 'POST', endpoint, data }); 
    return res.data;
  }
  async patch(endpoint: string, data?: any) { 
    const res = await this.request({ method: 'PATCH', endpoint, data }); 
    return res.data;
  }

  async batchGet(endpoints: string[]): Promise<any[]> {
    return Promise.all(endpoints.map(ep => this.get(ep)));
  }
}

export function makeNotionClient(connectionId: string): AuthorizedClient {
  return new NangoAuthorizedClient('notion', connectionId, {
    'Notion-Version': '2022-06-28',
  });
}

export function makeSheetsClient(connectionId: string): AuthorizedClient {
  return new NangoAuthorizedClient('google-sheets', connectionId);
}
