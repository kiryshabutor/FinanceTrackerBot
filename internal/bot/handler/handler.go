package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"go.uber.org/zap"
)

type Handler struct {
	bot        *tgbotapi.BotAPI
	gatewayURL string
	logger     *zap.Logger
}

func NewHandler(bot *tgbotapi.BotAPI, gatewayURL string, logger *zap.Logger) *Handler {
	return &Handler{
		bot:        bot,
		gatewayURL: gatewayURL,
		logger:     logger,
	}
}

func (h *Handler) Cleanup() {
	h.logger.Info("Bot cleanup completed")
}

func (h *Handler) HandleUpdate(update tgbotapi.Update) {
	if update.Message == nil {
		return
	}

	msg := update.Message
	userID := msg.From.ID

	// Handle /start command
	if msg.IsCommand() && msg.Command() == "start" {
		h.handleStart(msg)
		return
	}

	// For any other message, just show the Web App button
	h.showWebAppButton(userID)
}

func (h *Handler) handleStart(msg *tgbotapi.Message) {
	userID := msg.From.ID

	req := map[string]interface{}{
		"telegram_id": userID,
		"username":    msg.From.UserName,
		"first_name":  msg.From.FirstName,
		"last_name":   msg.From.LastName,
	}

	resp, err := h.callGateway("POST", "/api/bot/start", req)
	if err != nil {
		h.logger.Error("failed to start user", zap.Error(err))
		h.sendMessage(userID, "Ошибка при регистрации. Попробуйте позже.")
		return
	}

	// Check if user is new or existing
	isNewUser := false
	if resp != nil {
		if isNew, ok := resp["is_new"].(bool); ok {
			isNewUser = isNew
		}
	}

	var text string
	if isNewUser {
		text = fmt.Sprintf("Привет, %s! 👋\n\nДобро пожаловать в Financial Tracker!\n\nНажмите кнопку ниже, чтобы открыть приложение.", msg.From.FirstName)
	} else {
		text = fmt.Sprintf("С возвращением, %s! 👋\n\nНажмите кнопку ниже, чтобы открыть приложение.", msg.From.FirstName)
	}
	
	h.sendMessage(userID, text)
	h.showWebAppButton(userID)
}

func (h *Handler) showWebAppButton(userID int64) {
	webAppURL := fmt.Sprintf("%s/webapp", h.gatewayURL)
	
	// Create WebApp button using URL (works in all versions)
	keyboard := tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonURL("🌐 Открыть приложение", webAppURL),
		),
	)

	msg := tgbotapi.NewMessage(userID, "🌐 Нажмите кнопку ниже, чтобы открыть приложение:")
	msg.ReplyMarkup = keyboard
	h.bot.Send(msg)
}

func (h *Handler) sendMessage(userID int64, text string) {
	msg := tgbotapi.NewMessage(userID, text)
	// Remove any keyboard
	msg.ReplyMarkup = tgbotapi.NewRemoveKeyboard(true)
	h.bot.Send(msg)
}

func (h *Handler) callGateway(method, path string, body interface{}) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s%s", h.gatewayURL, path)
	
	var reqBody []byte
	if body != nil {
		var err error
		reqBody, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequest(method, url, bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if resp.StatusCode == http.StatusOK {
		json.NewDecoder(resp.Body).Decode(&result)
	}

	return result, nil
}
