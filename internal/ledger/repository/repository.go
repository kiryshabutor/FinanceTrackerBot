package repository

import (
	"context"
	"database/sql"
	"fmt"
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

type Account struct {
	ID         int64
	UserID     int64
	Name       string
	Currency   string
	Balance    string
	IsArchived bool
	IsDefault  bool
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type Category struct {
	ID       int64
	UserID   sql.NullInt64
	Name     string
	Type     string
	CreatedAt time.Time
}

type Transaction struct {
	ID              int64
	UserID          int64
	AccountID       int64
	RelatedAccountID sql.NullInt64
	CategoryID      sql.NullInt64
	Type            string
	Amount          string
	Currency        string
	Description     sql.NullString
	OperationDate   time.Time
	CreatedAt       time.Time
}

func (r *Repository) CreateAccount(ctx context.Context, userID int64, name, currency, balance string) (*Account, error) {
	var account Account

	query := `
		INSERT INTO accounts (user_id, name, currency, balance)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, name, currency, balance, is_archived, is_default, created_at, updated_at
	`

	err := r.db.QueryRow(ctx, query, userID, name, currency, balance).Scan(
		&account.ID,
		&account.UserID,
		&account.Name,
		&account.Currency,
		&account.Balance,
		&account.IsArchived,
		&account.IsDefault,
		&account.CreatedAt,
		&account.UpdatedAt,
	)
	if err != nil {
		r.logger.Error("failed to create account", zap.Error(err))
		return nil, err
	}

	return &account, nil
}

func (r *Repository) ListAccounts(ctx context.Context, userID int64) ([]*Account, error) {
	query := `
		SELECT id, user_id, name, currency, balance, is_archived, is_default, created_at, updated_at
		FROM accounts
		WHERE user_id = $1 AND is_archived = false
		ORDER BY is_default DESC, created_at DESC
	`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		r.logger.Error("failed to list accounts", zap.Error(err))
		return nil, err
	}
	defer rows.Close()

	var accounts []*Account
	for rows.Next() {
		var account Account
		if err := rows.Scan(
			&account.ID,
			&account.UserID,
			&account.Name,
			&account.Currency,
			&account.Balance,
			&account.IsArchived,
			&account.IsDefault,
			&account.CreatedAt,
			&account.UpdatedAt,
		); err != nil {
			return nil, err
		}
		accounts = append(accounts, &account)
	}

	return accounts, nil
}

func (r *Repository) GetAccount(ctx context.Context, accountID, userID int64) (*Account, error) {
	var account Account

	query := `
		SELECT id, user_id, name, currency, balance, is_archived, is_default, created_at, updated_at
		FROM accounts
		WHERE id = $1 AND user_id = $2
	`

	err := r.db.QueryRow(ctx, query, accountID, userID).Scan(
		&account.ID,
		&account.UserID,
		&account.Name,
		&account.Currency,
		&account.Balance,
		&account.IsArchived,
		&account.IsDefault,
		&account.CreatedAt,
		&account.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		r.logger.Error("failed to get account", zap.Error(err))
		return nil, err
	}

	return &account, nil
}

func (r *Repository) UpdateAccountBalance(ctx context.Context, accountID int64, delta string) error {
	query := `
		UPDATE accounts
		SET balance = balance + $1::numeric,
		    updated_at = NOW()
		WHERE id = $2
	`

	_, err := r.db.Exec(ctx, query, delta, accountID)
	if err != nil {
		r.logger.Error("failed to update account balance", zap.Error(err))
		return err
	}

	return nil
}

func (r *Repository) UpdateAccount(ctx context.Context, accountID, userID int64, name, balance string) (*Account, error) {
	query := `
		UPDATE accounts
		SET name = $1,
		    balance = $2::numeric,
		    updated_at = NOW()
		WHERE id = $3 AND user_id = $4
		RETURNING id, user_id, name, currency, balance, is_archived, is_default, created_at, updated_at
	`

	var account Account
	err := r.db.QueryRow(ctx, query, name, balance, accountID, userID).Scan(
		&account.ID,
		&account.UserID,
		&account.Name,
		&account.Currency,
		&account.Balance,
		&account.IsArchived,
		&account.IsDefault,
		&account.CreatedAt,
		&account.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		r.logger.Error("failed to update account", zap.Error(err))
		return nil, err
	}

	return &account, nil
}

func (r *Repository) CreateCategory(ctx context.Context, userID int64, name, categoryType string) (*Category, error) {
	var category Category

	query := `
		INSERT INTO categories (user_id, name, type)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, name, type, created_at
	`

	var userIDNull sql.NullInt64
	if userID > 0 {
		userIDNull = sql.NullInt64{Int64: userID, Valid: true}
	}

	err := r.db.QueryRow(ctx, query, userIDNull, name, categoryType).Scan(
		&category.ID,
		&category.UserID,
		&category.Name,
		&category.Type,
		&category.CreatedAt,
	)
	if err != nil {
		r.logger.Error("failed to create category", zap.Error(err))
		return nil, err
	}

	return &category, nil
}

func (r *Repository) ListCategories(ctx context.Context, userID int64, categoryType string) ([]*Category, error) {
	query := `
		SELECT id, user_id, name, type, created_at
		FROM categories
		WHERE type = $1 AND (user_id = $2 OR user_id IS NULL)
		ORDER BY user_id NULLS LAST, name
	`

	rows, err := r.db.Query(ctx, query, categoryType, userID)
	if err != nil {
		r.logger.Error("failed to list categories", zap.Error(err))
		return nil, err
	}
	defer rows.Close()

	var categories []*Category
	for rows.Next() {
		var category Category
		if err := rows.Scan(
			&category.ID,
			&category.UserID,
			&category.Name,
			&category.Type,
			&category.CreatedAt,
		); err != nil {
			return nil, err
		}
		categories = append(categories, &category)
	}

	return categories, nil
}

func (r *Repository) CreateTransaction(ctx context.Context, tx *Transaction) (*Transaction, error) {
	query := `
		INSERT INTO transactions (user_id, account_id, related_account_id, category_id, type, amount, currency, description, operation_date)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, user_id, account_id, related_account_id, category_id, type, amount, currency, description, operation_date, created_at
	`

	var relatedAccountID sql.NullInt64
	if tx.RelatedAccountID.Valid {
		relatedAccountID = tx.RelatedAccountID
	}

	var categoryID sql.NullInt64
	if tx.CategoryID.Valid {
		categoryID = tx.CategoryID
	}

	var description sql.NullString
	if tx.Description.Valid {
		description = tx.Description
	}

	var operationDate time.Time
	if tx.OperationDate.IsZero() {
		operationDate = time.Now()
	} else {
		operationDate = tx.OperationDate
	}

	var result Transaction
	err := r.db.QueryRow(ctx, query,
		tx.UserID,
		tx.AccountID,
		relatedAccountID,
		categoryID,
		tx.Type,
		tx.Amount,
		tx.Currency,
		description,
		operationDate,
	).Scan(
		&result.ID,
		&result.UserID,
		&result.AccountID,
		&result.RelatedAccountID,
		&result.CategoryID,
		&result.Type,
		&result.Amount,
		&result.Currency,
		&result.Description,
		&result.OperationDate,
		&result.CreatedAt,
	)
	if err != nil {
		r.logger.Error("failed to create transaction", zap.Error(err))
		return nil, err
	}

	return &result, nil
}

func (r *Repository) ListTransactions(ctx context.Context, userID int64, period string, limit int32, startDate, endDate string) ([]*Transaction, error) {
	var query string
	var args []interface{}

	switch period {
	case "today":
		query = `
			SELECT t.id, t.user_id, t.account_id, t.related_account_id, t.category_id, t.type, t.amount, t.currency, t.description, t.operation_date, t.created_at
			FROM transactions t
			WHERE t.user_id = $1 AND DATE(t.operation_date) = CURRENT_DATE
			ORDER BY t.operation_date DESC
			LIMIT $2
		`
		args = []interface{}{userID, limit}
	case "week":
		query = `
			SELECT t.id, t.user_id, t.account_id, t.related_account_id, t.category_id, t.type, t.amount, t.currency, t.description, t.operation_date, t.created_at
			FROM transactions t
			WHERE t.user_id = $1 AND t.operation_date >= NOW() - INTERVAL '7 days'
			ORDER BY t.operation_date DESC
			LIMIT $2
		`
		args = []interface{}{userID, limit}
	case "month":
		query = `
			SELECT t.id, t.user_id, t.account_id, t.related_account_id, t.category_id, t.type, t.amount, t.currency, t.description, t.operation_date, t.created_at
			FROM transactions t
			WHERE t.user_id = $1 AND t.operation_date >= NOW() - INTERVAL '30 days'
			ORDER BY t.operation_date DESC
			LIMIT $2
		`
		args = []interface{}{userID, limit}
	case "year":
		query = `
			SELECT t.id, t.user_id, t.account_id, t.related_account_id, t.category_id, t.type, t.amount, t.currency, t.description, t.operation_date, t.created_at
			FROM transactions t
			WHERE t.user_id = $1 AND t.operation_date >= NOW() - INTERVAL '365 days'
			ORDER BY t.operation_date DESC
			LIMIT $2
		`
		args = []interface{}{userID, limit}
	case "period":
		if startDate != "" && endDate != "" {
			query = `
				SELECT t.id, t.user_id, t.account_id, t.related_account_id, t.category_id, t.type, t.amount, t.currency, t.description, t.operation_date, t.created_at
				FROM transactions t
				WHERE t.user_id = $1 AND t.operation_date >= $2::timestamp AND t.operation_date <= $3::timestamp
				ORDER BY t.operation_date DESC
				LIMIT $4
			`
			args = []interface{}{userID, startDate, endDate, limit}
		} else {
			query = `
				SELECT t.id, t.user_id, t.account_id, t.related_account_id, t.category_id, t.type, t.amount, t.currency, t.description, t.operation_date, t.created_at
				FROM transactions t
				WHERE t.user_id = $1
				ORDER BY t.operation_date DESC
				LIMIT $2
			`
			args = []interface{}{userID, limit}
		}
	case "all":
		query = `
			SELECT t.id, t.user_id, t.account_id, t.related_account_id, t.category_id, t.type, t.amount, t.currency, t.description, t.operation_date, t.created_at
			FROM transactions t
			WHERE t.user_id = $1
			ORDER BY t.operation_date DESC
			LIMIT $2
		`
		args = []interface{}{userID, limit}
	default:
		query = `
			SELECT t.id, t.user_id, t.account_id, t.related_account_id, t.category_id, t.type, t.amount, t.currency, t.description, t.operation_date, t.created_at
			FROM transactions t
			WHERE t.user_id = $1
			ORDER BY t.operation_date DESC
			LIMIT $2
		`
		args = []interface{}{userID, limit}
	}

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		r.logger.Error("failed to list transactions", zap.Error(err))
		return nil, err
	}
	defer rows.Close()

	var transactions []*Transaction
	for rows.Next() {
		var tx Transaction
		if err := rows.Scan(
			&tx.ID,
			&tx.UserID,
			&tx.AccountID,
			&tx.RelatedAccountID,
			&tx.CategoryID,
			&tx.Type,
			&tx.Amount,
			&tx.Currency,
			&tx.Description,
			&tx.OperationDate,
			&tx.CreatedAt,
		); err != nil {
			return nil, err
		}
		transactions = append(transactions, &tx)
	}

	return transactions, nil
}

