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

async function run() {
  try {
    console.log('=== Neon Postgres Database Diagnostic ===');
    console.log('Querying storage_connections...');
    const storageConns = await sql`SELECT * FROM storage_connections`;
    console.log('storageConns:', JSON.stringify(storageConns, null, 2));

    console.log('\nQuerying integrations...');
    const traditional = await sql`SELECT * FROM integrations`;
    console.log('integrations:', JSON.stringify(traditional, null, 2));
    
  } catch (err) {
    console.error('Error during database check:', err);
  } finally {
    await sql.end();
  }
}
run();
