const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const Decimal = require('decimal.js');
class Database {
constructor() {
this.db = null;
this.dbPath = path.join(__dirname, 'petty-cash.db');
}
async initializeDatabase() {
return new Promise((resolve, reject) => {
this.db = new sqlite3.Database(this.dbPath, (err) => {
if (err) {
reject(err);
return;
}
// Enable foreign keys
this.db.run('PRAGMA foreign_keys = ON');
this.db.run('PRAGMA strict = ON');
// Read and execute schema
const schemaPath = path.join(__dirname, 'schema.sql');
fs.readFile(schemaPath, 'utf8', (err, schema) => {
if (err) {reject(err);
                        return;
                    }
                    this.db.exec(schema, (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    });
                });
            });
        });
    }
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    async transaction(callback) {
        return new Promise((resolve, reject) => {
            this.db.run('BEGIN TRANSACTION', async (err) => {
                if (err) { reject(err);
                    return;
                }
                try {
                    const result = await callback();
                    this.db.run('COMMIT', (err) => {
                        if (err) {
                            this.db.run('ROLLBACK');
                            reject(err);
                        } else {
                            resolve(result);
                        }
                    });
                } catch (error) {
                    this.db.run('ROLLBACK');
                    reject(error);
                }
            });
        });
    }
    close() {
        if (this.db) {
            this.db.close();
        }
    }
    // Helper method for financial calculations
    static validateAmounts(...amounts) {
        try {
            return amounts.every(amount => {
                const dec = new Decimal(amount || 0);
                return dec.isFinite() && dec.gte(0) && dec.dp() <= 2;
            });
        } catch {
            return false;
        }
    }
    static roundToTwoDecimals(value) {
        return new Decimal(value || 0).toDecimalPlaces(2).toNumber();
    }
}
module.exports = new Database();