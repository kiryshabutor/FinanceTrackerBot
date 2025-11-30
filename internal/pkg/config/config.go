package config

import (
	"fmt"
	"os"

	"github.com/ilyakaznacheev/cleanenv"
)

type Config struct {
	Postgres PostgresConfig `yaml:"postgres"`
	Bot      BotConfig      `yaml:"bot"`
	Gateway  GatewayConfig  `yaml:"gateway"`
	Services ServicesConfig `yaml:"services"`
}

type PostgresConfig struct {
	Host     string `env:"POSTGRES_HOST" env-default:"localhost"`
	Port     string `env:"POSTGRES_PORT" env-default:"5432"`
	User     string `env:"POSTGRES_USER" env-default:"postgres"`
	Password string `env:"POSTGRES_PASSWORD" env-default:"postgres"`
	DB       string `env:"POSTGRES_DB" env-default:"finance_tracker"`
	SSLMode  string `env:"POSTGRES_SSLMODE" env-default:"disable"`
}

func (c PostgresConfig) DSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		c.User, c.Password, c.Host, c.Port, c.DB, c.SSLMode)
}

type BotConfig struct {
	Token      string `env:"BOT_TOKEN" env-required:"true"`
	GatewayURL string `env:"GATEWAY_URL" env-default:"http://localhost:8080"`
}

type GatewayConfig struct {
	HTTPPort string `env:"HTTP_PORT" env-default:"8080"`
	Services ServicesConfig
}

type ServicesConfig struct {
	UserService   string `env:"USER_SERVICE_URL" env-default:"localhost:50051"`
	LedgerService string `env:"LEDGER_SERVICE_URL" env-default:"localhost:50052"`
}

type ServiceConfig struct {
	Postgres PostgresConfig
	GRPCPort string `env:"GRPC_PORT" env-default:"50051"`
}


func LoadConfig(cfg interface{}) error {
	if err := cleanenv.ReadEnv(cfg); err != nil {
		return fmt.Errorf("failed to read config: %w", err)
	}
	return nil
}

func MustLoadConfig(cfg interface{}) {
	if err := LoadConfig(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		os.Exit(1)
	}
}




