import { nango } from '@/lib/nango';

/**
 * Generic HTTP client interface.
 * Adapters depend on this — not on Nango or any specific auth mechanism.
 */
export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  endpoint: string;
  params?: Record<string, string>;
  data?: any;
  headers?: Record<string, string>;
}

export interface AuthorizedClient {
  get(endpoint: string): Promise<any>;
  post(endpoint: string, data?: any): Promise<any>;
  patch(endpoint: string, data?: any): Promise<any>;
  batchGet(endpoints: string[]): Promise<any[]>;
  request(config: RequestConfig): Promise<any>;
}

export class NangoAuthorizedClient implements AuthorizedClient {
  constructor(
    private readonly providerConfigKey: string,
    private readonly connectionId: string,
    private readonly extraHeaders?: Record<string, string>
  ) {}

  async request(config: RequestConfig): Promise<any> {
    const response = await nango.proxy({
      method: config.method || 'GET',
      endpoint: config.endpoint,
      providerConfigKey: this.providerConfigKey,
      connectionId: this.connectionId,
      data: config.data,
      params: config.params,
      headers: { ...this.extraHeaders, ...config.headers },
    });
    return response.data;
  }

  get(endpoint: string) { return this.request({ method: 'GET', endpoint }); }
  post(endpoint: string, data?: any) { return this.request({ method: 'POST', endpoint, data }); }
  patch(endpoint: string, data?: any) { return this.request({ method: 'PATCH', endpoint, data }); }

  async batchGet(endpoints: string[]): Promise<any[]> {
    return Promise.all(endpoints.map(ep => this.get(ep)));
  }
}

export class DirectFetchClient implements AuthorizedClient {
  constructor(
    private readonly baseUrl: string,
    private readonly headers: Record<string, string>
  ) {}

  async request(config: RequestConfig): Promise<any> {
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
    return res.json();
  }

  get(endpoint: string) { return this.request({ method: 'GET', endpoint }); }
  post(endpoint: string, data?: any) { return this.request({ method: 'POST', endpoint, data }); }
  patch(endpoint: string, data?: any) { return this.request({ method: 'PATCH', endpoint, data }); }

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
