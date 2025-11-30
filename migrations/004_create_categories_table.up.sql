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

-- Insert default global categories
INSERT INTO categories (user_id, name, type) VALUES
    (NULL, 'Транспорт', 'expense'),
    (NULL, 'Продукты', 'expense'),
    (NULL, 'Прочее', 'expense'),
    (NULL, 'Зарплата', 'income'),
    (NULL, 'Подарки', 'income'),
    (NULL, 'Прочее', 'income')
ON CONFLICT DO NOTHING;






