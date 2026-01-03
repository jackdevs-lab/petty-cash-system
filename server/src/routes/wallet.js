const express = require('express');
const router = express.Router();
const db = require('../db/database');
// Get current wallet balance
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
// Get system stateconst systemState = await db.get('SELECT * FROM system_state WHERE id = 1');
res.json({
wallet: {
...wallet,
current_balance: parseFloat(wallet.current_balance)
},
recent_transactions: recentTransactions.map(t => ({
...t,
previous_balance: parseFloat(t.previous_balance),
new_balance: parseFloat(t.new_balance),
delta: parseFloat(t.delta),
mpesa_fee: parseFloat(t.mpesa_fee)
})),
system_state: {
has_open_transaction: !!systemState.open_transaction_id,
open_transaction_id: systemState.open_transaction_id,
system_locked: systemState.system_locked
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
const systemState = await db.get('SELECT open_transaction_id FROM system_state WHERE id = 1');
if (systemState.open_transaction_id) {
return res.status(423).json({ 
error: 'Cannot sync while transaction is open',
open_transaction_id: systemState.open_transaction_id
});
}
await db.run(`
UPDATE wallet 
SET current_balance = ?,last_updated = CURRENT_TIMESTAMP
WHERE id = 1
`, [new_balance]);
// Log this manual sync as a special transaction
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
new_balance, // Previous balance same as new (no change)
new_balance,
0,
0,
new Date().toISOString(),
JSON.stringify({ type: 'manual_sync', timestamp: new Date().toISOString() })
]);
res.json({
message: 'Wallet balance synced manually',
new_balance: new_balance,
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
statusFROM transactions
WHERE status = 'LOCKED'
ORDER BY transaction_date DESC
LIMIT 50
`);
res.json({
history: history.map(h => ({
...h,
balance: parseFloat(h.balance),
delta: parseFloat(h.delta)
}))
});
} catch (error) {
next(error);
}
});
module.exports = router;