func (r *Repository) GetTransactionWithDetails(ctx context.Context, transactionID int64) (*TransactionWithDetails, error) {
	query := `
		SELECT 
			t.id, t.user_id, t.account_id, t.related_account_id, t.category_id, t.type, t.amount, t.currency, t.description, t.operation_date, t.created_at,
			c.name as category_name,
			a.name as account_name
		FROM transactions t
		LEFT JOIN categories c ON t.category_id = c.id
		LEFT JOIN accounts a ON t.account_id = a.id
		WHERE t.id = $1
	`

	var result TransactionWithDetails
	var categoryName, accountName sql.NullString

	err := r.db.QueryRow(ctx, query, transactionID).Scan(
		&result.ID,
		&result.UserID,
		&result.AccountID,
		&result.RelatedAccountID,
		&result.CategoryID,
		&result.Type,
		&result.Amount,
		&result.Currency,
		&result.Description,
		&result.OperationDate,
		&result.CreatedAt,
		&categoryName,
		&accountName,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		r.logger.Error("failed to get transaction with details", zap.Error(err))
		return nil, err
	}

	if categoryName.Valid {
		result.CategoryName = categoryName.String
	}
	if accountName.Valid {
		result.AccountName = accountName.String
	}

	return &result, nil
}

type TransactionWithDetails struct {
	Transaction
	CategoryName string
	AccountName  string
}

