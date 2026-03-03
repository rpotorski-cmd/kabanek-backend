#!/usr/bin/env node

/**
 * Railway Start Script (PostgreSQL)
 * Automatycznie inicjalizuje bazę danych jeśli tabele nie istnieją
 */

import pg from 'pg';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

console.log('🚂 Railway Start Script (PostgreSQL)');
console.log('='.repeat(50));

async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL nie jest ustawione!');
    console.log('💡 Na Railway dodaj bazę danych PostgreSQL');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 Sprawdzanie połączenia z PostgreSQL...');
    await pool.query('SELECT 1');
    console.log('✅ Połączenie z PostgreSQL OK');

    // Sprawdź czy tabele istnieją
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'clients'
      );
    `);

    const tablesExist = result.rows[0].exists;

    if (!tablesExist) {
      console.log('📊 Tabele nie istnieją - inicjalizacja bazy danych...');
      try {
        execSync('node initDb.js', { stdio: 'inherit' });
        console.log('✅ Baza danych zainicjalizowana!');
      } catch (error) {
        console.error('❌ Błąd inicjalizacji bazy danych:', error.message);
        await pool.end();
        process.exit(1);
      }
    } else {
      console.log('✅ Tabele już istnieją w bazie danych');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Błąd połączenia z bazą danych:', error.message);
    await pool.end();
    process.exit(1);
  }
}

// Sprawdź bazę danych, potem uruchom serwer
checkDatabase()
  .then(() => {
    console.log('='.repeat(50));
    console.log('🚀 Uruchamianie serwera...');
    console.log('');

    try {
      execSync('node server.js', { stdio: 'inherit' });
    } catch (error) {
      console.error('❌ Błąd uruchomienia serwera:', error.message);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ Błąd startu:', error);
    process.exit(1);
  });
