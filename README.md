# 🐷 KABANEK Backend API

Backend dla systemu zarządzania sprzedażą tuczników.

## 🚀 Stack

- **Node.js** + Express
- **PostgreSQL** (Railway)
- **CORS** enabled
- **Rate limiting** (1000 req/15min)

## 📦 Endpoints

### Health
- `GET /api/health` - Status check

### Clients
- `GET /api/clients` - Lista klientów
- `POST /api/clients` - Dodaj klienta
- `PUT /api/clients/:id` - Edytuj klienta
- `DELETE /api/clients/:id` - Usuń klienta

### Sales
- `GET /api/sales` - Lista sprzedaży
- `POST /api/sales` - Dodaj sprzedaż
- `PUT /api/sales/:id` - Edytuj sprzedaż
- `DELETE /api/sales/:id` - Usuń sprzedaż
- `GET /api/stats/client/:id` - Statystyki klienta
- `GET /api/stats/overview` - Statystyki ogólne

### Deliveries
- `GET /api/deliveries` - Lista dostaw
- `POST /api/deliveries` - Dodaj dostawę
- `PUT /api/deliveries/:id` - Edytuj dostawę
- `DELETE /api/deliveries/:id` - Usuń dostawę

## 🔧 Setup

### Railway (automatyczny)
1. Connect repo to Railway
2. Railway auto-wykrywa Node.js
3. Add PostgreSQL
4. Railway auto-sets DATABASE_URL
5. Deploy! 🎉

### Lokalnie
```bash
npm install
cp .env.example .env
# Edytuj .env z DATABASE_URL
npm start
```

## 🌐 CORS

Backend akceptuje requesty z:
- `*` (wszystkie origins - można zawęzić w production)

## 📊 Database

PostgreSQL z automatyczną inicjalizacją:
- Tabele: clients, sales, deliveries
- Triggers: auto updated_at
- Indexes: optymalizacja queries

## 🔒 Security

- Helmet.js (security headers)
- Rate limiting
- SQL injection protection (parameterized queries)
- CORS configured

## 📝 License

MIT
