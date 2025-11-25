package client

import (
	"context"

	"github.com/kiribu/financial-tracker/internal/pkg/config"
	pbLedger "github.com/kiribu/financial-tracker/proto/ledger"
	pbUser "github.com/kiribu/financial-tracker/proto/user"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type Clients struct {
	User   pbUser.UserServiceClient
	Ledger pbLedger.LedgerServiceClient
	conns  []*grpc.ClientConn
	logger *zap.Logger
}

func NewClients(cfg *config.ServicesConfig, logger *zap.Logger) (*Clients, error) {
	clients := &Clients{
		logger: logger,
	}

	// User Service
	userConn, err := grpc.NewClient(cfg.UserService, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	clients.conns = append(clients.conns, userConn)
	clients.User = pbUser.NewUserServiceClient(userConn)

	// Ledger Service
	ledgerConn, err := grpc.NewClient(cfg.LedgerService, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	clients.conns = append(clients.conns, ledgerConn)
	clients.Ledger = pbLedger.NewLedgerServiceClient(ledgerConn)

	return clients, nil
}

func (c *Clients) Close() {
	for _, conn := range c.conns {
		if err := conn.Close(); err != nil {
			c.logger.Error("failed to close gRPC connection", zap.Error(err))
		}
	}
}

func (c *Clients) GetUserIDByTelegramID(ctx context.Context, telegramID int64) (int64, error) {
	resp, err := c.User.GetUserByTelegramId(ctx, &pbUser.GetUserByTelegramIdRequest{
		TelegramId: telegramID,
	})
	if err != nil {
		return 0, err
	}
	return resp.UserId, nil
}