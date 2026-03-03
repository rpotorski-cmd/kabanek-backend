import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Połączenie z bazą danych
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('🗄️  Inicjalizacja bazy danych PostgreSQL...');

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    // Rozpocznij transakcję
    await client.query('BEGIN');

    console.log('📋 Tworzenie tabel...');

    // Tabela klientów (rolników)
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
        updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      );
    `);

    // Tabela sprzedaży
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        date BIGINT NOT NULL,
        quantity INTEGER NOT NULL,
        avg_weight DECIMAL(10,2) NOT NULL,
        farmer_price DECIMAL(10,2) NOT NULL,
        factory_price DECIMAL(10,2) NOT NULL,
        trade_premium DECIMAL(10,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
        updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      );
    `);

    // Tabela dostaw
    await client.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        date BIGINT NOT NULL,
        quantity INTEGER NOT NULL,
        avg_weight DECIMAL(10,2) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        notes TEXT,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
        updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      );
    `);

    console.log('📊 Tworzenie indeksów...');

    // Indeksy dla lepszej wydajności
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
      CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
      CREATE INDEX IF NOT EXISTS idx_deliveries_client ON deliveries(client_id);
      CREATE INDEX IF NOT EXISTS idx_deliveries_date ON deliveries(date);
    `);

    console.log('⚡ Tworzenie triggerów...');

    // Funkcja do aktualizacji updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Triggery do automatycznej aktualizacji updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS update_clients_timestamp ON clients;
      CREATE TRIGGER update_clients_timestamp
        BEFORE UPDATE ON clients
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_sales_timestamp ON sales;
      CREATE TRIGGER update_sales_timestamp
        BEFORE UPDATE ON sales
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_deliveries_timestamp ON deliveries;
      CREATE TRIGGER update_deliveries_timestamp
        BEFORE UPDATE ON deliveries
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✅ Tabele utworzone pomyślnie!');

    // Dodaj przykładowe dane testowe (jeśli tabela clients jest pusta)
    const { rows } = await client.query('SELECT COUNT(*) as count FROM clients');
    
    if (parseInt(rows[0].count) === 0) {
      console.log('📝 Dodawanie przykładowych klientów...');
      
      const testClients = [
        ['client_1', 'Jan Kowalski'],
        ['client_2', 'Anna Nowak'],
        ['client_3', 'Piotr Wiśniewski']
      ];

      for (const [id, name] of testClients) {
        await client.query(
          'INSERT INTO clients (id, name, created_at) VALUES ($1, $2, $3)',
          [id, name, Date.now()]
        );
      }

      console.log('✅ Przykładowi klienci dodani!');
    } else {
      console.log('ℹ️  Klienci już istnieją w bazie danych');
    }

    // Zatwierdź transakcję
    await client.query('COMMIT');
    console.log('✅ Baza danych gotowa do użycia!');

  } catch (error) {
    // Cofnij transakcję w razie błędu
    await client.query('ROLLBACK');
    console.error('❌ Błąd inicjalizacji bazy danych:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Uruchom inicjalizację
initializeDatabase()
  .then(() => {
    console.log('🎉 Inicjalizacja zakończona!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Inicjalizacja nie powiodła się:', error);
    process.exit(1);
  });
