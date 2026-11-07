-- ============================================================
-- FINLYTICS - Default Categories & Initial Seed Data
-- ============================================================

INSERT INTO categories (category_name) VALUES
    ('Food'),
    ('Travel'),
    ('Shopping'),
    ('Bills'),
    ('Salary'),
    ('Freelance'),
    ('Investment'),
    ('Entertainment'),
    ('Utilities'),
    ('Healthcare'),
    ('Education'),
    ('Other')
ON CONFLICT (category_name) DO NOTHING;