func (r *Repository) GetTransaction(ctx context.Context, transactionID, userID int64) (*Transaction, error) {
	var tx Transaction

	query := `
		SELECT id, user_id, account_id, related_account_id, category_id, type, amount, currency, description, operation_date, created_at
		FROM transactions
		WHERE id = $1 AND user_id = $2
	`

	err := r.db.QueryRow(ctx, query, transactionID, userID).Scan(
		&tx.ID,
		&tx.UserID,
		&tx.AccountID,
		&tx.RelatedAccountID,
		&tx.CategoryID,
		&tx.Type,
		&tx.Amount,
		&tx.Currency,
		&tx.Description,
		&tx.OperationDate,
		&tx.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		r.logger.Error("failed to get transaction", zap.Error(err))
		return nil, err
	}

	return &tx, nil
}

func (r *Repository) UpdateTransaction(ctx context.Context, tx *Transaction) error {
	query := `
		UPDATE transactions
		SET account_id = $1, related_account_id = $2, category_id = $3, amount = $4, currency = $5, description = $6, operation_date = $7
		WHERE id = $8 AND user_id = $9
	`

	var categoryID sql.NullInt64
	if tx.CategoryID.Valid {
		categoryID = tx.CategoryID
	}

	var relatedAccountID sql.NullInt64
	if tx.RelatedAccountID.Valid {
		relatedAccountID = tx.RelatedAccountID
	}

	var description sql.NullString
	if tx.Description.Valid {
		description = tx.Description
	}

	_, err := r.db.Exec(ctx, query,
		tx.AccountID,
		relatedAccountID,
		categoryID,
		tx.Amount,
		tx.Currency,
		description,
		tx.OperationDate,
		tx.ID,
		tx.UserID,
	)
	if err != nil {
		r.logger.Error("failed to update transaction", zap.Error(err))
		return err
	}

	return nil
}

