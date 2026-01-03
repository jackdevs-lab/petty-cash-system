const express = require('express');
const router = express.Router();
const db = require('../db/database');
const Decimal = require('decimal.js');
const { body, validationResult } = require('express-validator');
// Validation middleware
const validateTransaction = [
body('mpesa_transaction_id').isString().notEmpty().trim(),
body('mpesa_reference').optional().isString().trim(),
body('previous_balance').isFloat({ min: 0 }).toFloat(),
body('new_balance').isFloat({ min: 0 }).toFloat(),
body('mpesa_fee').optional().isFloat({ min: 0 }).toFloat(),
body('transaction_date').isISO8601().toDate(),
body('raw_daraja_json').optional().isString(),
body('raw_sms_text').optional().isString()
];
const validateSplit = [
body('*.category_id').isInt({ min: 1 }),
body('*.amount').isFloat({ gt: 0 }).toFloat(),
body('*.description').optional().isString().trim()
];
// Get all transactions
router.get('/', async (req, res, next) => {
try {
const transactions = await db.all(`
SELECT t.*, 
COUNT(ts.id) as split_count,
CASE 
WHEN t.status = 'OPEN' THEN 'Pending Classification'
ELSE 'Completed'
END as display_status
FROM transactions t
LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
GROUP BY t.id
ORDER BY t.transaction_date DESC, t.created_at DESC
LIMIT 100
`);
// Format amounts for display
const formatted = transactions.map(t => ({ ...t,
            previous_balance: parseFloat(t.previous_balance),
            new_balance: parseFloat(t.new_balance),
            delta: parseFloat(t.delta),
            mpesa_fee: parseFloat(t.mpesa_fee),
            total_classified_amount: parseFloat(t.total_classified_amount)
        }));
        
        res.json({ transactions: formatted });
    } catch (error) {
        next(error);
    }
});
// Get open transaction (if any)
router.get('/open', async (req, res, next) => {
    try {
        const openTransaction = await db.get(`
            SELECT t.* 
            FROM transactions t
            JOIN system_state s ON t.id = s.open_transaction_id
            WHERE t.status = 'OPEN'
        `);
        
        if (!openTransaction) {
            return res.json({ transaction: null });
        }
        
        // Get splits for open transaction
        const splits = await db.all(`
            SELECT ts.*, c.name as category_name, c.parent_id
            FROM transaction_splits ts
            JOIN categories c ON ts.category_id = c.id
            WHERE ts.transaction_id = ?
            ORDER BY ts.created_at
        `, [openTransaction.id]);
        
        // Calculate remaining amount
        const delta = new Decimal(openTransaction.delta);
        const fee = new Decimal(openTransaction.mpesa_fee || 0);
        const classifiedTotal = splits.reduce((sum, split) => 
            sum.plus(split.amount), new Decimal(0));
        
        const remaining = delta.minus(fee).minus(classifiedTotal);
        
        res.json({
            transaction: {...openTransaction,
previous_balance: parseFloat(openTransaction.previous_balance),
new_balance: parseFloat(openTransaction.new_balance),
delta: parseFloat(openTransaction.delta),
mpesa_fee: parseFloat(openTransaction.mpesa_fee)
},
splits,
remaining_amount: remaining.toNumber(),
classified_total: classifiedTotal.toNumber()
});
} catch (error) {
next(error);
}
});
// Create new transaction from M-Pesa
router.post('/', validateTransaction, async (req, res, next) => {
const errors = validationResult(req);
if (!errors.isEmpty()) {
return res.status(400).json({ errors: errors.array() });
}
try {
const {
mpesa_transaction_id,
mpesa_reference,
previous_balance,
new_balance,
transaction_date,
raw_daraja_json,
raw_sms_text
} = req.body;
// Calculate delta and fee
const delta = new Decimal(new_balance).minus(previous_balance);
const absDelta = delta.abs();
// Auto-detect M-Pesa fee (common Kenyan rates)
let mpesa_fee = new Decimal(0);
if (absDelta.gt(0)) {
// Standard M-Pesa withdrawal fees in Kenya
if (absDelta.lte(100)) mpesa_fee = new Decimal(7);
else if (absDelta.lte(500)) mpesa_fee = new Decimal(13);
else if (absDelta.lte(1000)) mpesa_fee = new Decimal(25);
else if (absDelta.lte(1500)) mpesa_fee = new Decimal(33);
else if (absDelta.lte(2500)) mpesa_fee = new Decimal(48);
else if (absDelta.lte(3500)) mpesa_fee = new Decimal(60);else if (absDelta.lte(5000)) mpesa_fee = new Decimal(75);
            else if (absDelta.lte(7500)) mpesa_fee = new Decimal(87);
            else if (absDelta.lte(10000)) mpesa_fee = new Decimal(99);
            else if (absDelta.lte(15000)) mpesa_fee = new Decimal(110);
            else if (absDelta.lte(20000)) mpesa_fee = new Decimal(121);
            else mpesa_fee = new Decimal(165); // Max for over 20,000
        }
        // Check if transaction already exists
        const existing = await db.get(
            'SELECT id FROM transactions WHERE mpesa_transaction_id = ?',
            [mpesa_transaction_id]
        );
        
        if (existing) {
            return res.status(409).json({ 
                error: 'Transaction already exists',
                transaction_id: existing.id 
            });
        }
        // Check if there's already an open transaction
        const systemState = await db.get('SELECT open_transaction_id FROM system_state WHERE id = 1');
        if (systemState.open_transaction_id) {
            return res.status(423).json({ 
                error: 'System locked - Another transaction is open',
                open_transaction_id: systemState.open_transaction_id
            });
        }
        // Create transaction in database
        const result = await db.run(`
            INSERT INTO transactions (
                mpesa_transaction_id,
                mpesa_reference,
                previous_balance,
                new_balance,
                delta,
                mpesa_fee,
                transaction_date,
                status,
                raw_daraja_json,
                raw_sms_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
        `, [
            mpesa_transaction_id,mpesa_reference,
previous_balance,
new_balance,
delta.toNumber(),
mpesa_fee.toNumber(),
transaction_date,
raw_daraja_json,
raw_sms_text
]);
// Auto-classify M-Pesa fee if present
if (mpesa_fee.gt(0)) {
const mpesaCategory = await db.get(
'SELECT id FROM categories WHERE name = "M-Pesa Fees" AND is_system_category = 1'
);
if (mpesaCategory) {
await db.run(`
INSERT INTO transaction_splits (transaction_id, category_id, amount, description)
VALUES (?, ?, ?, ?)
`, [result.id, mpesaCategory.id, mpesa_fee.toNumber(), 'Auto-classified M-Pesa transaction fee']);
}
}
res.status(201).json({
message: 'Transaction created and locked for classification',
transaction_id: result.id,
delta: delta.toNumber(),
mpesa_fee: mpesa_fee.toNumber(),
remaining_to_classify: delta.minus(mpesa_fee).toNumber(),
system_locked: true
});
} catch (error) {
next(error);
}
});
// Add splits to open transaction
router.post('/:id/splits', validateSplit, async (req, res, next) => {
const errors = validationResult(req);
if (!errors.isEmpty()) {
return res.status(400).json({ errors: errors.array() });
}const transactionId = parseInt(req.params.id);
    const splits = req.body;
    try {
        // Verify transaction exists and is open
        const transaction = await db.get(
            'SELECT id, status, delta, mpesa_fee FROM transactions WHERE id = ?',
            [transactionId]
        );
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        if (transaction.status !== 'OPEN') {
            return res.status(400).json({ error: 'Transaction is not open for classification' });
        }
        // Verify categories exist
        const categoryIds = splits.map(s => s.category_id);
        const categories = await db.all(
            `SELECT id FROM categories WHERE id IN (${categoryIds.map(() => '?').join
(',')})`,
            categoryIds
        );
        
        if (categories.length !== splits.length) {
            return res.status(400).json({ error: 'One or more categories not found' 
});
        }
        // Calculate totals
        const delta = new Decimal(transaction.delta);
        const fee = new Decimal(transaction.mpesa_fee || 0);
        const existingSplits = await db.all(
            'SELECT amount FROM transaction_splits WHERE transaction_id = ?',
            [transactionId]
        );
        
        const existingTotal = existingSplits.reduce((sum, split) => 
            sum.plus(split.amount), new Decimal(0));
        
        const newTotal = splits.reduce((sum, split) => 
            sum.plus(split.amount), new Decimal(0));

        const totalAfterAdd = existingTotal.plus(newTotal); const maxAllowed = delta.minus(fee).abs(); // Use absolute value for both deposits and withdrawals

        if (totalAfterAdd.gt(maxAllowed)) {
            return res.status(400).json({
                error: 'Total splits exceed remaining amount',
                max_allowed: maxAllowed.toNumber(),
                current_total: existingTotal.toNumber(),
                attempted_addition: newTotal.toNumber()
            });
        }
        // Insert splits in transaction
        await db.transaction(async () => {
            for (const split of splits) {
                await db.run(`
                    INSERT INTO transaction_splits (transaction_id, category_id, amount, description)
                    VALUES (?, ?, ?, ?)
                `, [transactionId, split.category_id, split.amount, split.description || '']);
            }
        });
        // Return updated totals
        const updatedSplits = await db.all(
            'SELECT * FROM transaction_splits WHERE transaction_id = ? ORDER BY created_at',
            [transactionId]
        );
        
        const classifiedTotal = updatedSplits.reduce((sum, split) => 
            sum.plus(split.amount), new Decimal(0));
        
        const remaining = delta.minus(fee).minus(classifiedTotal);
        
        res.json({
            message: 'Splits added successfully',
            transaction_id: transactionId,
            splits_added: splits.length,
            classified_total: classifiedTotal.toNumber(),
            remaining_amount: remaining.toNumber(),
            is_balanced: remaining.abs().lt(0.01) // Consider balanced if within 0.01
        });
    } catch (error) {
        next(error);
    }});
