package service

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/kiribu/financial-tracker/internal/ledger/repository"
	"go.uber.org/zap"
)

type Service struct {
	repo   *repository.Repository
	logger *zap.Logger
}

func NewService(repo *repository.Repository, logger *zap.Logger) *Service {
	return &Service{
		repo:   repo,
		logger: logger,
	}
}

func (s *Service) CreateExpense(ctx context.Context, userID, accountID int64, amount string, categoryID int64, description string, operationDate time.Time) (*repository.Transaction, string, error) {
	// Verify account belongs to user
	account, err := s.repo.GetAccount(ctx, accountID, userID)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return nil, "", fmt.Errorf("account not found or doesn't belong to user")
	}

	// Create transaction
	tx := &repository.Transaction{
		UserID:        userID,
		AccountID:     accountID,
		CategoryID:    sql.NullInt64{Int64: categoryID, Valid: true},
		Type:          "expense",
		Amount:        amount,
		Currency:      account.Currency,
		Description:   sql.NullString{String: description, Valid: description != ""},
		OperationDate: operationDate,
	}

	transaction, err := s.repo.CreateTransaction(ctx, tx)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create transaction: %w", err)
	}

	// Update account balance (decrease)
	negativeAmount := "-" + amount
	if err := s.repo.UpdateAccountBalance(ctx, accountID, negativeAmount); err != nil {
		s.logger.Error("failed to update account balance", zap.Error(err))
		return nil, "", fmt.Errorf("failed to update account balance: %w", err)
	}

	// Get updated balance
	updatedAccount, err := s.repo.GetAccount(ctx, accountID, userID)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get updated account: %w", err)
	}

	return transaction, updatedAccount.Balance, nil
}

func (s *Service) CreateIncome(ctx context.Context, userID, accountID int64, amount string, categoryID int64, description string, operationDate time.Time) (*repository.Transaction, string, error) {
	// Verify account belongs to user
	account, err := s.repo.GetAccount(ctx, accountID, userID)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return nil, "", fmt.Errorf("account not found or doesn't belong to user")
	}

	// Create transaction
	tx := &repository.Transaction{
		UserID:        userID,
		AccountID:     accountID,
		CategoryID:    sql.NullInt64{Int64: categoryID, Valid: true},
		Type:          "income",
		Amount:        amount,
		Currency:      account.Currency,
		Description:   sql.NullString{String: description, Valid: description != ""},
		OperationDate: operationDate,
	}

	transaction, err := s.repo.CreateTransaction(ctx, tx)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create transaction: %w", err)
	}

	// Update account balance (increase)
	if err := s.repo.UpdateAccountBalance(ctx, accountID, amount); err != nil {
		s.logger.Error("failed to update account balance", zap.Error(err))
		return nil, "", fmt.Errorf("failed to update account balance: %w", err)
	}

	// Get updated balance
	updatedAccount, err := s.repo.GetAccount(ctx, accountID, userID)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get updated account: %w", err)
	}

	return transaction, updatedAccount.Balance, nil
}

func (s *Service) CreateTransfer(ctx context.Context, userID, fromAccountID, toAccountID int64, amount string, description string, operationDate time.Time) (*repository.Transaction, string, string, error) {
	// Verify both accounts belong to user
	fromAccount, err := s.repo.GetAccount(ctx, fromAccountID, userID)
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to get from account: %w", err)
	}
	if fromAccount == nil {
		return nil, "", "", fmt.Errorf("from account not found or doesn't belong to user")
	}

	toAccount, err := s.repo.GetAccount(ctx, toAccountID, userID)
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to get to account: %w", err)
	}
	if toAccount == nil {
		return nil, "", "", fmt.Errorf("to account not found or doesn't belong to user")
	}

	if fromAccountID == toAccountID {
		return nil, "", "", fmt.Errorf("нельзя переводить с одного и того же счета на этот же")
	}

	// Create transaction
	tx := &repository.Transaction{
		UserID:          userID,
		AccountID:       fromAccountID,
		RelatedAccountID: sql.NullInt64{Int64: toAccountID, Valid: true},
		Type:            "transfer",
		Amount:          amount,
		Currency:        fromAccount.Currency,
		Description:     sql.NullString{String: description, Valid: description != ""},
		OperationDate:   operationDate,
	}

	transaction, err := s.repo.CreateTransaction(ctx, tx)
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to create transaction: %w", err)
	}

	// Update balances
	negativeAmount := "-" + amount
	if err := s.repo.UpdateAccountBalance(ctx, fromAccountID, negativeAmount); err != nil {
		s.logger.Error("failed to update from account balance", zap.Error(err))
		return nil, "", "", fmt.Errorf("failed to update from account balance: %w", err)
	}

	if err := s.repo.UpdateAccountBalance(ctx, toAccountID, amount); err != nil {
		s.logger.Error("failed to update to account balance", zap.Error(err))
		return nil, "", "", fmt.Errorf("failed to update to account balance: %w", err)
	}

	// Get updated balances
	updatedFromAccount, err := s.repo.GetAccount(ctx, fromAccountID, userID)
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to get updated from account: %w", err)
	}

	updatedToAccount, err := s.repo.GetAccount(ctx, toAccountID, userID)
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to get updated to account: %w", err)
	}

	return transaction, updatedFromAccount.Balance, updatedToAccount.Balance, nil
}