func (r *Repository) DeleteTransaction(ctx context.Context, transactionID, userID int64) (*Transaction, error) {
	// Get transaction first
	tx, err := r.GetTransaction(ctx, transactionID, userID)
	if err != nil {
		return nil, err
	}
	if tx == nil {
		return nil, fmt.Errorf("transaction not found")
	}

	// Delete transaction
	query := `
		DELETE FROM transactions
		WHERE id = $1 AND user_id = $2
	`

	_, err = r.db.Exec(ctx, query, transactionID, userID)
	if err != nil {
		r.logger.Error("failed to delete transaction", zap.Error(err))
		return nil, err
	}

	return tx, nil
}

func (r *Repository) DeleteAccount(ctx context.Context, accountID, userID int64) error {
	// Проверяем, что счет принадлежит пользователю
	account, err := r.GetAccount(ctx, accountID, userID)
	if err != nil {
		return err
	}
	if account == nil {
		return fmt.Errorf("account not found")
	}

	// Запрещаем удаление базового счета
	if account.IsDefault {
		return fmt.Errorf("cannot delete default account")
	}

	// Проверяем, что баланс равен нулю
	if account.Balance != "0" && account.Balance != "0.00" {
		return fmt.Errorf("cannot delete account with non-zero balance")
	}

	// Помечаем счет как архивный вместо удаления
	query := `
		UPDATE accounts
		SET is_archived = true, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`

	_, err = r.db.Exec(ctx, query, accountID, userID)
	if err != nil {
		r.logger.Error("failed to delete account", zap.Error(err))
		return err
	}

	return nil
}

func (r *Repository) DeleteCategory(ctx context.Context, categoryID, userID int64) error {
	// Проверяем, что категория принадлежит пользователю
	var category Category
	query := `
		SELECT id, user_id, name, type, created_at
		FROM categories
		WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
	`

	err := r.db.QueryRow(ctx, query, categoryID, userID).Scan(
		&category.ID,
		&category.UserID,
		&category.Name,
		&category.Type,
		&category.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("category not found")
		}
		r.logger.Error("failed to get category", zap.Error(err))
		return err
	}

	// Нельзя удалять системные категории (user_id IS NULL)
	if !category.UserID.Valid {
		return fmt.Errorf("cannot delete system category")
	}

	// Находим категорию "Прочее" того же типа
	var otherCategoryID int64
	otherQuery := `
		SELECT id FROM categories
		WHERE name = 'Прочее' AND type = $1 AND user_id IS NULL
		LIMIT 1
	`

	err = r.db.QueryRow(ctx, otherQuery, category.Type).Scan(&otherCategoryID)
	if err != nil {
		r.logger.Error("failed to find 'Прочее' category", zap.Error(err))
		return fmt.Errorf("failed to find 'Прочее' category")
	}

	// Переносим все транзакции в категорию "Прочее"
	updateTxQuery := `
		UPDATE transactions
		SET category_id = $1
		WHERE category_id = $2 AND user_id = $3
	`

	_, err = r.db.Exec(ctx, updateTxQuery, otherCategoryID, categoryID, userID)
	if err != nil {
		r.logger.Error("failed to update transactions", zap.Error(err))
		return fmt.Errorf("failed to update transactions: %w", err)
	}

	// Удаляем категорию
	deleteQuery := `
		DELETE FROM categories
		WHERE id = $1 AND user_id = $2
	`

	_, err = r.db.Exec(ctx, deleteQuery, categoryID, userID)
	if err != nil {
		r.logger.Error("failed to delete category", zap.Error(err))
		return err
	}

	return nil
}

