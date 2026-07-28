import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { integrations, storageConnections } from '@/core/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from "@/auth";
import { encryptServerPayload } from '@/lib/server-crypto';
import { promises as fs } from 'node:fs';
import { isAbsolute } from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { ClaroAdapter } from '@/integrations/claro/adapter';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Obtener integraciones tradicionales (Notion, Google Sheets, etc.)
    const list = await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, session.user.id));
      
    // 2. Obtener conexiones de almacenamiento dedicadas (MEGA / Claro / S3)
    const storageList = await db
      .select()
      .from(storageConnections)
      .where(eq(storageConnections.userId, session.user.id));

    // Mapear el esquema dedicado de storageConnections al tipo genérico de Integración esperado por el frontend
    const mappedStorage = storageList.map((item) => ({
      id: item.id,
      userId: item.userId,
      type: item.provider,
      label: item.label,
      connectionId:
        item.provider === 'mega'
          ? 'mega-vault'
          : item.provider === 's3'
            ? 's3-vault'
            : item.provider === 'claro'
              ? 'claro-vault'
              : item.id,
      config: {
        ...item.config,
        email: item.config?.email || '',
        bucket: item.config?.bucket || '',
        baseUrl: item.config?.baseUrl || '',
        username: item.config?.username || '',
        isConnected: !!item.encryptedCredentials,
      },
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));
      
    return NextResponse.json({ integrations: [...list, ...mappedStorage] });
  } catch (error) {
    console.error('Fetch Integrations Error:', error);
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { type, label, connectionId, config } = await req.json();

    if (type === 'storage') {
      const basePath = typeof config?.basePath === 'string' ? config.basePath.trim() : '';
      if (!basePath || !isAbsolute(basePath)) {
        return NextResponse.json(
          { error: 'La carpeta local debe ser una ruta absoluta.' },
          { status: 400 }
        );
      }

      try {
        const stats = await fs.stat(basePath);
        if (!stats.isDirectory()) {
          return NextResponse.json(
            { error: 'La ruta local debe apuntar a una carpeta.' },
            { status: 400 }
          );
        }
        await fs.access(basePath, fsConstants.R_OK | fsConstants.W_OK);
      } catch {
        return NextResponse.json(
          { error: 'La carpeta local no existe o no tiene permisos de lectura y escritura.' },
          { status: 400 }
        );
      }

      const existing = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.userId, session.user.id),
            eq(integrations.type, 'storage'),
            eq(integrations.connectionId, connectionId || `local-storage-${session.user.id}`)
          )
        )
        .limit(1);

      const storedConfig = { ...(config || {}), basePath };
      if (existing[0]) {
        const result = await db
          .update(integrations)
          .set({
            label: label || `STORAGE [${basePath}]`,
            config: storedConfig,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(integrations.id, existing[0].id))
          .returning();
        return NextResponse.json({ success: true, integration: result[0] });
      }

      const result = await db.insert(integrations).values({
        userId: session.user.id,
        type: 'storage',
        label: label || `STORAGE [${basePath}]`,
        connectionId: connectionId || `local-storage-${session.user.id}`,
        config: storedConfig,
        isActive: true,
      }).returning();
      return NextResponse.json({ success: true, integration: result[0] });
    }

    // Si es MEGA, procesamos el guardado en la tabla dedicada storage_connections con encriptación at-rest
    if (type === 'mega') {
      const { email, password } = config || {};
      if (!email || !password) {
        return NextResponse.json({ error: 'Email and password are required for MEGA' }, { status: 400 });
      }

      // Encriptar credenciales de forma segura usando AES-256-GCM y clave derivada por usuario
      const encryptedCredentials = encryptServerPayload({ email, password }, session.user.id);

      const result = await db.insert(storageConnections).values({
        userId: session.user.id,
        provider: 'mega',
        label: label || 'MEGA Sovereign Storage',
        isActive: true,
        encryptedCredentials,
        config: {
          email, // Almacenamos únicamente el email en texto plano para visualización en UI
        },
      }).returning();

      const mapped = {
        id: result[0].id,
        userId: result[0].userId,
        type: result[0].provider,
        label: result[0].label,
        connectionId: 'mega-vault',
        config: {
          email: result[0].config?.email || '',
          isConnected: true,
        },
        isActive: result[0].isActive,
        createdAt: result[0].createdAt,
        updatedAt: result[0].updatedAt,
      };

      return NextResponse.json({ success: true, integration: mapped });
    }

    // Claro Drive compatible with Nextcloud WebDAV + application passwords
    if (type === 'claro') {
      const { baseUrl, username, password } = config || {};
      if (!baseUrl || !username || !password) {
        return NextResponse.json(
          { error: 'Base URL, username and app password are required for Claro Drive.' },
          { status: 400 }
        );
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(baseUrl);
      } catch {
        return NextResponse.json(
          { error: 'The Claro Drive base URL must be a valid absolute URL.' },
          { status: 400 }
        );
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return NextResponse.json(
          { error: 'The Claro Drive base URL must use http or https.' },
          { status: 400 }
        );
      }

      const probe = new ClaroAdapter({
        baseUrl: parsedUrl.toString().replace(/\/+$/, ''),
        username,
        password,
      });
      const connectionCheck = await probe.testConnection();
      if (!connectionCheck.ok) {
        return NextResponse.json(
          { error: connectionCheck.error || 'Claro Drive credentials could not be validated.' },
          { status: 401 }
        );
      }

      const encryptedCredentials = encryptServerPayload(
        { baseUrl: parsedUrl.toString().replace(/\/+$/, ''), username, password },
        session.user.id
      );

      const result = await db.insert(storageConnections).values({
        userId: session.user.id,
        provider: 'claro',
        label: label || `Claro Drive [${username}]`,
        isActive: true,
        encryptedCredentials,
        config: {
          baseUrl: parsedUrl.toString().replace(/\/+$/, ''),
          username,
        },
      }).returning();

      const mapped = {
        id: result[0].id,
        userId: result[0].userId,
        type: result[0].provider,
        label: result[0].label,
        connectionId: 'claro-vault',
        config: {
          baseUrl: result[0].config?.baseUrl || '',
          username: result[0].config?.username || '',
          isConnected: true,
        },
        isActive: result[0].isActive,
        createdAt: result[0].createdAt,
        updatedAt: result[0].updatedAt,
      };

      return NextResponse.json({ success: true, integration: mapped });
    }

    // Si es Cloudflare R2 / S3, procesamos de forma idéntica y segura
    if (type === 's3') {
      const { bucket, endpoint, accessKeyId, secretAccessKey } = config || {};
      if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
        return NextResponse.json({ error: 'Todos los campos de S3/Cloudflare R2 son obligatorios.' }, { status: 400 });
      }

      // Encriptar credenciales privadas de S3 usando la clave segura del usuario
      const encryptedCredentials = encryptServerPayload(
        { bucket, endpoint, accessKeyId, secretAccessKey },
        session.user.id
      );

      const result = await db.insert(storageConnections).values({
        userId: session.user.id,
        provider: 's3',
        label: label || 'Cloudflare R2 Storage',
        isActive: true,
        encryptedCredentials,
        config: {
          bucket, // Almacenamos únicamente el nombre del bucket de forma pública para la UI
        },
      }).returning();

      const mapped = {
        id: result[0].id,
        userId: result[0].userId,
        type: result[0].provider,
        label: result[0].label,
        connectionId: 's3-vault',
        config: {
          bucket: result[0].config?.bucket || '',
          isConnected: true,
        },
        isActive: result[0].isActive,
        createdAt: result[0].createdAt,
        updatedAt: result[0].updatedAt,
      };

      return NextResponse.json({ success: true, integration: mapped });
    }

    // Integraciones tradicionales
    const result = await db.insert(integrations).values({
      userId: session.user.id,
      type,
      label,
      connectionId,
      config: config || {},
      isActive: true,
    }).returning();

    return NextResponse.json({ success: true, integration: result[0] });
  } catch (error) {
    console.error('Create Integration Error:', error);
    return NextResponse.json({ error: 'Failed to create integration' }, { status: 500 });
  }
}
