const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Get current wallet balance + recent transactions + system state
router.get('/', async (req, res, next) => {
  try {
    const wallet = await db.get('SELECT * FROM wallet WHERE id = 1');
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not initialized' });
    }

    // Get recent transactions
    const recentTransactions = await db.all(`
      SELECT 
        id,
        mpesa_transaction_id,
        previous_balance,
        new_balance,
        delta,
        mpesa_fee,
        transaction_date,
        status,
        locked_at
      FROM transactions
      ORDER BY transaction_date DESC
      LIMIT 10
    `);

    // Get system state (fixed variable name)
    const system_state = await db.get('SELECT * FROM system_state WHERE id = 1');

    res.json({
      wallet: {
        ...wallet,
        current_balance: parseFloat(wallet.current_balance)
      },
      recent_transactions: recentTransactions.map(t => ({
        ...t,
        previous_balance: parseFloat(t.previous_balance || 0),
        new_balance: parseFloat(t.new_balance || 0),
        delta: parseFloat(t.delta || 0),
        mpesa_fee: parseFloat(t.mpesa_fee || 0)
      })),
      system_state: {
        has_open_transaction: !!system_state?.open_transaction_id,
        open_transaction_id: system_state?.open_transaction_id || null
        // Removed system_locked — it doesn't exist in your schema
      }
    });
  } catch (error) {
    next(error);
  }
});

// Force sync wallet balance from M-Pesa (manual override)
router.post('/sync', async (req, res, next) => {
  try {
    const { new_balance } = req.body;
    if (typeof new_balance !== 'number' || new_balance < 0) {
      return res.status(400).json({ error: 'Valid balance required' });
    }

    // Check if there's an open transaction
    const system_state = await db.get('SELECT open_transaction_id FROM system_state WHERE id = 1');
    if (system_state?.open_transaction_id) {
      return res.status(423).json({ 
        error: 'Cannot sync while transaction is open',
        open_transaction_id: system_state.open_transaction_id
      });
    }

    const previousWallet = await db.get('SELECT current_balance FROM wallet WHERE id = 1');

    await db.run(`
      UPDATE wallet 
      SET current_balance = ?, last_updated = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [new_balance]);

    // Log manual sync as a special locked transaction
    await db.run(`
      INSERT INTO transactions (
        mpesa_transaction_id,
        previous_balance,
        new_balance,
        delta,
        mpesa_fee,
        transaction_date,
        status,
        raw_daraja_json
      ) VALUES (?, ?, ?, ?, ?, ?, 'LOCKED', ?)
    `, [
      `MANUAL_SYNC_${Date.now()}`,
      previousWallet?.current_balance || 0,
      new_balance,
      new_balance - (previousWallet?.current_balance || 0),
      0,
      new Date().toISOString(),
      JSON.stringify({ type: 'manual_sync', timestamp: new Date().toISOString(), initiated_by: 'admin' })
    ]);

    res.json({
      message: 'Wallet balance synced manually',
      new_balance,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// Get wallet balance history
router.get('/history', async (req, res, next) => {
  try {
    const history = await db.all(`
      SELECT 
        transaction_date as date,
        new_balance as balance,
        delta,
        mpesa_transaction_id,
        status
      FROM transactions
      WHERE status = 'LOCKED'
      ORDER BY transaction_date DESC
      LIMIT 50
    `);

    res.json({
      history: history.map(h => ({
        ...h,
        balance: parseFloat(h.balance || 0),
        delta: parseFloat(h.delta || 0)
      }))
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;