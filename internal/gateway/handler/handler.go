package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kiribu/financial-tracker/internal/gateway/cache"
	"github.com/kiribu/financial-tracker/internal/gateway/client"
	pbLedger "github.com/kiribu/financial-tracker/proto/ledger"
	pbUser "github.com/kiribu/financial-tracker/proto/user"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Handler struct {
	clients *client.Clients
	cache   *cache.Cache
	logger  *zap.Logger
}

func NewHandler(clients *client.Clients, cache *cache.Cache, logger *zap.Logger) *Handler {
	return &Handler{
		clients: clients,
		cache:   cache,
		logger:  logger,
	}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	// Web App static files
	r.Handle("/webapp/*", http.StripPrefix("/webapp/", http.FileServer(http.Dir("./webapp"))))
	r.Get("/webapp", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./webapp/index.html")
	})

	r.Route("/api", func(r chi.Router) {
		r.Post("/bot/start", h.Start)
		r.Get("/accounts", h.ListAccounts)
		r.Post("/accounts", h.CreateAccount)
		r.Put("/accounts/{id}", h.UpdateAccount)
		r.Delete("/accounts/{id}", h.DeleteAccount)
		r.Get("/categories", h.ListCategories)
		r.Post("/categories", h.CreateCategory)
		r.Delete("/categories/{id}", h.DeleteCategory)
		r.Post("/transactions/expense", h.CreateExpense)
		r.Post("/transactions/income", h.CreateIncome)
		r.Post("/transactions/transfer", h.CreateTransfer)
		r.Put("/transactions/{id}", h.UpdateTransaction)
		r.Delete("/transactions/{id}", h.DeleteTransaction)
		r.Get("/balance", h.GetBalance)
		r.Get("/transactions", h.ListTransactions)
		r.Get("/stats/overview", h.GetStatsOverview)
		r.Get("/stats/by-category", h.GetStatsByCategory)
	})
}

func (h *Handler) getUserID(telegramID int64) (int64, error) {
	ctx := context.Background()

	// Try cache first
	if userID, found, err := h.cache.GetUserID(ctx, telegramID); err == nil && found {
		return userID, nil
	}

	// Get from User Service
	userID, err := h.clients.GetUserIDByTelegramID(ctx, telegramID)
	if err != nil {
		return 0, err
	}

	// Cache it
	_ = h.cache.SetUserID(ctx, telegramID, userID)

	return userID, nil
}

