import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { integrations, storageConnections } from '@/core/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from "@/auth";
import { encryptServerPayload } from '@/lib/server-crypto';

export async function GET(req: Request) {
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
      
    // 2. Obtener conexiones de almacenamiento dedicadas (MEGA)
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
      connectionId: 'mega-vault',
      config: {
        ...item.config,
        email: item.config?.email || '',
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

