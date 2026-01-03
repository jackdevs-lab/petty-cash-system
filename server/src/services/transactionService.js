const db = require('../db/database');
const Decimal = require('decimal.js');
class TransactionService {
/**
* Validate transaction data before creation
*/
async validateTransactionData(data) {
const errors = [];
// Check required fields
const required = ['mpesa_transaction_id', 'previous_balance', 'new_balance','transaction_date'];
        required.forEach(field => {
            if (!data[field] && data[field] !== 0) {
                errors.push(`${field} is required`);
            }
        });
        
        // Validate numeric fields
        if (typeof data.previous_balance !== 'number' || data.previous_balance < 0) {
            errors.push('previous_balance must be a positive number');
        }
        
        if (typeof data.new_balance !== 'number' || data.new_balance < 0) {
            errors.push('new_balance must be a positive number');
        }
        
        // Check for duplicate transaction
        const existing = await db.get(
            'SELECT id FROM transactions WHERE mpesa_transaction_id = ?',
            [data.mpesa_transaction_id]
        );
        
        if (existing) {
            errors.push(`Transaction ${data.mpesa_transaction_id} already exists`);
        }
        
        // Calculate and validate delta
        const delta = new Decimal(data.new_balance).minus(data.previous_balance);
        if (!delta.isFinite()) {
            errors.push('Invalid balance calculation');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            delta: delta.toNumber()
        };
    }
    /**
     * Calculate M-Pesa fee based on Kenyan rates
     */
    calculateMpesaFee(amount) {
        const absAmount = Math.abs(amount);
        let fee = 0;
        
        // Standard M-Pesa withdrawal fees (as of 2024)
        if (absAmount <= 100) fee = 7;
        else if (absAmount <= 500) fee = 13;
        else if (absAmount <= 1000) fee = 25;
        else if (absAmount <= 1500) fee = 33;
        else if (absAmount <= 2500) fee = 48;
        else if (absAmount <= 3500) fee = 60;
        else if (absAmount <= 5000) fee = 75;
        else if (absAmount <= 7500) fee = 87;
        else if (absAmount <= 10000) fee = 99;
        else if (absAmount <= 15000) fee = 110;
        else if (absAmount <= 20000) fee = 121;
        else fee = 165; // For amounts over 20,000
        
        return fee;
    }
    /**
     * Validate splits against transaction
     */
    async validateSplits(transactionId, splits) {
        const transaction = await db.get(
            'SELECT delta, mpesa_fee, status FROM transactions WHERE id = ?',
            [transactionId]
        );
        
        if (!transaction) {
            return { isValid: false, error: 'Transaction not found' };
        }
        
        if (transaction.status !== 'OPEN') {
            return { isValid: false, error: 'Transaction is not open for classification' };
        }
        
        // Calculate current totals
        const existingSplits = await db.all(
            'SELECT amount FROM transaction_splits WHERE transaction_id = ?',
            [transactionId]
        );
        
        const existingTotal = existingSplits.reduce((sum, split) => 
            sum.plus(split.amount), new Decimal(0));
        
        const newTotal = splits.reduce((sum, split) => 
            sum.plus(split.amount), new Decimal(0));
        
        const totalAfterAdd = existingTotal.plus(newTotal);// Calculate maximum allowed (delta minus fee)
        const delta = new Decimal(transaction.delta);
        const fee = new Decimal(transaction.mpesa_fee || 0);
        const maxAllowed = delta.minus(fee).abs();
        
        if (totalAfterAdd.gt(maxAllowed)) {
            return {
                isValid: false,
                error: 'Total splits exceed remaining amount',
                details: {
                    max_allowed: maxAllowed.toNumber(),
                    current_total: existingTotal.toNumber(),
                    attempted_addition: newTotal.toNumber(),
                    remaining: maxAllowed.minus(existingTotal).toNumber()
                }
            };
        }
        
        return {
            isValid: true,
            totals: {
                existing: existingTotal.toNumber(),
                new: newTotal.toNumber(),
                total: totalAfterAdd.toNumber(),
                remaining: maxAllowed.minus(totalAfterAdd).toNumber()
            }
        };
    }
    /**
     * Check if transaction is balanced and ready to lock
     */
    async checkTransactionBalance(transactionId) {
        const transaction = await db.get(`
            SELECT t.*, 
                   SUM(ts.amount) as split_total
            FROM transactions t
            LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
            WHERE t.id = ?
            GROUP BY t.id
        `, [transactionId]);
        
        if (!transaction) {
            return { balanced: false, error: 'Transaction not found' };
        }const delta = new Decimal(transaction.delta);
        const fee = new Decimal(transaction.mpesa_fee || 0);
        const splitTotal = new Decimal(transaction.split_total || 0);
        
        const expectedTotal = delta.minus(fee);
        const difference = expectedTotal.minus(splitTotal);
        
        const isBalanced = difference.abs().lt(0.01); // Allow 0.01 rounding toleranc
e
        
        return {
            balanced: isBalanced,
            details: {
                delta: delta.toNumber(),
                mpesa_fee: fee.toNumber(),
                classified_amount: splitTotal.toNumber(),
                difference: difference.toNumber(),
                remaining: difference.abs().toNumber()
            }
        };
    }
    /**
     * Get transaction summary for reporting
     */
async getTransactionSummary(transactionId) {
        const [transaction, splits, categories] = await Promise.all([
            db.get('SELECT * FROM transactions WHERE id = ?', [transactionId]),
            db.all(`
                SELECT ts.*, c.name as category_name, c.parent_id, p.name as parent_name
                FROM transaction_splits ts
                JOIN categories c ON ts.category_id = c.id
                LEFT JOIN categories p ON c.parent_id = p.id
                WHERE ts.transaction_id = ?
                ORDER BY ts.amount DESC
            `, [transactionId]),
            db.all('SELECT id, name, parent_id FROM categories')
        ]);
        
        if (!transaction) {
            return null;
        }
        
        // Group splits by category
        const categoryMap = {};
        categories.forEach(cat => { if (!cat.parent_id) {
                categoryMap[cat.id] = {
                    id: cat.id,
                    name: cat.name,
                    total: 0,
                    splits: []
                };
            }
        });
        
        splits.forEach(split => {
            const parentId = split.parent_id;
            if (categoryMap[parentId]) {
                categoryMap[parentId].total += parseFloat(split.amount);
                categoryMap[parentId].splits.push(split);
            }
        });
        
        return {
            transaction: {
                ...transaction,
                previous_balance: parseFloat(transaction.previous_balance),
                new_balance: parseFloat(transaction.new_balance),
                delta: parseFloat(transaction.delta),
                mpesa_fee: parseFloat(transaction.mpesa_fee)
            },
            categories: Object.values(categoryMap).filter(cat => cat.total > 0),
            splits,
            total_classified: splits.reduce((sum, split) => sum + parseFloat(split.amount), 0)
        };
    }
    /**
     * Generate audit trail for transaction
     */
    async generateAuditTrail(transactionId) {
        const transaction = await db.get(`
            SELECT t.*, 
                   COUNT(ts.id) as split_count,
                   GROUP_CONCAT(ts.id) as split_ids
            FROM transactions t
            LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
            WHERE t.id = ?
            GROUP BY t.id
        `, [transactionId]);if (!transaction) {
return null;
}
// Get all modifications (in a real system, you'd have an audit log table)
const splits = await db.all(
'SELECT * FROM transaction_splits WHERE transaction_id = ? ORDER BY created_at',
[transactionId]
);
return {
transaction_id: transactionId,
mpesa_transaction_id: transaction.mpesa_transaction_id,
created_at: transaction.created_at,
locked_at: transaction.locked_at,
status: transaction.status,
splits: splits.map(split => ({
id: split.id,
category_id: split.category_id,
amount: parseFloat(split.amount),
description: split.description,
created_at: split.created_at
})),
totals: {
delta: parseFloat(transaction.delta),
mpesa_fee: parseFloat(transaction.mpesa_fee),
classified_total: parseFloat(transaction.total_classified_amount),
balance_check: Math.abs(
parseFloat(transaction.delta) - 
parseFloat(transaction.mpesa_fee) - 
parseFloat(transaction.total_classified_amount)
) < 0.01
},
raw_data_present: !!(transaction.raw_daraja_json || transaction.raw_sms_text)
};
}           
}
module.exports = new TransactionService();