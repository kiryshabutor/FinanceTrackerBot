package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/kiribu/financial-tracker/internal/gateway/client"
	"github.com/kiribu/financial-tracker/internal/gateway/handler"
	"github.com/kiribu/financial-tracker/internal/pkg/config"
	"github.com/kiribu/financial-tracker/internal/pkg/logger"
	"go.uber.org/zap"
)

func main() {
	cfg := &config.GatewayConfig{}
	config.MustLoadConfig(cfg)

	log := logger.MustNew("info")
	defer log.Sync()

	log.Info("Starting API Gateway", zap.String("port", cfg.HTTPPort))

	// Initialize gRPC clients
	clients, err := client.NewClients(&cfg.Services, log)
	if err != nil {
		log.Fatal("Failed to create gRPC clients", zap.Error(err))
	}
	defer clients.Close()

	// Initialize handler
	h := handler.NewHandler(clients, log)

	// Setup router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)

	h.RegisterRoutes(r)

	// Start HTTP server
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.HTTPPort),
		Handler: r,
	}

	log.Info("API Gateway is running", zap.String("address", srv.Addr))

	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Failed to start server", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down API Gateway")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Error("Server forced to shutdown", zap.Error(err))
	}
}