// Lock transaction (finalize classification)
router.post('/:id/lock', async (req, res, next) => {
const transactionId = parseInt(req.params.id);
try {
// Get transaction with validation
const transaction = await db.get(`
SELECT t.*, 
COUNT(ts.id) as split_count,
SUM(ts.amount) as split_total
FROM transactions t
LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
WHERE t.id = ?
GROUP BY t.id
`, [transactionId]);
if (!transaction) {
return res.status(404).json({ error: 'Transaction not found' });
}
if (transaction.status === 'LOCKED') {
return res.status(400).json({ error: 'Transaction already locked' });
}
// Validate mathematical balance
const delta = new Decimal(transaction.delta);
const fee = new Decimal(transaction.mpesa_fee || 0);
const splitTotal = new Decimal(transaction.split_total || 0);
const expectedTotal = delta.minus(fee);
const difference = expectedTotal.minus(splitTotal);
if (difference.abs().gte(0.01)) { // Allow 0.01 rounding tolerance
return res.status(400).json({
error: 'Transaction not balanced',
delta: delta.toNumber(),
mpesa_fee: fee.toNumber(),
classified_amount: splitTotal.toNumber(),
difference: difference.toNumber(),
required_action: 'Adjust splits to match remaining amount'
});
}
// Lock the transaction
await db.run(`UPDATE transactions 
SET status = 'LOCKED', 
locked_at = CURRENT_TIMESTAMP 
WHERE id = ?
`, [transactionId]);
// Update wallet balance
await db.run(`
UPDATE wallet 
SET current_balance = ?,
last_updated = CURRENT_TIMESTAMP
WHERE id = 1
`, [transaction.new_balance]);
res.json({
message: 'Transaction locked successfully',
transaction_id: transactionId,
new_balance: parseFloat(transaction.new_balance),
system_unlocked: true
});
} catch (error) {
next(error);
}
});
// Delete a split (only from open transaction)
router.delete('/splits/:splitId', async (req, res, next) => {
const splitId = parseInt(req.params.splitId);
try {
// Get split with transaction status
const split = await db.get(`
SELECT ts.*, t.status 
FROM transaction_splits ts
JOIN transactions t ON ts.transaction_id = t.id
WHERE ts.id = ?
`, [splitId]);
if (!split) {
return res.status(404).json({ error: 'Split not found' });
}
if (split.status === 'LOCKED') {
return res.status(400).json({ error: 'Cannot delete split from locked transaction' });
}
await db.run('DELETE FROM transaction_splits WHERE id = ?', [splitId]);
res.json({
message: 'Split deleted successfully',
split_id: splitId
});
} catch (error) {
next(error);
}
});
module.exports = router;