const fs = require('fs');
const path = require('path');

// Manually load .env
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length > 1) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^"(.*)"$/, '$1');
        process.env[key] = val;
      }
    });
  }
} catch (e) {
  console.error('Failed to load .env', e);
}

const postgres = require('postgres');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL missing in process.env');
  process.exit(1);
}
const sql = postgres(connectionString);

const { Storage } = require('megajs');

async function run() {
  try {
    console.log('=== Neon Postgres Database Connection ===');
    const [megaConn] = await sql`SELECT * FROM storage_connections WHERE provider = 'mega' AND is_active = true LIMIT 1`;
    if (!megaConn) {
      console.error('No active MEGA storage connection found in Postgres.');
      return;
    }
    
    // Decrypt credentials
    const { decryptServerPayload } = require('./src/lib/server-crypto');
    const creds = decryptServerPayload(megaConn.encrypted_credentials, megaConn.user_id);
    console.log('Decrypted MEGA Credentials for:', creds.email);

    // Connect to MEGA
    console.log('Connecting to MEGA via email/password...');
    const storage = new Storage({
      email: creds.email,
      password: creds.password,
      userAgent: 'Indra Sovereign Storage/2.0',
      autoload: true
    });

    await storage.ready;
    console.log('✓ MEGA Connected successfully!');

    // Let's examine files
    console.log('\n=== Listing files and inspecting properties ===');
    const fileKeys = Object.keys(storage.files);
    console.log(`Total files index keys: ${fileKeys.length}`);
    
    let count = 0;
    for (const key of fileKeys) {
      const file = storage.files[key];
      if (!file.directory) {
        count++;
        console.log(`\n--- File #${count}: ${file.name} ---`);
        console.log('nodeId:', file.nodeId);
        console.log('size:', file.size);
        console.log('attributes:', JSON.stringify(file.attributes));
        console.log('typeof attributes:', typeof file.attributes);
        console.log('keys on file object:', Object.keys(file));
        
        // Check if there is an attribute download method or property in prototype
        const proto = Object.getPrototypeOf(file);
        console.log('Prototype methods:', Object.getOwnPropertyNames(proto).filter(k => typeof proto[k] === 'function'));
        
        if (count >= 3) break;
      }
    }

  } catch (err) {
    console.error('Error during MEGA metadata inspection:', err);
  } finally {
    await sql.end();
  }
}
run();
