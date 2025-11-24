package cache

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type Cache struct {
	client *redis.Client
	logger *zap.Logger
}

func NewCache(addr string, logger *zap.Logger) (*Cache, error) {
	client := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	return &Cache{
		client: client,
		logger: logger,
	}, nil
}

func (c *Cache) GetUserID(ctx context.Context, telegramID int64) (int64, bool, error) {
	key := fmt.Sprintf("telegram_id:%d", telegramID)
	val, err := c.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}

	userID, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return 0, false, err
	}

	return userID, true, nil
}

func (c *Cache) SetUserID(ctx context.Context, telegramID, userID int64) error {
	key := fmt.Sprintf("telegram_id:%d", telegramID)
	return c.client.Set(ctx, key, userID, 24*time.Hour).Err()
}

func (c *Cache) Close() error {
	return c.client.Close()
}