func (s *Service) ListAccounts(ctx context.Context, userID int64) ([]*repository.Account, error) {
	return s.repo.ListAccounts(ctx, userID)
}

func (s *Service) UpdateAccount(ctx context.Context, userID, accountID int64, name, balance string) (*repository.Account, error) {
	// Verify account belongs to user
	account, err := s.repo.GetAccount(ctx, accountID, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return nil, fmt.Errorf("account not found or doesn't belong to user")
	}

	// Check if account with same name already exists for this user (excluding current account)
	accounts, err := s.repo.ListAccounts(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing accounts: %w", err)
	}
	
	for _, acc := range accounts {
		if acc.ID != accountID && acc.Name == name && !acc.IsArchived {
			return nil, fmt.Errorf("счет с таким названием уже существует")
		}
	}

	return s.repo.UpdateAccount(ctx, accountID, userID, name, balance)
}

func (s *Service) CreateCategory(ctx context.Context, userID int64, name, categoryType string) (*repository.Category, error) {
	if name == "" {
		return nil, fmt.Errorf("category name cannot be empty")
	}
	if categoryType != "expense" && categoryType != "income" {
		return nil, fmt.Errorf("invalid category type")
	}
	
	// Check if category with same name and type already exists for this user
	categories, err := s.repo.ListCategories(ctx, userID, categoryType)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing categories: %w", err)
	}
	
	for _, cat := range categories {
		if cat.UserID.Valid && cat.UserID.Int64 == userID && cat.Name == name {
			return nil, fmt.Errorf("категория с таким названием уже существует")
		}
	}
	
	return s.repo.CreateCategory(ctx, userID, name, categoryType)
}

func (s *Service) ListCategories(ctx context.Context, userID int64, categoryType string) ([]*repository.Category, error) {
	return s.repo.ListCategories(ctx, userID, categoryType)
}

func (s *Service) ListTransactions(ctx context.Context, userID int64, period string, limit int32, startDate, endDate string) ([]*repository.TransactionWithDetails, error) {
	transactions, err := s.repo.ListTransactions(ctx, userID, period, limit, startDate, endDate)
	if err != nil {
		return nil, err
	}

	// Enrich with details
	var result []*repository.TransactionWithDetails
	for _, tx := range transactions {
		details, err := s.repo.GetTransactionWithDetails(ctx, tx.ID)
		if err != nil {
			s.logger.Warn("failed to get transaction details", zap.Int64("transaction_id", tx.ID), zap.Error(err))
			continue
		}
		if details != nil {
			result = append(result, details)
		}
	}

	return result, nil
}

func (s *Service) GetBalance(ctx context.Context, userID int64) ([]*repository.Account, error) {
	return s.repo.ListAccounts(ctx, userID)
}

func (s *Service) CreateAccount(ctx context.Context, userID int64, name, currency, balance string) (*repository.Account, error) {
	if name == "" {
		return nil, fmt.Errorf("account name cannot be empty")
	}
	if currency == "" {
		currency = "RUB"
	}
	
	// Check if account with same name already exists for this user
	accounts, err := s.repo.ListAccounts(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing accounts: %w", err)
	}
	
	for _, acc := range accounts {
		if acc.Name == name && !acc.IsArchived {
			return nil, fmt.Errorf("счет с таким названием уже существует")
		}
	}
	
	// Set default balance if not provided
	if balance == "" {
		balance = "0"
	}
	
	return s.repo.CreateAccount(ctx, userID, name, currency, balance)
}

func (s *Service) DeleteAccount(ctx context.Context, userID, accountID int64) error {
	return s.repo.DeleteAccount(ctx, accountID, userID)
}

func (s *Service) DeleteCategory(ctx context.Context, userID, categoryID int64) error {
	return s.repo.DeleteCategory(ctx, categoryID, userID)
}

