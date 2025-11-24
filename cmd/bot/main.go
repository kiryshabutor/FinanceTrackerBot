package main

import (
	"os"
	"os/signal"
	"syscall"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/kiribu/financial-tracker/internal/bot/handler"
	"github.com/kiribu/financial-tracker/internal/pkg/config"
	"github.com/kiribu/financial-tracker/internal/pkg/logger"
	"go.uber.org/zap"
)

func main() {
	cfg := &config.BotConfig{}
	config.MustLoadConfig(cfg)

	log := logger.MustNew("info")
	defer log.Sync()

	log.Info("Starting Bot Service", zap.String("gateway_url", cfg.GatewayURL))

	bot, err := tgbotapi.NewBotAPI(cfg.Token)
	if err != nil {
		log.Fatal("Failed to create bot", zap.Error(err))
	}

	bot.Debug = false
	log.Info("Authorized", zap.String("bot_username", bot.Self.UserName))

	h := handler.NewHandler(bot, cfg.GatewayURL, log)

	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60

	updates := bot.GetUpdatesChan(u)

	log.Info("Bot is running and waiting for updates")

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case update := <-updates:
			h.HandleUpdate(update)
		case <-quit:
			log.Info("Shutting down Bot Service")
			bot.StopReceivingUpdates()
			h.Cleanup()
			log.Info("Bot Service stopped")
			return
		}
	}
}

