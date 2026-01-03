const express = require('express');
const router = express.Router();
const db = require('../db/database');
// Get system status
router.get('/status', async (req, res, next) => {
try {
const [systemState, wallet, openTransaction] = await Promise.all([
db.get('SELECT * FROM system_state WHERE id = 1'),
db.get('SELECT * FROM wallet WHERE id = 1'),
db.get(`
SELECT t.* 
FROM transactions t
JOIN system_state s ON t.id = s.open_transaction_id
WHERE t.status = 'OPEN'
`)
]);
res.json({
system: {
...systemState,
system_locked: !!systemState.open_transaction_id },
            wallet: wallet ? {
                ...wallet,
                current_balance: parseFloat(wallet.current_balance)
            } : null,
            open_transaction: openTransaction ? {
                ...openTransaction,
                previous_balance: parseFloat(openTransaction.previous_balance),
                new_balance: parseFloat(openTransaction.new_balance),
                delta: parseFloat(openTransaction.delta),
                mpesa_fee: parseFloat(openTransaction.mpesa_fee)
            } : null,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
});
// Force unlock system (emergency only)
router.post('/force-unlock', async (req, res, next) => {
    const { reason, admin_code } = req.body;
    
    // Simple admin code check (in production, use proper authentication)
    if (admin_code !== process.env.ADMIN_CODE) {
        return res.status(401).json({ error: 'Invalid admin code' });
    }
    
    try {
        // Get open transaction
        const openTransaction = await db.get(`
            SELECT t.* 
            FROM transactions t
            JOIN system_state s ON t.id = s.open_transaction_id
            WHERE t.status = 'OPEN'
        `);
        
        if (!openTransaction) {
            return res.status(400).json({ error: 'No open transaction found' });
        }
        
        // Delete splits and transaction
        await db.transaction(async () => {
            await db.run('DELETE FROM transaction_splits WHERE transaction_id = ?', 
[openTransaction.id]);
            await db.run('DELETE FROM transactions WHERE id = ?', [openTransaction.id]);
            await db.run('UPDATE system_state SET open_transaction_id = NULL WHERE id = 1');
        });
        
        // Log the force unlock
        console.warn(`SYSTEM FORCE UNLOCKED: ${reason} - Transaction ${openTransaction.id} deleted`);
        
        res.json({
            message: 'System force unlocked',
            deleted_transaction_id: openTransaction.id,
            reason: reason,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
});
// Get system health
router.get('/health', async (req, res, next) => {
    try {
        const checks = {
            database: false,
            wallet: false,
            categories: false,
            schema: false
        };
        
        // Test database connection
        try {
            await db.get('SELECT 1 as test');
            checks.database = true;
        } catch (e) {
            checks.database = false;
        }
        
        // Check wallet exists
        const wallet = await db.get('SELECT 1 FROM wallet WHERE id = 1');
        checks.wallet = !!wallet;
        
        // Check categories exist
        const categories = await db.get('SELECT COUNT(*) as count FROM categories');
        checks.categories = categories && categories.count > 0;
        
        // Check schema integrity
        const integrity = await db.get('PRAGMA integrity_check');checks.schema = integrity && integrity.integrity_check === 'ok';
const isHealthy = Object.values(checks).every(v => v === true);
res.json({
healthy: isHealthy,
checks,
timestamp: new Date().toISOString()
});
} catch (error) {
res.status(500).json({
healthy: false,
error: error.message,
timestamp: new Date().toISOString()
});
}
});
module.exports = router;