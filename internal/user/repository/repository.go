package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type Repository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

func NewRepository(db *pgxpool.Pool, logger *zap.Logger) *Repository {
	return &Repository{
		db:     db,
		logger: logger,
	}
}

type User struct {
	ID         int64
	TelegramID int64
	Username   sql.NullString
	FirstName  string
	LastName   sql.NullString
	CreatedAt  time.Time
}

func (r *Repository) GetOrCreateUser(ctx context.Context, telegramID int64, username, firstName, lastName string) (*User, error) {
	var user User

	query := `
		INSERT INTO users (telegram_id, username, first_name, last_name)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (telegram_id) DO UPDATE
		SET username = EXCLUDED.username,
		    first_name = EXCLUDED.first_name,
		    last_name = EXCLUDED.last_name
		RETURNING id, telegram_id, username, first_name, last_name, created_at
	`

	var usernameNull sql.NullString
	if username != "" {
		usernameNull = sql.NullString{String: username, Valid: true}
	}

	var lastNameNull sql.NullString
	if lastName != "" {
		lastNameNull = sql.NullString{String: lastName, Valid: true}
	}

	err := r.db.QueryRow(ctx, query, telegramID, usernameNull, firstName, lastNameNull).Scan(
		&user.ID,
		&user.TelegramID,
		&user.Username,
		&user.FirstName,
		&user.LastName,
		&user.CreatedAt,
	)
	if err != nil {
		r.logger.Error("failed to get or create user", zap.Error(err))
		return nil, err
	}

	// Check if user was just created (check if default account exists)
	var accountExists bool
	err = r.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM accounts WHERE user_id = $1 AND is_default = true)
	`, user.ID).Scan(&accountExists)
	if err != nil {
		r.logger.Error("failed to check default account", zap.Error(err))
	}

	// Create default account if user is new
	if !accountExists {
		_, err = r.db.Exec(ctx, `
			INSERT INTO accounts (user_id, name, currency, is_default)
			VALUES ($1, 'Основной', 'RUB', true)
			ON CONFLICT DO NOTHING
		`, user.ID)
		if err != nil {
			r.logger.Error("failed to create default account", zap.Error(err))
		}
	}

	return &user, nil
}

func (r *Repository) GetUserByTelegramID(ctx context.Context, telegramID int64) (*User, error) {
	var user User

	query := `
		SELECT id, telegram_id, username, first_name, last_name, created_at
		FROM users
		WHERE telegram_id = $1
	`

	err := r.db.QueryRow(ctx, query, telegramID).Scan(
		&user.ID,
		&user.TelegramID,
		&user.Username,
		&user.FirstName,
		&user.LastName,
		&user.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		r.logger.Error("failed to get user by telegram id", zap.Error(err))
		return nil, err
	}

	return &user, nil
}

