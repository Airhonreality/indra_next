import { nango } from '@/lib/nango';

/**
 * Generic HTTP client interface.
 * Adapters depend on this — not on Nango or any specific auth mechanism.
 */
export interface AuthorizedClient {
  get(endpoint: string): Promise<any>;
  post(endpoint: string, data?: any): Promise<any>;
  patch(endpoint: string, data?: any): Promise<any>;
  batchGet(endpoints: string[]): Promise<any[]>;
}

export class NangoAuthorizedClient implements AuthorizedClient {
  constructor(
    private readonly providerConfigKey: string,
    private readonly connectionId: string,
    private readonly extraHeaders?: Record<string, string>
  ) {}

  private async request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', endpoint: string, data?: any): Promise<any> {
    const response = await nango.proxy({
      method,
      endpoint,
      providerConfigKey: this.providerConfigKey,
      connectionId: this.connectionId,
      data,
      headers: this.extraHeaders,
    });
    return response.data;
  }

  get(endpoint: string) { return this.request('GET', endpoint); }
  post(endpoint: string, data?: any) { return this.request('POST', endpoint, data); }
  patch(endpoint: string, data?: any) { return this.request('PATCH', endpoint, data); }

  async batchGet(endpoints: string[]): Promise<any[]> {
    return Promise.all(endpoints.map(ep => this.get(ep)));
  }
}

export class DirectFetchClient implements AuthorizedClient {
  constructor(
    private readonly baseUrl: string,
    private readonly headers: Record<string, string>
  ) {}

  private async request(method: string, endpoint: string, data?: any): Promise<any> {
    const res = await fetch(this.baseUrl + endpoint, {
      method,
      headers: { 'Content-Type': 'application/json', ...this.headers },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  get(endpoint: string) { return this.request('GET', endpoint); }
  post(endpoint: string, data?: any) { return this.request('POST', endpoint, data); }
  patch(endpoint: string, data?: any) { return this.request('PATCH', endpoint, data); }

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
