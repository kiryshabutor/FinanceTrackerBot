package handler

import (
	"context"
	"time"

	"github.com/kiribu/financial-tracker/internal/ledger/service"
	pb "github.com/kiribu/financial-tracker/proto/ledger"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Handler struct {
	pb.UnimplementedLedgerServiceServer
	service *service.Service
	logger  *zap.Logger
}

func NewHandler(svc *service.Service, logger *zap.Logger) *Handler {
	return &Handler{
		service: svc,
		logger:  logger,
	}
}

func (h *Handler) CreateExpense(ctx context.Context, req *pb.CreateExpenseRequest) (*pb.TransactionResponse, error) {
	operationDate, err := parseTime(req.OperationDate)
	if err != nil {
		operationDate = time.Now()
	}

	tx, balance, err := h.service.CreateExpense(ctx, req.UserId, req.AccountId, req.Amount, req.CategoryId, req.Description, operationDate)
	if err != nil {
		h.logger.Error("failed to create expense", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to create expense: %v", err)
	}

	return &pb.TransactionResponse{
		TransactionId: tx.ID,
		AccountBalance: balance,
		Status:         "ok",
	}, nil
}

func (h *Handler) CreateIncome(ctx context.Context, req *pb.CreateIncomeRequest) (*pb.TransactionResponse, error) {
	operationDate, err := parseTime(req.OperationDate)
	if err != nil {
		operationDate = time.Now()
	}

	tx, balance, err := h.service.CreateIncome(ctx, req.UserId, req.AccountId, req.Amount, req.CategoryId, req.Description, operationDate)
	if err != nil {
		h.logger.Error("failed to create income", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to create income: %v", err)
	}

	return &pb.TransactionResponse{
		TransactionId: tx.ID,
		AccountBalance: balance,
		Status:         "ok",
	}, nil
}

func (h *Handler) CreateTransfer(ctx context.Context, req *pb.CreateTransferRequest) (*pb.TransferResponse, error) {
	operationDate, err := parseTime(req.OperationDate)
	if err != nil {
		operationDate = time.Now()
	}

	tx, fromBalance, toBalance, err := h.service.CreateTransfer(ctx, req.UserId, req.FromAccountId, req.ToAccountId, req.Amount, req.Description, operationDate)
	if err != nil {
		h.logger.Error("failed to create transfer", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to create transfer: %v", err)
	}

	return &pb.TransferResponse{
		TransactionId:      tx.ID,
		FromAccountBalance: fromBalance,
		ToAccountBalance:   toBalance,
		Status:             "ok",
	}, nil
}

func (h *Handler) ListAccounts(ctx context.Context, req *pb.ListAccountsRequest) (*pb.ListAccountsResponse, error) {
	accounts, err := h.service.ListAccounts(ctx, req.UserId)
	if err != nil {
		h.logger.Error("failed to list accounts", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to list accounts: %v", err)
	}

	var pbAccounts []*pb.Account
	for _, acc := range accounts {
		pbAccounts = append(pbAccounts, &pb.Account{
			Id:         acc.ID,
			Name:       acc.Name,
			Currency:   acc.Currency,
			Balance:    acc.Balance,
			IsArchived: acc.IsArchived,
			IsDefault:  acc.IsDefault,
		})
	}

	return &pb.ListAccountsResponse{
		Accounts: pbAccounts,
	}, nil
}

func (h *Handler) CreateAccount(ctx context.Context, req *pb.CreateAccountRequest) (*pb.AccountResponse, error) {
	account, err := h.service.CreateAccount(ctx, req.UserId, req.Name, req.Currency, req.Balance)
	if err != nil {
		h.logger.Error("failed to create account", zap.Error(err))
		if err.Error() == "account name cannot be empty" {
			return nil, status.Errorf(codes.InvalidArgument, "account name cannot be empty")
		}
		if err.Error() == "счет с таким названием уже существует" {
			return nil, status.Errorf(codes.InvalidArgument, "счет с таким названием уже существует")
		}
		return nil, status.Errorf(codes.Internal, "failed to create account: %v", err)
	}

	return &pb.AccountResponse{
		AccountId: account.ID,
		Name:      account.Name,
		Currency:  account.Currency,
		Balance:   account.Balance,
	}, nil
}

func (h *Handler) UpdateAccount(ctx context.Context, req *pb.UpdateAccountRequest) (*pb.AccountResponse, error) {
	account, err := h.service.UpdateAccount(ctx, req.UserId, req.AccountId, req.Name, req.Balance)
	if err != nil {
		h.logger.Error("failed to update account", zap.Error(err))
		if err.Error() == "account not found or doesn't belong to user" {
			return nil, status.Errorf(codes.NotFound, "account not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to update account: %v", err)
	}

	return &pb.AccountResponse{
		AccountId: account.ID,
		Name:      account.Name,
		Currency:  account.Currency,
		Balance:   account.Balance,
	}, nil
}

func (h *Handler) DeleteAccount(ctx context.Context, req *pb.DeleteAccountRequest) (*pb.DeleteAccountResponse, error) {
	err := h.service.DeleteAccount(ctx, req.UserId, req.AccountId)
	if err != nil {
		h.logger.Error("failed to delete account", zap.Error(err))
		if err.Error() == "account not found" {
			return nil, status.Errorf(codes.NotFound, "account not found")
		}
		if err.Error() == "cannot delete default account" {
			return nil, status.Errorf(codes.FailedPrecondition, "cannot delete default account")
		}
		if err.Error() == "cannot delete account with non-zero balance" {
			return nil, status.Errorf(codes.FailedPrecondition, "cannot delete account with non-zero balance")
		}
		return nil, status.Errorf(codes.Internal, "failed to delete account: %v", err)
	}

	return &pb.DeleteAccountResponse{
		Status: "ok",
	}, nil
}

func (h *Handler) CreateCategory(ctx context.Context, req *pb.CreateCategoryRequest) (*pb.CategoryResponse, error) {
	category, err := h.service.CreateCategory(ctx, req.UserId, req.Name, req.Type)
	if err != nil {
		h.logger.Error("failed to create category", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to create category: %v", err)
	}

	return &pb.CategoryResponse{
		CategoryId: category.ID,
		Name:       category.Name,
		Type:       category.Type,
	}, nil
}

func (h *Handler) DeleteCategory(ctx context.Context, req *pb.DeleteCategoryRequest) (*pb.DeleteCategoryResponse, error) {
	err := h.service.DeleteCategory(ctx, req.UserId, req.CategoryId)
	if err != nil {
		h.logger.Error("failed to delete category", zap.Error(err))
		if err.Error() == "category not found" {
			return nil, status.Errorf(codes.NotFound, "category not found")
		}
		if err.Error() == "cannot delete system category" {
			return nil, status.Errorf(codes.PermissionDenied, "cannot delete system category")
		}
		return nil, status.Errorf(codes.Internal, "failed to delete category: %v", err)
	}

	return &pb.DeleteCategoryResponse{
		Status: "ok",
	}, nil
}

func (h *Handler) ListCategories(ctx context.Context, req *pb.ListCategoriesRequest) (*pb.ListCategoriesResponse, error) {
	categories, err := h.service.ListCategories(ctx, req.UserId, req.Type)
	if err != nil {
		h.logger.Error("failed to list categories", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to list categories: %v", err)
	}

	var pbCategories []*pb.Category
	for _, cat := range categories {
		pbCategories = append(pbCategories, &pb.Category{
			Id:   cat.ID,
			Name: cat.Name,
			Type: cat.Type,
		})
	}

	return &pb.ListCategoriesResponse{
		Categories: pbCategories,
	}, nil
}

func (h *Handler) ListTransactions(ctx context.Context, req *pb.ListTransactionsRequest) (*pb.ListTransactionsResponse, error) {
	limit := req.Limit
	if limit <= 0 {
		limit = 10
	}

	transactions, err := h.service.ListTransactions(ctx, req.UserId, req.Period, limit, req.StartDate, req.EndDate)
	if err != nil {
		h.logger.Error("failed to list transactions", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to list transactions: %v", err)
	}

	var pbTransactions []*pb.Transaction
	for _, tx := range transactions {
		pbTx := &pb.Transaction{
			Id:           tx.ID,
			Type:         tx.Type,
			Amount:       tx.Amount,
			Currency:     tx.Currency,
			CategoryName: tx.CategoryName,
			AccountName:  tx.AccountName,
			OperationDate: tx.OperationDate.Format("2006-01-02T15:04:05Z07:00"),
			AccountId:    tx.AccountID,
		}
		if tx.Description.Valid {
			pbTx.Description = tx.Description.String
		}
		if tx.RelatedAccountID.Valid {
			pbTx.RelatedAccountId = tx.RelatedAccountID.Int64
		}
		if tx.CategoryID.Valid {
			pbTx.CategoryId = tx.CategoryID.Int64
		}
		pbTransactions = append(pbTransactions, pbTx)
	}

	return &pb.ListTransactionsResponse{
		Transactions: pbTransactions,
	}, nil
}

func (h *Handler) UpdateTransaction(ctx context.Context, req *pb.UpdateTransactionRequest) (*pb.TransactionResponse, error) {
	operationDate, err := parseTime(req.OperationDate)
	if err != nil {
		operationDate = time.Now()
	}

	relatedAccountID := int64(0)
	if req.RelatedAccountId > 0 {
		relatedAccountID = req.RelatedAccountId
	}

	tx, balance, err := h.service.UpdateTransaction(ctx, req.UserId, req.TransactionId, req.AccountId, req.Amount, req.CategoryId, req.Description, operationDate, relatedAccountID)
	if err != nil {
		h.logger.Error("failed to update transaction", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to update transaction: %v", err)
	}

	return &pb.TransactionResponse{
		TransactionId: tx.ID,
		AccountBalance: balance,
		Status:         "ok",
	}, nil
}

func (h *Handler) DeleteTransaction(ctx context.Context, req *pb.DeleteTransactionRequest) (*pb.DeleteTransactionResponse, error) {
	err := h.service.DeleteTransaction(ctx, req.UserId, req.TransactionId)
	if err != nil {
		h.logger.Error("failed to delete transaction", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to delete transaction: %v", err)
	}

	return &pb.DeleteTransactionResponse{
		Status: "ok",
	}, nil
}

func (h *Handler) GetBalance(ctx context.Context, req *pb.GetBalanceRequest) (*pb.GetBalanceResponse, error) {
	accounts, err := h.service.GetBalance(ctx, req.UserId)
	if err != nil {
		h.logger.Error("failed to get balance", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to get balance: %v", err)
	}

	var pbAccounts []*pb.Account
	for _, acc := range accounts {
		pbAccounts = append(pbAccounts, &pb.Account{
			Id:         acc.ID,
			Name:       acc.Name,
			Currency:   acc.Currency,
			Balance:    acc.Balance,
			IsArchived: acc.IsArchived,
			IsDefault:  acc.IsDefault,
		})
	}

	return &pb.GetBalanceResponse{
		Accounts: pbAccounts,
	}, nil
}

func parseTime(timeStr string) (time.Time, error) {
	if timeStr == "" {
		return time.Time{}, nil
	}
	return time.Parse("2006-01-02T15:04:05Z07:00", timeStr)
}

