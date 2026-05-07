const NANGO_SECRET = 'cefa681e-2ce7-49a8-a82f-f36d7ae8d468';
const NANGO_API_BASE = 'https://api.nango.dev';

async function diagnoseHydration() {
  console.log('# INDRA SOVEREIGN HYDRATION DIAGNOSIS\n');
  
  try {
    // 1. Check Nango Connections
    const nangoRes = await fetch(`${NANGO_API_BASE}/connection`, {
      headers: { 'Authorization': `Bearer ${NANGO_SECRET}` }
    });
    const nangoData = await nangoRes.json();
    const connections = nangoData.connections || [];
    
    console.log('## [Step 1] Nango State');
    console.log(`- Found ${connections.length} connections in Nango.`);
    connections.forEach(c => {
      console.log(`  - ID: \`${c.connection_id}\` | Provider: \`${c.provider}\``);
    });

    // 2. Test the most recent Google Drive connection
    const driveConn = connections.find(c => c.provider === 'google-drive');
    if (driveConn) {
      console.log('\n## [Step 2] Testing Drive Connection via Proxy');
      const proxyUrl = `${NANGO_API_BASE}/proxy/drive/v3/files?pageSize=3`;
      const proxyRes = await fetch(proxyUrl, {
        headers: {
          'Authorization': `Bearer ${NANGO_SECRET}`,
          'Provider-Config-Key': 'google-drive',
          'Connection-Id': driveConn.connection_id
        }
      });
      
      if (proxyRes.ok) {
        const data = await proxyRes.json();
        console.log('- ✅ SUCCESS: Google Drive returned objects.');
        console.log('- Sample Data (First 3):');
        data.files?.forEach(f => console.log(`  - [${f.mimeType}] ${f.name}`));
      } else {
        const err = await proxyRes.text();
        console.log(`- ❌ FAILURE: Nango Proxy returned ${proxyRes.status}`);
        console.log(`  - Error: ${err}`);
      }
    } else {
      console.log('\n## [Step 2] ❌ No Google Drive connection found in Nango.');
    }

    console.log('\n## [Conclusion]');
    console.log('If Step 2 is GREEN but the UI is empty, the issue is likely that the Connection ID in our database does not match the one in Nango, or the user is logged in with a different identity in the app.');

  } catch (err) {
    console.error('Diagnosis failed:', err);
  }
}

diagnoseHydration();
