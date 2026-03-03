import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;

// Inicjalizacja połączenia z PostgreSQL
// Optymalizacja dla Railway Pro - zwiększony pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 50, // Railway Pro: zwiększony z 20 do 50 dla lepszej wydajności
  min: 10, // Railway Pro: minimum połączeń zawsze aktywnych
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test połączenia
pool.on('connect', () => {
  console.log('✅ Połączono z PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Nieoczekiwany błąd połączenia PostgreSQL:', err);
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());

// Rate limiting - zwiększony dla Railway Pro
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 1000, // Railway Pro: zwiększone z 100 do 1000 requestów
  message: { success: false, error: 'Zbyt wiele requestów, spróbuj ponownie za chwilę' }
});
app.use(limiter);

// Helper funkcje
const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Helper do konwersji numerycznych wartości z PostgreSQL
const parseNumeric = (value) => value ? parseFloat(value) : null;

// ==================== KLIENCI (ROLNICY) ====================

// GET wszystkich klientów
app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error in GET /api/clients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET pojedynczego klienta
app.get('/api/clients/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Klient nie znaleziony' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error in GET /api/clients/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST nowy klient
app.post('/api/clients', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Nazwa klienta jest wymagana' });
    }

    const id = generateId('client');
    await pool.query(
      'INSERT INTO clients (id, name, created_at) VALUES ($1, $2, $3)',
      [id, name.trim(), Date.now()]
    );

    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error in POST /api/clients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT aktualizacja klienta
app.put('/api/clients/:id', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Nazwa klienta jest wymagana' });
    }

    const result = await pool.query(
      'UPDATE clients SET name = $1 WHERE id = $2 RETURNING *',
      [name.trim(), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Klient nie znaleziony' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error in PUT /api/clients/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE klient
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Klient nie znaleziony' });
    }

    res.json({ success: true, message: 'Klient usunięty' });
  } catch (error) {
    console.error('Error in DELETE /api/clients/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SPRZEDAŻ ====================

// GET wszystkie sprzedaże (z opcjonalnym filtrowaniem)
app.get('/api/sales', async (req, res) => {
  try {
    const { client_id, from_date, to_date } = req.query;
    
    let query = 'SELECT * FROM sales WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (client_id) {
      query += ` AND client_id = $${paramIndex}`;
      params.push(client_id);
      paramIndex++;
    }

    if (from_date) {
      query += ` AND date >= $${paramIndex}`;
      params.push(parseInt(from_date));
      paramIndex++;
    }

    if (to_date) {
      query += ` AND date <= $${paramIndex}`;
      params.push(parseInt(to_date));
      paramIndex++;
    }

    query += ' ORDER BY date DESC';

    const result = await pool.query(query, params);
    
    // Konwertuj DECIMAL na number
    const sales = result.rows.map(row => ({
      ...row,
      avg_weight: parseNumeric(row.avg_weight),
      farmer_price: parseNumeric(row.farmer_price),
      factory_price: parseNumeric(row.factory_price),
      trade_premium: parseNumeric(row.trade_premium)
    }));

    res.json({ success: true, data: sales });
  } catch (error) {
    console.error('Error in GET /api/sales:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET pojedyncza sprzedaż
app.get('/api/sales/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Sprzedaż nie znaleziona' });
    }

    const sale = {
      ...result.rows[0],
      avg_weight: parseNumeric(result.rows[0].avg_weight),
      farmer_price: parseNumeric(result.rows[0].farmer_price),
      factory_price: parseNumeric(result.rows[0].factory_price),
      trade_premium: parseNumeric(result.rows[0].trade_premium)
    };

    res.json({ success: true, data: sale });
  } catch (error) {
    console.error('Error in GET /api/sales/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST nowa sprzedaż
app.post('/api/sales', async (req, res) => {
  try {
    const { client_id, date, quantity, avg_weight, farmer_price, factory_price, trade_premium, notes } = req.body;
    
    // Walidacja
    if (!client_id || !date || !quantity || !avg_weight || farmer_price === undefined || factory_price === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Wymagane pola: client_id, date, quantity, avg_weight, farmer_price, factory_price' 
      });
    }

    // Sprawdź czy klient istnieje
    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [client_id]);
    if (clientCheck.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Klient nie istnieje' });
    }

    const id = generateId('sale');
    await pool.query(
      `INSERT INTO sales (id, client_id, date, quantity, avg_weight, farmer_price, factory_price, trade_premium, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id, 
        client_id, 
        parseInt(date), 
        parseInt(quantity), 
        parseFloat(avg_weight),
        parseFloat(farmer_price),
        parseFloat(factory_price),
        parseFloat(trade_premium || 0),
        notes || null,
        Date.now()
      ]
    );

    const result = await pool.query('SELECT * FROM sales WHERE id = $1', [id]);
    const sale = {
      ...result.rows[0],
      avg_weight: parseNumeric(result.rows[0].avg_weight),
      farmer_price: parseNumeric(result.rows[0].farmer_price),
      factory_price: parseNumeric(result.rows[0].factory_price),
      trade_premium: parseNumeric(result.rows[0].trade_premium)
    };

    res.status(201).json({ success: true, data: sale });
  } catch (error) {
    console.error('Error in POST /api/sales:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT aktualizacja sprzedaży
app.put('/api/sales/:id', async (req, res) => {
  try {
    const { client_id, date, quantity, avg_weight, farmer_price, factory_price, trade_premium, notes } = req.body;
    
    if (!client_id || !date || !quantity || !avg_weight || farmer_price === undefined || factory_price === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Wymagane pola: client_id, date, quantity, avg_weight, farmer_price, factory_price' 
      });
    }

    const result = await pool.query(
      `UPDATE sales 
       SET client_id = $1, date = $2, quantity = $3, avg_weight = $4, 
           farmer_price = $5, factory_price = $6, trade_premium = $7, notes = $8
       WHERE id = $9
       RETURNING *`,
      [
        client_id,
        parseInt(date),
        parseInt(quantity),
        parseFloat(avg_weight),
        parseFloat(farmer_price),
        parseFloat(factory_price),
        parseFloat(trade_premium || 0),
        notes || null,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Sprzedaż nie znaleziona' });
    }

    const sale = {
      ...result.rows[0],
      avg_weight: parseNumeric(result.rows[0].avg_weight),
      farmer_price: parseNumeric(result.rows[0].farmer_price),
      factory_price: parseNumeric(result.rows[0].factory_price),
      trade_premium: parseNumeric(result.rows[0].trade_premium)
    };

    res.json({ success: true, data: sale });
  } catch (error) {
    console.error('Error in PUT /api/sales/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE sprzedaż
app.delete('/api/sales/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM sales WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Sprzedaż nie znaleziona' });
    }

    res.json({ success: true, message: 'Sprzedaż usunięta' });
  } catch (error) {
    console.error('Error in DELETE /api/sales/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DOSTAWY ====================

// GET wszystkie dostawy
app.get('/api/deliveries', async (req, res) => {
  try {
    const { client_id, from_date, to_date } = req.query;
    
    let query = 'SELECT * FROM deliveries WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (client_id) {
      query += ` AND client_id = $${paramIndex}`;
      params.push(client_id);
      paramIndex++;
    }

    if (from_date) {
      query += ` AND date >= $${paramIndex}`;
      params.push(parseInt(from_date));
      paramIndex++;
    }

    if (to_date) {
      query += ` AND date <= $${paramIndex}`;
      params.push(parseInt(to_date));
      paramIndex++;
    }

    query += ' ORDER BY date DESC';

    const result = await pool.query(query, params);
    
    // Konwertuj DECIMAL na number
    const deliveries = result.rows.map(row => ({
      ...row,
      avg_weight: parseNumeric(row.avg_weight),
      price: parseNumeric(row.price)
    }));

    res.json({ success: true, data: deliveries });
  } catch (error) {
    console.error('Error in GET /api/deliveries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET pojedyncza dostawa
app.get('/api/deliveries/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM deliveries WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Dostawa nie znaleziona' });
    }

    const delivery = {
      ...result.rows[0],
      avg_weight: parseNumeric(result.rows[0].avg_weight),
      price: parseNumeric(result.rows[0].price)
    };

    res.json({ success: true, data: delivery });
  } catch (error) {
    console.error('Error in GET /api/deliveries/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST nowa dostawa
app.post('/api/deliveries', async (req, res) => {
  try {
    const { client_id, date, quantity, avg_weight, price, notes } = req.body;
    
    if (!client_id || !date || !quantity || !avg_weight || price === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Wymagane pola: client_id, date, quantity, avg_weight, price' 
      });
    }

    // Sprawdź czy klient istnieje
    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [client_id]);
    if (clientCheck.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Klient nie istnieje' });
    }

    const id = generateId('delivery');
    await pool.query(
      `INSERT INTO deliveries (id, client_id, date, quantity, avg_weight, price, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        client_id,
        parseInt(date),
        parseInt(quantity),
        parseFloat(avg_weight),
        parseFloat(price),
        notes || null,
        Date.now()
      ]
    );

    const result = await pool.query('SELECT * FROM deliveries WHERE id = $1', [id]);
    const delivery = {
      ...result.rows[0],
      avg_weight: parseNumeric(result.rows[0].avg_weight),
      price: parseNumeric(result.rows[0].price)
    };

    res.status(201).json({ success: true, data: delivery });
  } catch (error) {
    console.error('Error in POST /api/deliveries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT aktualizacja dostawy
app.put('/api/deliveries/:id', async (req, res) => {
  try {
    const { client_id, date, quantity, avg_weight, price, notes } = req.body;
    
    if (!client_id || !date || !quantity || !avg_weight || price === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Wymagane pola: client_id, date, quantity, avg_weight, price' 
      });
    }

    const result = await pool.query(
      `UPDATE deliveries 
       SET client_id = $1, date = $2, quantity = $3, avg_weight = $4, price = $5, notes = $6
       WHERE id = $7
       RETURNING *`,
      [
        client_id,
        parseInt(date),
        parseInt(quantity),
        parseFloat(avg_weight),
        parseFloat(price),
        notes || null,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Dostawa nie znaleziona' });
    }

    const delivery = {
      ...result.rows[0],
      avg_weight: parseNumeric(result.rows[0].avg_weight),
      price: parseNumeric(result.rows[0].price)
    };

    res.json({ success: true, data: delivery });
  } catch (error) {
    console.error('Error in PUT /api/deliveries/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE dostawa
app.delete('/api/deliveries/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM deliveries WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Dostawa nie znaleziona' });
    }

    res.json({ success: true, message: 'Dostawa usunięta' });
  } catch (error) {
    console.error('Error in DELETE /api/deliveries/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== STATYSTYKI & RAPORTY ====================

// GET statystyki sprzedaży dla klienta
app.get('/api/stats/client/:id', async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    
    let dateFilter = '';
    const params = [req.params.id];
    let paramIndex = 2;
    
    if (from_date && to_date) {
      dateFilter = `AND date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(parseInt(from_date), parseInt(to_date));
    }

    // Statystyki sprzedaży
    const salesResult = await pool.query(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(quantity) as total_quantity,
        SUM(quantity * avg_weight) as total_weight,
        AVG(avg_weight) as avg_weight,
        AVG(farmer_price) as avg_farmer_price,
        AVG(factory_price) as avg_factory_price
      FROM sales 
      WHERE client_id = $1 ${dateFilter}`,
      params
    );

    // Statystyki dostaw
    const deliveryResult = await pool.query(
      `SELECT 
        COUNT(*) as total_deliveries,
        SUM(quantity) as total_quantity,
        SUM(quantity * avg_weight) as total_weight,
        AVG(price) as avg_price
      FROM deliveries 
      WHERE client_id = $1 ${dateFilter}`,
      params
    );

    const salesStats = {
      total_transactions: parseInt(salesResult.rows[0].total_transactions) || 0,
      total_quantity: parseInt(salesResult.rows[0].total_quantity) || 0,
      total_weight: parseNumeric(salesResult.rows[0].total_weight) || 0,
      avg_weight: parseNumeric(salesResult.rows[0].avg_weight) || 0,
      avg_farmer_price: parseNumeric(salesResult.rows[0].avg_farmer_price) || 0,
      avg_factory_price: parseNumeric(salesResult.rows[0].avg_factory_price) || 0
    };

    const deliveryStats = {
      total_deliveries: parseInt(deliveryResult.rows[0].total_deliveries) || 0,
      total_quantity: parseInt(deliveryResult.rows[0].total_quantity) || 0,
      total_weight: parseNumeric(deliveryResult.rows[0].total_weight) || 0,
      avg_price: parseNumeric(deliveryResult.rows[0].avg_price) || 0
    };

    res.json({ 
      success: true, 
      data: {
        sales: salesStats,
        deliveries: deliveryStats
      }
    });
  } catch (error) {
    console.error('Error in GET /api/stats/client/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET ogólne statystyki
app.get('/api/stats/overview', async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (from_date && to_date) {
      dateFilter = 'WHERE date BETWEEN $1 AND $2';
      params.push(parseInt(from_date), parseInt(to_date));
    }

    const totalClients = await pool.query('SELECT COUNT(*) as count FROM clients');
    
    const salesOverview = await pool.query(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(quantity) as total_pigs,
        SUM(quantity * avg_weight) as total_weight,
        AVG(factory_price - farmer_price) as avg_margin
      FROM sales ${dateFilter}`,
      params
    );

    const deliveriesOverview = await pool.query(
      `SELECT 
        COUNT(*) as total_deliveries,
        SUM(quantity) as total_pigs,
        SUM(quantity * avg_weight) as total_weight
      FROM deliveries ${dateFilter}`,
      params
    );

    res.json({
      success: true,
      data: {
        clients: parseInt(totalClients.rows[0].count),
        sales: {
          total_transactions: parseInt(salesOverview.rows[0].total_transactions) || 0,
          total_pigs: parseInt(salesOverview.rows[0].total_pigs) || 0,
          total_weight: parseNumeric(salesOverview.rows[0].total_weight) || 0,
          avg_margin: parseNumeric(salesOverview.rows[0].avg_margin) || 0
        },
        deliveries: {
          total_deliveries: parseInt(deliveriesOverview.rows[0].total_deliveries) || 0,
          total_pigs: parseInt(deliveriesOverview.rows[0].total_pigs) || 0,
          total_weight: parseNumeric(deliveriesOverview.rows[0].total_weight) || 0
        }
      }
    });
  } catch (error) {
    console.error('Error in GET /api/stats/overview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', async (req, res) => {
  try {
    // Test połączenia z bazą
    await pool.query('SELECT 1');
    res.json({ 
      success: true, 
      status: 'OK',
      timestamp: Date.now(),
      database: 'connected (PostgreSQL)'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      status: 'ERROR',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Wewnętrzny błąd serwera' 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint nie znaleziony' 
  });
});

// Start serwera
app.listen(PORT, () => {
  console.log(`🚀 Serwer KABANEK API uruchomiony na porcie ${PORT}`);
  console.log(`📊 Dokumentacja API: http://localhost:${PORT}/api/health`);
  console.log(`🗄️  Baza danych: PostgreSQL`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Zamykanie połączeń z bazą danych...');
  await pool.end();
  console.log('👋 Serwer zatrzymany');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 Zamykanie połączeń z bazą danych...');
  await pool.end();
  console.log('👋 Serwer zatrzymany');
  process.exit(0);
});
