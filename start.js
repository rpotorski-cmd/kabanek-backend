const { Pool } = require('pg');
const { execSync } = require('child_process');

console.log('🚂 Railway Start - KABANEK Backend');
console.log('='.repeat(50));

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL missing!');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔍 Checking PostgreSQL...');
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL OK');

    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'clients'
      );
    `);

    if (!result.rows[0].exists) {
      console.log('📊 Initializing database...');
      execSync('node initDb.js', { stdio: 'inherit' });
      console.log('✅ Database initialized!');
    } else {
      console.log('✅ Tables exist');
    }

    await pool.end();
    
    console.log('='.repeat(50));
    console.log('🚀 Starting server...');
    execSync('node server.js', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

start();
