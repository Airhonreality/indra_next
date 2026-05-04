import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { ingestionPorts } from '@/core/db/schema';
import { eq } from 'drizzle-orm';
import { IngestionClient } from './ingestion-client';

export const metadata = {
  title: 'Ingesta de Contenido | Indra NEXT',
  description: 'Sube tus archivos con integridad soberana.',
};

export default async function PublicPortPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // 1. Fetch port config from DB
  const [port] = await db
    .select()
    .from(ingestionPorts)
    .where(eq(ingestionPorts.slug, slug))
    .limit(1);

  // 2. Security Checks
  if (!port || !port.isActive) {
    notFound();
  }

  // 3. Render the Hardened Ingestion Client
  return (
    <main className="min-h-screen bg-black text-white selection:bg-cyan-500/30">
      <IngestionClient 
        slug={slug}
        portLabel={port.label}
        schema={port.schema || []}
        config={port.config || {}}
      />
    </main>
  );
}
