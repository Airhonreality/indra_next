import { NextResponse } from 'next/server';

// Este catálogo podría venir de una API de Nango o una base de datos de "Capacidades"
// Por ahora, definimos los metadatos de los más comunes para el autodescubrimiento
const PROVIDER_CATALOG = [
  { id: 'notion', name: 'Notion', icon: 'https://cdn.nango.dev/icons/notion.svg' },
  { id: 'google-sheets', name: 'Google Sheets', icon: 'https://cdn.nango.dev/icons/google-sheets.svg' },
  { id: 'google-drive', name: 'Google Drive', icon: 'https://cdn.nango.dev/icons/google-drive.svg' },
  { id: 'salesforce', name: 'Salesforce', icon: 'https://cdn.nango.dev/icons/salesforce.svg' },
  { id: 'hubspot', name: 'HubSpot', icon: 'https://cdn.nango.dev/icons/hubspot.svg' },
  { id: 'slack', name: 'Slack', icon: 'https://cdn.nango.dev/icons/slack.svg' },
  { id: 'github', name: 'GitHub', icon: 'https://cdn.nango.dev/icons/github.svg' },
  { id: 'airtable', name: 'Airtable', icon: 'https://cdn.nango.dev/icons/airtable.svg' },
];

export async function GET() {
  return NextResponse.json({ catalog: PROVIDER_CATALOG });
}
