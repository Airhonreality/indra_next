/**
 * gRPC client for the local indra-daemon SyncService.
 *
 * Scope note (see docs/plans/24_PLAN_verificacion-e2e-storage.md): this connects to
 * 127.0.0.1:50051, i.e. a daemon running on the SAME machine as this Next.js process.
 * It proves the local daemon <-> local API round trip. It does NOT reach into a user's
 * home network from a hosted/multi-tenant deployment — that requires a relay/pairing
 * layer that has not been built yet (see plan 23).
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';

const PROTO_PATH = path.join(
  process.cwd(),
  'daemon-rs/crates/indra-daemon/proto/sync.proto'
);

const DAEMON_ADDRESS = process.env.INDRA_DAEMON_ADDRESS ?? '127.0.0.1:50051';

export interface ChunkHash {
  algorithm: string;
  digest: Buffer;
}

export interface FileMetadata {
  path: string;
  size: string; // int64 arrives as string with longs: String
  modifiedTimeMs: string;
  mode: string;
  chunks: ChunkHash[];
}

export interface SyncEvent {
  eventId: string;
  type: string; // enum name, e.g. "FILE_UPDATED"
  file: FileMetadata | null;
  timestampMs: string;
  deviceId: string;
  versionVector: number;
}

export interface PullResult {
  events: SyncEvent[];
  currentVersion: number;
  hasMore: boolean;
}

interface SyncServiceClient extends grpc.Client {
  pull(
    request: { device_id: string; since_version: number; sync_root: string },
    deadline: grpc.CallOptions,
    callback: (err: grpc.ServiceError | null, response: PullResult) => void
  ): void;
  heartbeat(
    request: {
      device_id: string;
      device_name: string;
      ip_address: string;
      port: number;
    },
    deadline: grpc.CallOptions,
    callback: (
      err: grpc.ServiceError | null,
      response: { acknowledged: boolean; knownDevices: unknown[] }
    ) => void
  ): void;
}

let cachedClient: SyncServiceClient | null = null;

function getClient(): SyncServiceClient {
  if (cachedClient) return cachedClient;

  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as {
    indra: { sync: { SyncService: new (addr: string, creds: grpc.ChannelCredentials) => SyncServiceClient } };
  };

  cachedClient = new proto.indra.sync.SyncService(
    DAEMON_ADDRESS,
    grpc.credentials.createInsecure()
  );

  return cachedClient;
}

const DEADLINE_MS = 3000;

function deadline(): grpc.CallOptions {
  return { deadline: Date.now() + DEADLINE_MS };
}

/** True if the daemon accepted a TCP/HTTP2 connection within the deadline. */
export async function isDaemonReachable(): Promise<boolean> {
  const client = getClient();
  return new Promise((resolve) => {
    client.waitForReady(Date.now() + DEADLINE_MS, (err) => {
      resolve(!err);
    });
  });
}

export async function daemonHeartbeat(deviceName: string): Promise<{
  acknowledged: boolean;
} | null> {
  const client = getClient();
  return new Promise((resolve) => {
    client.heartbeat(
      { device_id: 'nextjs-web', device_name: deviceName, ip_address: '127.0.0.1', port: 0 },
      deadline(),
      (err, response) => {
        if (err) {
          resolve(null);
          return;
        }
        resolve({ acknowledged: response.acknowledged });
      }
    );
  });
}

/** Pulls the current file snapshot known to the local daemon, most recent first. */
export async function daemonPullFiles(): Promise<PullResult> {
  const client = getClient();
  return new Promise((resolve, reject) => {
    client.pull(
      { device_id: 'nextjs-web', since_version: 0, sync_root: '' },
      deadline(),
      (err, response) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(response);
      }
    );
  });
}