func (h *Handler) Start(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TelegramID int64  `json:"telegram_id"`
		Username   string `json:"username"`
		FirstName  string `json:"first_name"`
		LastName   string `json:"last_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.User.GetOrCreateUser(ctx, &pbUser.GetOrCreateUserRequest{
		TelegramId: req.TelegramID,
		Username:   req.Username,
		FirstName: req.FirstName,
		LastName:  req.LastName,
	})
	if err != nil {
		h.logger.Error("failed to get or create user", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	// Cache user_id
	_ = h.cache.SetUserID(ctx, req.TelegramID, resp.UserId)

	// Check if user is new by checking if they have accounts
	// New users will have only the default account created just now
	accountsResp, err := h.clients.Ledger.ListAccounts(ctx, &pbLedger.ListAccountsRequest{
		UserId: resp.UserId,
	})
	isNewUser := false
	if err == nil && accountsResp != nil && len(accountsResp.Accounts) <= 1 {
		// Check if the only account is the default one created recently
		// Parse created_at to check if user was created recently
		createdAt, err := time.Parse("2006-01-02T15:04:05Z07:00", resp.CreatedAt)
		if err == nil {
			// If user was created within last 10 seconds, consider them new
			isNewUser = time.Since(createdAt) < 10*time.Second
		}
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"user_id": resp.UserId,
		"is_new":  isNewUser,
	})
}

func (h *Handler) ListAccounts(w http.ResponseWriter, r *http.Request) {
	telegramID, err := h.getTelegramID(r)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "telegram_id is required")
		return
	}

	userID, err := h.getUserID(telegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.ListAccounts(ctx, &pbLedger.ListAccountsRequest{
		UserId: userID,
	})
	if err != nil {
		h.logger.Error("failed to list accounts", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "failed to list accounts")
		return
	}

	var accounts []map[string]interface{}
	for _, acc := range resp.Accounts {
		accounts = append(accounts, map[string]interface{}{
			"id":         acc.Id,
			"name":       acc.Name,
			"currency":   acc.Currency,
			"balance":    acc.Balance,
			"is_archived": acc.IsArchived,
			"is_default": acc.IsDefault,
		})
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"accounts": accounts,
	})
}

func (h *Handler) CreateAccount(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TelegramID int64  `json:"telegram_id"`
		Name        string `json:"name"`
		Currency    string `json:"currency"`
		Balance     string `json:"balance"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	userID, err := h.getUserID(req.TelegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	if req.Currency == "" {
		req.Currency = "RUB"
	}

	ctx := r.Context()
	createReq := &pbLedger.CreateAccountRequest{
		UserId:   userID,
		Name:     req.Name,
		Currency: req.Currency,
	}
	
	// Set balance if provided
	if req.Balance != "" {
		createReq.Balance = req.Balance
	}
	
	resp, err := h.clients.Ledger.CreateAccount(ctx, createReq)
	if err != nil {
		h.logger.Error("failed to create account", zap.Error(err))
		if st, ok := status.FromError(err); ok {
			h.respondError(w, http.StatusBadRequest, st.Message())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to create account")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"account_id": resp.AccountId,
		"name":       resp.Name,
		"currency":   resp.Currency,
		"balance":    resp.Balance,
	})
}

func (h *Handler) UpdateAccount(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TelegramID int64  `json:"telegram_id"`
		Name       string `json:"name"`
		Balance    string `json:"balance"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	accountIDStr := chi.URLParam(r, "id")
	accountID, err := strconv.ParseInt(accountIDStr, 10, 64)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid account id")
		return
	}

	userID, err := h.getUserID(req.TelegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.UpdateAccount(ctx, &pbLedger.UpdateAccountRequest{
		UserId:    userID,
		AccountId: accountID,
		Name:      req.Name,
		Balance:   req.Balance,
	})
	if err != nil {
		h.logger.Error("failed to update account", zap.Error(err))
		if st, ok := status.FromError(err); ok {
			statusCode := http.StatusInternalServerError
			if st.Code() == codes.NotFound {
				statusCode = http.StatusNotFound
			}
			h.respondError(w, statusCode, st.Message())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to update account")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"account_id": resp.AccountId,
		"name":       resp.Name,
		"currency":   resp.Currency,
		"balance":    resp.Balance,
	})
}

func (h *Handler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	telegramID, err := h.getTelegramID(r)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "telegram_id is required")
		return
	}

	accountIDStr := chi.URLParam(r, "id")
	accountID, err := strconv.ParseInt(accountIDStr, 10, 64)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid account id")
		return
	}

	userID, err := h.getUserID(telegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.DeleteAccount(ctx, &pbLedger.DeleteAccountRequest{
		UserId:    userID,
		AccountId: accountID,
	})
	if err != nil {
		h.logger.Error("failed to delete account", zap.Error(err))
		if st, ok := status.FromError(err); ok {
			statusCode := http.StatusInternalServerError
			if st.Code() == codes.NotFound {
				statusCode = http.StatusNotFound
			} else if st.Code() == codes.FailedPrecondition {
				statusCode = http.StatusBadRequest
			}
			h.respondError(w, statusCode, st.Message())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to delete account")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"status": resp.Status,
	})
}

func (h *Handler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	telegramID, err := h.getTelegramID(r)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "telegram_id is required")
		return
	}

	categoryIDStr := chi.URLParam(r, "id")
	categoryID, err := strconv.ParseInt(categoryIDStr, 10, 64)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid category id")
		return
	}

	userID, err := h.getUserID(telegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.DeleteCategory(ctx, &pbLedger.DeleteCategoryRequest{
		UserId:     userID,
		CategoryId: categoryID,
	})
	if err != nil {
		h.logger.Error("failed to delete category", zap.Error(err))
		if st, ok := status.FromError(err); ok {
			statusCode := http.StatusInternalServerError
			if st.Code() == codes.NotFound {
				statusCode = http.StatusNotFound
			} else if st.Code() == codes.PermissionDenied {
				statusCode = http.StatusForbidden
			}
			h.respondError(w, statusCode, st.Message())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to delete category")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"status": resp.Status,
	})
}

func (h *Handler) ListCategories(w http.ResponseWriter, r *http.Request) {
	telegramID, err := h.getTelegramID(r)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "telegram_id is required")
		return
	}

	userID, err := h.getUserID(telegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	categoryType := r.URL.Query().Get("type")
	if categoryType == "" {
		categoryType = "expense"
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.ListCategories(ctx, &pbLedger.ListCategoriesRequest{
		UserId: userID,
		Type:   categoryType,
	})
	if err != nil {
		h.logger.Error("failed to list categories", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "failed to list categories")
		return
	}

	var categories []map[string]interface{}
	for _, cat := range resp.Categories {
		categories = append(categories, map[string]interface{}{
			"id":   cat.Id,
			"name": cat.Name,
			"type": cat.Type,
		})
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"categories": categories,
	})
}

func (h *Handler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TelegramID int64  `json:"telegram_id"`
		Name       string `json:"name"`
		Type       string `json:"type"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	userID, err := h.getUserID(req.TelegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.CreateCategory(ctx, &pbLedger.CreateCategoryRequest{
		UserId: userID,
		Name:   req.Name,
		Type:   req.Type,
	})
	if err != nil {
		h.logger.Error("failed to create category", zap.Error(err))
		if st, ok := status.FromError(err); ok {
			h.respondError(w, http.StatusBadRequest, st.Message())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to create category")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"category_id": resp.CategoryId,
		"name":        resp.Name,
		"type":        resp.Type,
	})
}

func (h *Handler) CreateExpense(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TelegramID   int64  `json:"telegram_id"`
		AccountID    int64  `json:"account_id"`
		Amount       string `json:"amount"`
		CategoryID   int64  `json:"category_id"`
		Description  string `json:"description"`
		OperationDate string `json:"operation_date"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	userID, err := h.getUserID(req.TelegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	// Использовать переданную дату или текущую дату
	operationDate := req.OperationDate
	if operationDate == "" {
		operationDate = time.Now().Format(time.RFC3339)
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.CreateExpense(ctx, &pbLedger.CreateExpenseRequest{
		UserId:       userID,
		AccountId:    req.AccountID,
		Amount:       req.Amount,
		CategoryId:   req.CategoryID,
		Description: req.Description,
		OperationDate: operationDate,
	})
	if err != nil {
		h.logger.Error("failed to create expense", zap.Error(err))
		if st, ok := status.FromError(err); ok {
			h.respondError(w, http.StatusBadRequest, st.Message())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to create expense")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":         resp.Status,
		"transaction_id": resp.TransactionId,
		"account_balance": resp.AccountBalance,
	})
}

func (h *Handler) CreateIncome(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TelegramID   int64  `json:"telegram_id"`
		AccountID    int64  `json:"account_id"`
		Amount       string `json:"amount"`
		CategoryID   int64  `json:"category_id"`
		Description  string `json:"description"`
		OperationDate string `json:"operation_date"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	userID, err := h.getUserID(req.TelegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	// Использовать переданную дату или текущую дату
	operationDate := req.OperationDate
	if operationDate == "" {
		operationDate = time.Now().Format(time.RFC3339)
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.CreateIncome(ctx, &pbLedger.CreateIncomeRequest{
		UserId:       userID,
		AccountId:    req.AccountID,
		Amount:       req.Amount,
		CategoryId:   req.CategoryID,
		Description: req.Description,
		OperationDate: operationDate,
	})
	if err != nil {
		h.logger.Error("failed to create income", zap.Error(err))
		if st, ok := status.FromError(err); ok {
			h.respondError(w, http.StatusBadRequest, st.Message())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to create income")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":         resp.Status,
		"transaction_id": resp.TransactionId,
		"account_balance": resp.AccountBalance,
	})
}

func (h *Handler) CreateTransfer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TelegramID    int64  `json:"telegram_id"`
		FromAccountID int64  `json:"from_account_id"`
		ToAccountID   int64  `json:"to_account_id"`
		Amount        string `json:"amount"`
		Description   string `json:"description"`
		OperationDate string `json:"operation_date"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.FromAccountID == req.ToAccountID {
		h.respondError(w, http.StatusBadRequest, "нельзя переводить с одного и того же счета на этот же")
		return
	}

	userID, err := h.getUserID(req.TelegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	// Использовать переданную дату или текущую дату
	operationDate := req.OperationDate
	if operationDate == "" {
		operationDate = time.Now().Format(time.RFC3339)
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.CreateTransfer(ctx, &pbLedger.CreateTransferRequest{
		UserId:        userID,
		FromAccountId: req.FromAccountID,
		ToAccountId:   req.ToAccountID,
		Amount:        req.Amount,
		Description:   req.Description,
		OperationDate: operationDate,
	})
	if err != nil {
		h.logger.Error("failed to create transfer", zap.Error(err))
		if st, ok := status.FromError(err); ok {
			h.respondError(w, http.StatusBadRequest, st.Message())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to create transfer")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":             resp.Status,
		"from_account_balance": resp.FromAccountBalance,
		"to_account_balance":   resp.ToAccountBalance,
	})
}

func (h *Handler) GetBalance(w http.ResponseWriter, r *http.Request) {
	telegramID, err := h.getTelegramID(r)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "telegram_id is required")
		return
	}

	userID, err := h.getUserID(telegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.GetBalance(ctx, &pbLedger.GetBalanceRequest{
		UserId: userID,
	})
	if err != nil {
		h.logger.Error("failed to get balance", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "failed to get balance")
		return
	}

	var accounts []map[string]interface{}
	for _, acc := range resp.Accounts {
		accounts = append(accounts, map[string]interface{}{
			"id":         acc.Id,
			"name":       acc.Name,
			"currency":   acc.Currency,
			"balance":    acc.Balance,
			"is_archived": acc.IsArchived,
			"is_default": acc.IsDefault,
		})
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"accounts": accounts,
	})
}

func (h *Handler) ListTransactions(w http.ResponseWriter, r *http.Request) {
	telegramID, err := h.getTelegramID(r)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "telegram_id is required")
		return
	}

	userID, err := h.getUserID(telegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "week"
	}

	limitStr := r.URL.Query().Get("limit")
	limit := int32(100)
	if limitStr != "" {
		if l, err := strconv.ParseInt(limitStr, 10, 32); err == nil {
			limit = int32(l)
		}
	}

	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	ctx := r.Context()
	resp, err := h.clients.Ledger.ListTransactions(ctx, &pbLedger.ListTransactionsRequest{
		UserId:    userID,
		Period:    period,
		Limit:     limit,
		StartDate: startDate,
		EndDate:   endDate,
	})
	if err != nil {
		h.logger.Error("failed to list transactions", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "failed to list transactions")
		return
	}

	var transactions []map[string]interface{}
	for _, tx := range resp.Transactions {
		txMap := map[string]interface{}{
			"id":            tx.Id,
			"type":          tx.Type,
			"amount":        tx.Amount,
			"currency":      tx.Currency,
			"category_name": tx.CategoryName,
			"account_name":  tx.AccountName,
			"operation_date": tx.OperationDate,
			"description":   tx.Description,
			"account_id":    tx.AccountId,
		}
		if tx.RelatedAccountId > 0 {
			txMap["related_account_id"] = tx.RelatedAccountId
		}
		if tx.CategoryId > 0 {
			txMap["category_id"] = tx.CategoryId
		}
		transactions = append(transactions, txMap)
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"transactions": transactions,
	})
}

func (h *Handler) UpdateTransaction(w http.ResponseWriter, r *http.Request) {
	telegramID, err := h.getTelegramID(r)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "telegram_id is required")
		return
	}

	transactionIDStr := chi.URLParam(r, "id")
	transactionID, err := strconv.ParseInt(transactionIDStr, 10, 64)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid transaction id")
		return
	}

	var req struct {
		AccountID      int64  `json:"account_id"`
		Amount         string `json:"amount"`
		CategoryID     int64  `json:"category_id"`
		Description    string `json:"description"`
		OperationDate  string `json:"operation_date"`
		RelatedAccountID int64 `json:"related_account_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	userID, err := h.getUserID(telegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	operationDate := req.OperationDate
	if operationDate == "" {
		operationDate = time.Now().Format(time.RFC3339)
	}

	ctx := r.Context()
	updateReq := &pbLedger.UpdateTransactionRequest{
		UserId:        userID,
		TransactionId: transactionID,
		AccountId:     req.AccountID,
		Amount:        req.Amount,
		CategoryId:    req.CategoryID,
		Description:   req.Description,
		OperationDate: operationDate,
	}
	if req.RelatedAccountID > 0 {
		updateReq.RelatedAccountId = req.RelatedAccountID
	}
	resp, err := h.clients.Ledger.UpdateTransaction(ctx, updateReq)
	if err != nil {
		h.logger.Error("failed to update transaction", zap.Error(err))
		if st, ok := status.FromError(err); ok {
			h.respondError(w, http.StatusBadRequest, st.Message())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to update transaction")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":         resp.Status,
		"transaction_id": resp.TransactionId,
		"account_balance": resp.AccountBalance,
	})
}

func (h *Handler) DeleteTransaction(w http.ResponseWriter, r *http.Request) {
	telegramID, err := h.getTelegramID(r)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "telegram_id is required")
		return
	}

	transactionIDStr := chi.URLParam(r, "id")
	transactionID, err := strconv.ParseInt(transactionIDStr, 10, 64)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "invalid transaction id")
		return
	}

	userID, err := h.getUserID(telegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.Ledger.DeleteTransaction(ctx, &pbLedger.DeleteTransactionRequest{
		UserId:        userID,
		TransactionId: transactionID,
	})
	if err != nil {
		h.logger.Error("failed to delete transaction", zap.Error(err))
		if st, ok := status.FromError(err); ok {
			h.respondError(w, http.StatusBadRequest, st.Message())
			return
		}
		h.respondError(w, http.StatusInternalServerError, "failed to delete transaction")
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"status": resp.Status,
	})
}

