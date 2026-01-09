// src/services/TransactionService.js
const db = require('../db/database');
const Decimal = require('decimal.js');

class TransactionService {
  async validateTransactionData(data) {
    const errors = [];
    const required = ['mpesa_transaction_id', 'previous_balance', 'new_balance', 'transaction_date'];
    required.forEach(field => {
      if (!data[field] && data[field] !== 0) errors.push(`${field} is required`);
    });

    if (typeof data.previous_balance !== 'number' || data.previous_balance < 0)
      errors.push('previous_balance must be a positive number');
    if (typeof data.new_balance !== 'number' || data.new_balance < 0)
      errors.push('new_balance must be a positive number');

    const existing = await db.get('SELECT id FROM transactions WHERE mpesa_transaction_id = ?', [data.mpesa_transaction_id]);
    if (existing) errors.push(`Transaction ${data.mpesa_transaction_id} already exists`);

    const delta = new Decimal(data.new_balance).minus(data.previous_balance);
    if (!delta.isFinite()) errors.push('Invalid balance calculation');

    return { isValid: errors.length === 0, errors, delta: delta.toNumber() };
  }

  calculateMpesaFee(amount) {
    const abs = Math.abs(amount);
    if (abs <= 100) return 7;
    if (abs <= 500) return 13;
    if (abs <= 1000) return 25;
    if (abs <= 1500) return 33;
    if (abs <= 2500) return 48;
    if (abs <= 3500) return 60;
    if (abs <= 5000) return 75;
    if (abs <= 7500) return 87;
    if (abs <= 10000) return 99;
    if (abs <= 15000) return 110;
    if (abs <= 20000) return 121;
    return 165;
  }

  async getOpenTransaction() {
    const transaction = await db.get(`
      SELECT t.*
      FROM transactions t
      JOIN system_status s ON t.id = s.open_transaction_id
      WHERE t.status = 'OPEN' AND s.system_locked = 1
    `);

    if (!transaction) return null;

    const splits = await db.all(`
      SELECT ts.*, c.name as category_name
      FROM transaction_splits ts
      JOIN categories c ON ts.category_id = c.id
      WHERE ts.transaction_id = ?
    `, [transaction.id]);

    return { transaction, splits };
  }

  async createTransaction(data) {
    const validation = await this.validateTransactionData(data);
    if (!validation.isValid) throw new Error(validation.errors.join(', '));

    data.delta = validation.delta;
    data.mpesa_fee = Math.abs(data.delta) > 0 ? this.calculateMpesaFee(data.delta) : 0;
    data.status = 'OPEN';

    await db.run('BEGIN TRANSACTION');
    try {
      const result = await db.run(`
        INSERT INTO transactions (
          mpesa_transaction_id, previous_balance, new_balance, delta, mpesa_fee,
          transaction_date, raw_daraja_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        data.mpesa_transaction_id,
        data.previous_balance,
        data.new_balance,
        data.delta,
        data.mpesa_fee,
        data.transaction_date,
        data.raw_daraja_json || null,
        data.status
      ]);

      const transactionId = result.lastID;

      await db.run('UPDATE wallet SET current_balance = ? WHERE id = 1', [data.new_balance]);

      await db.run(`
        UPDATE system_status 
        SET system_locked = 1, open_transaction_id = ? 
        WHERE id = 1
      `, [transactionId]);

      await db.run('COMMIT');
      console.log(`Transaction created: ${data.mpesa_transaction_id} (ID: ${transactionId}) - System locked`);
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  }

  async validateSplits(transactionId, splits) {
    const transaction = await db.get('SELECT delta, mpesa_fee FROM transactions WHERE id = ?', [transactionId]);
    if (!transaction) return { isValid: false, error: 'Transaction not found' };

    const existing = await db.all('SELECT amount FROM transaction_splits WHERE transaction_id = ?', [transactionId]);
    const existingTotal = existing.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    const newTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    const total = existingTotal + newTotal;

    const maxAllowed = Math.abs(transaction.delta) - (transaction.mpesa_fee || 0);
    if (total > maxAllowed + 0.01) {
      return { isValid: false, error: 'Total exceeds remaining amount' };
    }

    return { isValid: true };
  }

  async addSplits(transactionId, splits) {
    const validation = await this.validateSplits(transactionId, splits);
    if (!validation.isValid) throw new Error(validation.error);

    await db.run('BEGIN TRANSACTION');
    try {
      for (const split of splits) {
        await db.run(`
          INSERT INTO transaction_splits (transaction_id, category_id, amount, description, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `, [transactionId, split.category_id, split.amount, split.description || null]);
      }
      await db.run('COMMIT');
      return { success: true };
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  }

  async checkTransactionBalance(transactionId) {
    const row = await db.get(`
      SELECT t.delta, t.mpesa_fee, COALESCE(SUM(ts.amount), 0) as split_total
      FROM transactions t
      LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
      WHERE t.id = ?
      GROUP BY t.id
    `, [transactionId]);

    if (!row) return { balanced: false };

    const remaining = Math.abs(row.delta) - row.mpesa_fee - row.split_total;
    return { balanced: Math.abs(remaining) < 0.01, remaining };
  }

  async lockTransaction(transactionId) {
    const balance = await this.checkTransactionBalance(transactionId);
    if (!balance.balanced) throw new Error(`Not balanced: KSh ${balance.remaining.toFixed(2)} remaining`);

    await db.run('BEGIN TRANSACTION');
    try {
      await db.run(`UPDATE transactions SET status = 'LOCKED', locked_at = datetime('now') WHERE id = ?`, [transactionId]);
      await db.run(`UPDATE system_status SET system_locked = 0, open_transaction_id = NULL WHERE id = 1`);
      await db.run('COMMIT');
      return { success: true };
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  }

  async forceUnlockSystem(reason, adminCode) {
    if (adminCode !== process.env.ADMIN_CODE && adminCode !== 'your-secret-code-here') {
      throw new Error('Invalid admin code');
    }

    const openTx = await this.getOpenTransaction();
    await db.run('BEGIN TRANSACTION');
    try {
      if (openTx) {
        await db.run('DELETE FROM transaction_splits WHERE transaction_id = ?', [openTx.transaction.id]);
        await db.run('DELETE FROM transactions WHERE id = ?', [openTx.transaction.id]);
      }
      await db.run('UPDATE system_status SET system_locked = 0, open_transaction_id = NULL WHERE id = 1');
      await db.run('COMMIT');
      console.log(`Emergency unlock: ${reason}`);
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  }
}

module.exports = new TransactionService();