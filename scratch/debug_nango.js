const NANGO_SECRET = 'cefa681e-2ce7-49a8-a82f-f36d7ae8d468';
const NANGO_API_BASE = 'https://api.nango.dev';

async function debugNango() {
  console.log('--- INDRA SOVEREIGN DEBUGGER ---');
  console.log('Target: Google Drive Proxy');
  
  try {
    // 1. List all connections to find active IDs
    console.log('\n[1] Fetching all Nango connections...');
    const connRes = await fetch(`${NANGO_API_BASE}/connection`, {
      headers: { 'Authorization': `Bearer ${NANGO_SECRET}` }
    });
    
    if (!connRes.ok) {
      console.error('Failed to fetch connections:', await connRes.text());
      return;
    }
    
    const { connections } = await connRes.res ? await connRes.json() : { connections: [] };
    // Handle Nango 2.0 response format if different
    const rawData = await connRes.json();
    const activeConnections = rawData.connections || [];
    
    console.log(`Found ${activeConnections.length} active connections in Nango.`);
    
    for (const conn of activeConnections) {
      console.log(`\n--- Testing Connection: ${conn.connection_id} (${conn.provider}) ---`);
      
      if (conn.provider === 'google-drive') {
        const proxyUrl = `${NANGO_API_BASE}/proxy/drive/v3/files?pageSize=5&fields=files(id,name,mimeType)`;
        console.log(`Calling Proxy: ${proxyUrl}`);
        
        const proxyRes = await fetch(proxyUrl, {
          headers: {
            'Authorization': `Bearer ${NANGO_SECRET}`,
            'Provider-Config-Key': 'google-drive',
            'Connection-Id': conn.connection_id
          }
        });
        
        if (proxyRes.ok) {
          const data = await proxyRes.json();
          console.log('SUCCESS! Sample Files:');
          console.table(data.files || []);
        } else {
          console.error(`ERROR ${proxyRes.status}:`, await proxyRes.text());
        }
      }
    }
    
  } catch (err) {
    console.error('Debug script failed:', err);
  }
}

debugNango();