func (h *Handler) GetStatsOverview(w http.ResponseWriter, r *http.Request) {
	telegramID, err := h.getTelegramID(r)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "telegram_id is required")
		return
	}

	userID, err := h.getUserID(telegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "week"
	}

	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	ctx := r.Context()
	// Get all transactions for the period
	resp, err := h.clients.Ledger.ListTransactions(ctx, &pbLedger.ListTransactionsRequest{
		UserId:    userID,
		Period:    period,
		StartDate: startDate,
		EndDate:   endDate,
		Limit:     10000, // Get all transactions
	})
	if err != nil {
		h.logger.Error("failed to get transactions for stats", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "failed to get stats")
		return
	}

	// Calculate totals
	var totalExpense, totalIncome float64
	for _, tx := range resp.Transactions {
		amount, err := strconv.ParseFloat(tx.Amount, 64)
		if err != nil {
			continue
		}
		if tx.Type == "expense" {
			totalExpense += amount
		} else if tx.Type == "income" {
			totalIncome += amount
		}
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"period":       period,
		"total_expense": fmt.Sprintf("%.2f", totalExpense),
		"total_income":  fmt.Sprintf("%.2f", totalIncome),
	})
}

func (h *Handler) GetStatsByCategory(w http.ResponseWriter, r *http.Request) {
	telegramID, err := h.getTelegramID(r)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, "telegram_id is required")
		return
	}

	userID, err := h.getUserID(telegramID)
	if err != nil {
		h.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "week"
	}

	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	ctx := r.Context()
	// Get all transactions for the period
	resp, err := h.clients.Ledger.ListTransactions(ctx, &pbLedger.ListTransactionsRequest{
		UserId:    userID,
		Period:    period,
		StartDate: startDate,
		EndDate:   endDate,
		Limit:     10000, // Get all transactions
	})
	if err != nil {
		h.logger.Error("failed to get transactions for category stats", zap.Error(err))
		h.respondError(w, http.StatusInternalServerError, "failed to get category stats")
		return
	}

	// Aggregate by category
	categoryStats := make(map[string]float64) // category_name -> total_expense
	for _, tx := range resp.Transactions {
		if tx.Type == "expense" && tx.CategoryName != "" {
			amount, err := strconv.ParseFloat(tx.Amount, 64)
			if err != nil {
				continue
			}
			categoryStats[tx.CategoryName] += amount
		}
	}

	// Convert to response format
	var categories []map[string]interface{}
	for categoryName, totalExpense := range categoryStats {
		categories = append(categories, map[string]interface{}{
			"name":          categoryName,
			"total_expense": fmt.Sprintf("%.2f", totalExpense),
		})
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"period":     period,
		"categories": categories,
	})
}

func (h *Handler) getTelegramID(r *http.Request) (int64, error) {
	telegramIDStr := r.URL.Query().Get("telegram_id")
	if telegramIDStr == "" {
		return 0, fmt.Errorf("telegram_id is required")
	}
	return strconv.ParseInt(telegramIDStr, 10, 64)
}

func (h *Handler) respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) respondError(w http.ResponseWriter, status int, message string) {
	h.respondJSON(w, status, map[string]string{
		"error": message,
	})
}

