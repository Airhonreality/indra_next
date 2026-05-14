/**
 * 🗝️ ARTEFACTO: authorized-client.ts
 * ────────────
 * CAPA: Lib / Security (The Sovereign Gate)
 * VERSIÓN: 2.0.0
 * COMMIT: P3-M7.1-SOVEREIGN-TRANSPORT-BYPASS
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Abstracción de peticiones HTTP autorizadas mediante Nango Proxy o Bypass Directo.
 * - Resolución del "Punto Ciego" de cabeceras en entornos Edge/Serverless.
 * - Gestión de la identidad soberana mediante tokens de Nango sin intermediación de transporte.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Priorizar el Bypass Directo para flujos de negociación de cabeceras críticas (Resumable Uploads).
 * - NEVER: Exponer tokens de acceso en el cliente (lado del navegador).
 * - ALWAYS: Garantizar la transparencia total de los headers mediante el "Polymorphic Reader".
 * 
 * 📜 ADR: [2026-05-14] SOVEREIGN_TRANSPORT_BYPASS
 * - DECISIÓN: Implementar acceso directo a APIs de proveedores usando tokens de Nango vía 'nango.getToken()'.
 * - MOTIVO: El Proxy de Nango oculta cabeceras vitales como 'Location' en ciertos entornos serverless, rompiendo el apretón de manos de subidas resumibles.
 * - IMPACTO: Control absoluto sobre la materia (datos) y el transporte, eliminando dependencias de terceros en la capa de negociación.
 * 
 * 🔗 RELATIONSHIPS:
 * - UPSTREAM: [Nango SDK, Google Drive API]
 * - DOWNSTREAM: [IntegrationAdapter, IngestionOrchestrator]
 */

import { nango } from '@/lib/nango';

export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  endpoint: string;
  params?: Record<string, string>;
  data?: any;
  headers?: Record<string, string>;
  bypassProxy?: boolean; // 🛰️ NEW: Sovereign Bypass Flag
  baseUrl?: string;      // Required for bypass mode
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
    const cleanEndpoint = config.endpoint.startsWith('/') 
      ? config.endpoint.slice(1) 
      : config.endpoint;

    // 🏛️ SOVEREIGN BYPASS LOGIC: Direct Fetch with Nango Token
    if (config.bypassProxy && config.baseUrl) {
      console.log(`[AuthorizedClient] Executing SOVEREIGN BYPASS to ${config.baseUrl}${cleanEndpoint}`);
      
      const token = await nango.getToken(this.providerConfigKey, this.connectionId);
      
      const url = new URL(config.baseUrl + (config.baseUrl.endsWith('/') ? '' : '/') + cleanEndpoint);
      if (config.params) {
        Object.entries(config.params).forEach(([k, v]) => url.searchParams.append(k, v));
      }

      const res = await fetch(url.toString(), {
        method: config.method || 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...this.extraHeaders,
          ...config.headers
        },
        body: config.data ? JSON.stringify(config.data) : undefined,
      });

      const data = (res.status === 204 || res.status === 201 && !res.headers.get('content-type')) 
        ? {} 
        : await res.json().catch(() => ({}));

      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

      return { data, headers, status: res.status };
    }

    // 🧪 TRADITIONAL NANGO PROXY LOGIC
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

    // 🏛️ AXIOMATIC POLYMORPHIC READER
    const headers: Record<string, string> = {};
    const rawHeaders = response.headers || {};

    if (typeof (rawHeaders as any).forEach === 'function') {
      (rawHeaders as any).forEach((v: string, k: string) => {
        headers[k.toLowerCase()] = v;
      });
    } else {
      Object.entries(rawHeaders).forEach(([k, v]) => {
        headers[k.toLowerCase()] = String(v);
      });
    }

    return {
      data: response.data,
      headers,
      status: response.status
    };
  }response.data,
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
    
    // 🏛️ AXIOMATIC POLYMORPHIC READER
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
