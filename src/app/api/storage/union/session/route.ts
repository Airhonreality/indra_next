import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { StorageUnion } from '@/integrations/storage-union';
import { getActiveUpstreams, decryptMegaCredentials } from '@/integrations/storage-union/helpers';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Decrypt MEGA credentials from headers if provided
  const encryptedCreds = req.headers.get('x-mega-credentials');
  let megaCredentials: any = undefined;
  if (encryptedCreds) {
    try {
      megaCredentials = decryptMegaCredentials(encryptedCreds, session.user.id);
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or undecryptable MEGA credentials' }, { status: 400 });
    }
  }

  try {
    const { targetId, fileName, mimeType, totalSize, metadata } = await req.json();

    if (!fileName || !mimeType) {
      return NextResponse.json({ error: 'fileName and mimeType are required fields.' }, { status: 400 });
    }

    const upstreams = await getActiveUpstreams(session.user.id, megaCredentials);
    const union = new StorageUnion(upstreams);

    const result = await union.createResumableSession(
      targetId || 'root',
      fileName,
      mimeType,
      totalSize,
      metadata
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error('[Union Session API Error]:', error);
    return NextResponse.json({ error: 'Failed to create union upload session' }, { status: 500 });
  }
}
