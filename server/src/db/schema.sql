-- Categories table (self-referencing, safe first)
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

-- Example categories
INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES
(1, 'Cost of Sales', NULL),
(2, 'Meals', 1),
(3, 'Transport', 1),
(4, 'Office Expenses', NULL),
(5, 'Stationery', 4),
(6, 'Utilities', NULL),
(7, 'Electricity', 6);

-- Transactions table (must come BEFORE system_state because of FK)
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mpesa_transaction_id TEXT UNIQUE NOT NULL,
    previous_balance REAL,
    new_balance REAL,
    delta REAL,
    mpesa_fee REAL,
    transaction_date TEXT,
    raw_daraja_json TEXT,
    status TEXT DEFAULT 'OPEN',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    locked_at TEXT
);

-- Transaction splits (references transactions and categories)
CREATE TABLE IF NOT EXISTS transaction_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER,
    category_id INTEGER,
    amount REAL NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Wallet table
CREATE TABLE IF NOT EXISTS wallet (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_balance REAL DEFAULT 0
);

INSERT OR IGNORE INTO wallet (id, current_balance) VALUES (1, 0);

-- System state table (references transactions - now safe)
CREATE TABLE IF NOT EXISTS system_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_sync_timestamp INTEGER DEFAULT 0,
    is_first_run INTEGER DEFAULT 1,
    open_transaction_id INTEGER DEFAULT NULL,
    FOREIGN KEY (open_transaction_id) REFERENCES transactions(id)
);

-- Insert default row
INSERT OR IGNORE INTO system_state (id) VALUES (1);