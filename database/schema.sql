-- ============================================================
-- FINLYTICS - PostgreSQL Production Schema
-- Designed for Supabase / PostgreSQL 14+
-- ============================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    budget NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    photo TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. CATEGORIES TABLE (Separate Income and Expense Categories)
CREATE TABLE IF NOT EXISTS categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    category_type VARCHAR(20) NOT NULL DEFAULT 'expense' CHECK (category_type IN ('income', 'expense')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_category_name_type UNIQUE (category_name, category_type)
);

-- Ensure category_type column exists for existing databases
ALTER TABLE categories ADD COLUMN IF NOT EXISTS category_type VARCHAR(20) NOT NULL DEFAULT 'expense';

-- 3. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS expenses (
    expense_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    amount NUMERIC(14, 2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. TRANSACTIONS TABLE (Income / General Transactions)
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    amount NUMERIC(14, 2) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'income',
    description TEXT DEFAULT '',
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. CATEGORY BUDGETS TABLE
CREATE TABLE IF NOT EXISTS category_budgets (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(category_id) ON DELETE CASCADE,
    budget NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    CONSTRAINT uq_user_category UNIQUE (user_id, category_id)
);

-- ============================================================
-- INDEXES FOR PERFORMANCE AND OPTIMIZED QUERIES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(category_type);

CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);

CREATE INDEX IF NOT EXISTS idx_category_budgets_user ON category_budgets(user_id);
