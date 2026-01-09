// src/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const app = require('./app');
const db = require('./db/database');
const darajaService = require('./services/darajaService');
const transactionService = require('./services/transactionService'); // ← Added

const PORT = process.env.PORT || 3000;

// === Add Classification API Routes ===
app.get('/api/transaction/open', async (req, res) => {
  try {
    const data = await transactionService.getOpenTransaction();
    res.json(data || { transaction: null, splits: [] });
  } catch (err) {
    console.error('Error fetching open transaction:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transaction/:id/splits', async (req, res) => {
  try {
    await transactionService.addSplits(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Error adding splits:', err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/transaction/:id/lock', async (req, res) => {
  try {
    await transactionService.lockTransaction(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error locking transaction:', err);
    res.status(400).json({ error: err.message });
  }
});

// Emergency force unlock - protect this in production!
app.post('/api/system/force-unlock', async (req, res) => {
  try {
    const { reason, adminCode } = req.body;
    await transactionService.forceUnlockSystem(reason || 'No reason provided', adminCode);
    res.json({ success: true });
  } catch (err) {
    console.error('Force unlock failed:', err);
    res.status(403).json({ error: err.message });
  }
});

// === End of Classification Routes ===

// Start the server
db.initializeDatabase().then(async () => {
  console.log('Database initialized successfully');

  try {
    await darajaService.registerC2BUrls();
    console.log('C2B URLs registered successfully');
  } catch (err) {
    console.error('Failed to register C2B URLs:', err.message || err);
  }

  app.listen(PORT, () => {
    console.log(`Petty Cash System running on port ${PORT}`);
    console.log(`Access frontend at: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  db.close();
  process.exit(0);
});