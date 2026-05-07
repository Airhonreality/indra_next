const NANGO_SECRET = 'cefa681e-2ce7-49a8-a82f-f36d7ae8d468';
const NANGO_API_BASE = 'https://api.nango.dev';

async function testNango() {
  console.log('--- INDRA NANGO AUDIT ---');
  console.log('Target Key:', NANGO_SECRET.slice(0, 8) + '...');
  
  try {
    const response = await fetch(`${NANGO_API_BASE}/config`, {
      headers: { 'Authorization': `Bearer ${NANGO_SECRET}` }
    });

    if (!response.ok) {
      console.error(`[ERROR] Nango API returned status ${response.status}`);
      const err = await response.text();
      console.error('Response:', err);
      return;
    }

    const data = await response.json();
    console.log('[SUCCESS] Connection established.');
    console.log('Registered Integrations in Nango Workspace:');
    
    if (!data.configs || data.configs.length === 0) {
      console.log('!!! NO INTEGRATIONS FOUND !!!');
      console.log('Tip: Go to Nango Dashboard -> Integrations and "Add Integration".');
    } else {
      data.configs.forEach(cfg => {
        console.log(`- ID: ${cfg.unique_key} (Provider: ${cfg.provider})`);
      });
    }

  } catch (error) {
    console.error('[CRITICAL ERROR] Failed to fetch from Nango:', error.message);
  }
}

testNango();
