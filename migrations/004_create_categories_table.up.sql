-- Ledger Service: categories table
CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id_type ON categories(user_id, type);

-- Insert default global categories (only if they don't exist)
INSERT INTO categories (user_id, name, type)
SELECT NULL, 'Транспорт', 'expense'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = 'Транспорт' AND type = 'expense');

INSERT INTO categories (user_id, name, type)
SELECT NULL, 'Еда', 'expense'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = 'Еда' AND type = 'expense');

INSERT INTO categories (user_id, name, type)
SELECT NULL, 'Прочее', 'expense'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = 'Прочее' AND type = 'expense');

INSERT INTO categories (user_id, name, type)
SELECT NULL, 'Зарплата', 'income'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = 'Зарплата' AND type = 'income');

INSERT INTO categories (user_id, name, type)
SELECT NULL, 'Подарки', 'income'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = 'Подарки' AND type = 'income');

INSERT INTO categories (user_id, name, type)
SELECT NULL, 'Прочее', 'income'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = 'Прочее' AND type = 'income');






