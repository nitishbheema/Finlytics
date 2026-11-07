-- ============================================================
-- FINLYTICS - Separate Default Categories & Initial Seed Data
-- ============================================================

-- 1. Default Expense Categories
INSERT INTO categories (category_name, category_type) VALUES
    ('Food', 'expense'),
    ('Travel', 'expense'),
    ('Shopping', 'expense'),
    ('Bills', 'expense'),
    ('Entertainment', 'expense'),
    ('Utilities', 'expense'),
    ('Healthcare', 'expense'),
    ('Education', 'expense'),
    ('Other Expense', 'expense')
ON CONFLICT (category_name, category_type) DO NOTHING;

-- 2. Default Income Categories
INSERT INTO categories (category_name, category_type) VALUES
    ('Salary', 'income'),
    ('Freelance', 'income'),
    ('Investment', 'income'),
    ('Business', 'income'),
    ('Rental', 'income'),
    ('Dividends', 'income'),
    ('Bonus', 'income'),
    ('Other Income', 'income')
ON CONFLICT (category_name, category_type) DO NOTHING;