func (s *Service) UpdateTransaction(ctx context.Context, userID, transactionID, accountID int64, amount string, categoryID int64, description string, operationDate time.Time, relatedAccountID int64) (*repository.Transaction, string, error) {
	// Get old transaction
	oldTx, err := s.repo.GetTransaction(ctx, transactionID, userID)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get transaction: %w", err)
	}
	if oldTx == nil {
		return nil, "", fmt.Errorf("transaction not found")
	}

	// Verify account belongs to user
	account, err := s.repo.GetAccount(ctx, accountID, userID)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return nil, "", fmt.Errorf("account not found or doesn't belong to user")
	}

	// Rollback old transaction balance
	oldAmount := oldTx.Amount
	if oldTx.Type == "expense" {
		// Rollback expense: add back to account
		if err := s.repo.UpdateAccountBalance(ctx, oldTx.AccountID, oldAmount); err != nil {
			return nil, "", fmt.Errorf("failed to rollback old balance: %w", err)
		}
	} else if oldTx.Type == "income" {
		// Rollback income: subtract from account
		negativeAmount := "-" + oldAmount
		if err := s.repo.UpdateAccountBalance(ctx, oldTx.AccountID, negativeAmount); err != nil {
			return nil, "", fmt.Errorf("failed to rollback old balance: %w", err)
		}
	} else if oldTx.Type == "transfer" {
		// Rollback transfer: restore both accounts
		if oldTx.RelatedAccountID.Valid {
			if err := s.repo.UpdateAccountBalance(ctx, oldTx.AccountID, oldAmount); err != nil {
				return nil, "", fmt.Errorf("failed to rollback from account: %w", err)
			}
			negativeAmount := "-" + oldAmount
			if err := s.repo.UpdateAccountBalance(ctx, oldTx.RelatedAccountID.Int64, negativeAmount); err != nil {
				return nil, "", fmt.Errorf("failed to rollback to account: %w", err)
			}
		}
	}

	// Update transaction
	updatedTx := &repository.Transaction{
		ID:            transactionID,
		UserID:        userID,
		AccountID:     accountID,
		CategoryID:    sql.NullInt64{Int64: categoryID, Valid: categoryID > 0},
		Type:          oldTx.Type, // Keep original type
		Amount:        amount,
		Currency:      account.Currency,
		Description:   sql.NullString{String: description, Valid: description != ""},
		OperationDate: operationDate,
	}
	if relatedAccountID > 0 {
		updatedTx.RelatedAccountID = sql.NullInt64{Int64: relatedAccountID, Valid: true}
	}

	if err := s.repo.UpdateTransaction(ctx, updatedTx); err != nil {
		return nil, "", fmt.Errorf("failed to update transaction: %w", err)
	}

	// Apply new transaction balance
	if oldTx.Type == "expense" {
		negativeAmount := "-" + amount
		if err := s.repo.UpdateAccountBalance(ctx, accountID, negativeAmount); err != nil {
			return nil, "", fmt.Errorf("failed to update account balance: %w", err)
		}
	} else if oldTx.Type == "income" {
		if err := s.repo.UpdateAccountBalance(ctx, accountID, amount); err != nil {
			return nil, "", fmt.Errorf("failed to update account balance: %w", err)
		}
	} else if oldTx.Type == "transfer" && relatedAccountID > 0 {
		// Apply transfer: decrease from account, increase to account
		negativeAmount := "-" + amount
		if err := s.repo.UpdateAccountBalance(ctx, accountID, negativeAmount); err != nil {
			return nil, "", fmt.Errorf("failed to update from account balance: %w", err)
		}
		// Verify to account belongs to user
		toAccount, err := s.repo.GetAccount(ctx, relatedAccountID, userID)
		if err != nil {
			return nil, "", fmt.Errorf("failed to get to account: %w", err)
		}
		if toAccount == nil {
			return nil, "", fmt.Errorf("to account not found or doesn't belong to user")
		}
		if err := s.repo.UpdateAccountBalance(ctx, relatedAccountID, amount); err != nil {
			return nil, "", fmt.Errorf("failed to update to account balance: %w", err)
		}
	}

	// Get updated balance
	updatedAccount, err := s.repo.GetAccount(ctx, accountID, userID)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get updated account: %w", err)
	}

	return updatedTx, updatedAccount.Balance, nil
}

func (s *Service) DeleteTransaction(ctx context.Context, userID, transactionID int64) error {
	// Get transaction
	tx, err := s.repo.GetTransaction(ctx, transactionID, userID)
	if err != nil {
		return fmt.Errorf("failed to get transaction: %w", err)
	}
	if tx == nil {
		return fmt.Errorf("transaction not found")
	}

	// Rollback balance
	if tx.Type == "expense" {
		// Rollback expense: add back to account
		if err := s.repo.UpdateAccountBalance(ctx, tx.AccountID, tx.Amount); err != nil {
			return fmt.Errorf("failed to rollback balance: %w", err)
		}
	} else if tx.Type == "income" {
		// Rollback income: subtract from account
		negativeAmount := "-" + tx.Amount
		if err := s.repo.UpdateAccountBalance(ctx, tx.AccountID, negativeAmount); err != nil {
			return fmt.Errorf("failed to rollback balance: %w", err)
		}
	} else if tx.Type == "transfer" {
		// Rollback transfer: restore both accounts
		if tx.RelatedAccountID.Valid {
			if err := s.repo.UpdateAccountBalance(ctx, tx.AccountID, tx.Amount); err != nil {
				return fmt.Errorf("failed to rollback from account: %w", err)
			}
			negativeAmount := "-" + tx.Amount
			if err := s.repo.UpdateAccountBalance(ctx, tx.RelatedAccountID.Int64, negativeAmount); err != nil {
				return fmt.Errorf("failed to rollback to account: %w", err)
			}
		}
	}

	// Delete transaction
	_, err = s.repo.DeleteTransaction(ctx, transactionID, userID)
	if err != nil {
		return fmt.Errorf("failed to delete transaction: %w", err)
	}

	return nil
}

