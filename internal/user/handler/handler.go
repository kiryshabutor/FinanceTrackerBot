package handler

import (
	"context"
	"database/sql"

	"github.com/kiribu/financial-tracker/internal/user/service"
	pb "github.com/kiribu/financial-tracker/proto/user"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Handler struct {
	pb.UnimplementedUserServiceServer
	service *service.Service
	logger  *zap.Logger
}

func NewHandler(svc *service.Service, logger *zap.Logger) *Handler {
	return &Handler{
		service: svc,
		logger:  logger,
	}
}

func (h *Handler) GetOrCreateUser(ctx context.Context, req *pb.GetOrCreateUserRequest) (*pb.UserResponse, error) {
	user, err := h.service.GetOrCreateUser(ctx, req.TelegramId, req.Username, req.FirstName, req.LastName)
	if err != nil {
		h.logger.Error("failed to get or create user", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to get or create user: %v", err)
	}

	return &pb.UserResponse{
		UserId:    user.ID,
		TelegramId: user.TelegramID,
		Username:   getStringValue(user.Username),
		FirstName:  user.FirstName,
		LastName:   getStringValue(user.LastName),
		CreatedAt:  user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}, nil
}

func (h *Handler) GetUserByTelegramId(ctx context.Context, req *pb.GetUserByTelegramIdRequest) (*pb.UserResponse, error) {
	user, err := h.service.GetUserByTelegramID(ctx, req.TelegramId)
	if err != nil {
		h.logger.Error("failed to get user by telegram id", zap.Error(err))
		return nil, status.Errorf(codes.Internal, "failed to get user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.NotFound, "user not found")
	}

	return &pb.UserResponse{
		UserId:    user.ID,
		TelegramId: user.TelegramID,
		Username:   getStringValue(user.Username),
		FirstName:  user.FirstName,
		LastName:   getStringValue(user.LastName),
		CreatedAt:  user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}, nil
}

func getStringValue(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}
