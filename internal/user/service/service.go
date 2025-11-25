package service

import (
	"context"
	"fmt"

	"github.com/kiribu/financial-tracker/internal/user/repository"
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

func (s *Service) GetOrCreateUser(ctx context.Context, telegramID int64, username, firstName, lastName string) (*repository.User, error) {
	user, err := s.repo.GetOrCreateUser(ctx, telegramID, username, firstName, lastName)
	if err != nil {
		s.logger.Error("failed to get or create user", zap.Error(err))
		return nil, fmt.Errorf("failed to get or create user: %w", err)
	}
	return user, nil
}

func (s *Service) GetUserByTelegramID(ctx context.Context, telegramID int64) (*repository.User, error) {
	user, err := s.repo.GetUserByTelegramID(ctx, telegramID)
	if err != nil {
		s.logger.Error("failed to get user by telegram id", zap.Error(err))
		return nil, fmt.Errorf("failed to get user by telegram id: %w", err)
	}
	return user, nil
}
