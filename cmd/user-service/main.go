package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kiribu/financial-tracker/internal/pkg/config"
	"github.com/kiribu/financial-tracker/internal/pkg/logger"
	"github.com/kiribu/financial-tracker/internal/user/handler"
	"github.com/kiribu/financial-tracker/internal/user/repository"
	"github.com/kiribu/financial-tracker/internal/user/service"
	pb "github.com/kiribu/financial-tracker/proto/user"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

func main() {
	cfg := &config.ServiceConfig{}
	config.MustLoadConfig(cfg)

	log := logger.MustNew("info")
	defer log.Sync()

	log.Info("Starting User Service", zap.String("port", cfg.GRPCPort))

	// Connect to PostgreSQL
	ctx := context.Background()
	db, err := pgxpool.New(ctx, cfg.Postgres.DSN())
	if err != nil {
		log.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer db.Close()

	if err := db.Ping(ctx); err != nil {
		log.Fatal("Failed to ping database", zap.Error(err))
	}
	log.Info("Connected to PostgreSQL")

	// Initialize repository, service, and handler
	repo := repository.NewRepository(db, log)
	svc := service.NewService(repo, log)
	h := handler.NewHandler(svc, log)

	// Start gRPC server
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.GRPCPort))
	if err != nil {
		log.Fatal("Failed to listen", zap.Error(err))
	}

	s := grpc.NewServer()
	pb.RegisterUserServiceServer(s, h)

	log.Info("User Service is running", zap.String("address", lis.Addr().String()))

	// Graceful shutdown
	go func() {
		if err := s.Serve(lis); err != nil {
			log.Fatal("Failed to serve", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down User Service")
	s.GracefulStop()
}

