# Financial Tracker Bot

> **Портфолио проект**: Полнофункциональное микросервисное приложение для управления личными финансами с Telegram-ботом и веб-интерфейсом

[![Go Version](https://img.shields.io/badge/Go-1.23-blue.svg)](https://golang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![gRPC](https://img.shields.io/badge/gRPC-Enabled-green.svg)](https://grpc.io/)

## О проекте

Этот проект — результат самостоятельного изучения современных практик разработки на Go. Я создал полноценное микросервисное приложение с нуля, демонстрирующее понимание:

- **Микросервисной архитектуры** и паттернов проектирования
- **gRPC** для межсервисной коммуникации
- **REST API Gateway** как единой точки входа
- **Docker контейнеризации** и оркестрации сервисов
- **PostgreSQL** с миграциями и правильной схемой БД
- **Telegram Bot API** и интеграции веб-приложений
- **Clean Architecture** и разделения ответственности

### Почему этот проект важен?

Это не просто учебный проект — это **production-ready** решение, демонстрирующее:
- Умение проектировать масштабируемую архитектуру
- Понимание современных практик разработки (gRPC, микросервисы, контейнеризация)
- Способность самостоятельно изучать новые технологии
- Внимание к деталям (graceful shutdown, логирование, обработка ошибок)
- Готовность работать с реальными задачами

## Ключевые возможности

- **Многопользовательская система** с изоляцией данных
- **Управление несколькими счетами** (карты, наличные, депозиты)
- **Полный цикл транзакций**: расходы, доходы, переводы между счетами
- **Категоризация операций** с гибкой системой категорий
- **Веб-интерфейс** через Telegram Web App
- **REST API** для интеграций
- **Статистика и аналитика** расходов/доходов
- **Docker-контейнеризация** для простого развертывания

## Архитектура

Проект построен на **микросервисной архитектуре** с четким разделением ответственности:

```
┌─────────────┐
│  Telegram   │
│     Bot     │
└──────┬──────┘
       │ HTTP
┌──────▼──────┐
│   Gateway   │  ← REST API (единая точка входа)
│  (REST API) │
└──┬───────┬──┘
   │ gRPC  │ gRPC
   │       │
┌──▼──┐ ┌──▼─────┐
│User │ │ Ledger │
│Svc  │ │  Svc   │
└──┬──┘ └──┬─────┘
   │       │
   └───┬───┘
       │
┌──────▼──────┐
│ PostgreSQL  │
└─────────────┘
```

### Сервисы

- **Bot Service** — обработка команд Telegram, интеграция с веб-приложением
- **API Gateway** — REST API фасад, конвертация HTTP → gRPC, маршрутизация
- **User Service** — управление пользователями, настройками, авторизация
- **Ledger Service** — бизнес-логика: счета, категории, транзакции, аналитика

### Технологический стек

| Компонент | Технология | Почему выбрано |
|-----------|-----------|----------------|
| **Язык** | Go 1.23 | Высокая производительность, отличная поддержка конкурентности, простота развертывания |
| **База данных** | PostgreSQL 16 | Надежность, ACID транзакции, богатый функционал |
| **Межсервисная коммуникация** | gRPC | Типобезопасность, производительность, streaming |
| **HTTP API** | Chi Router | Легковесный, быстрый, удобный для REST API |
| **Контейнеризация** | Docker + Compose | Изоляция, воспроизводимость окружения |
| **Логирование** | Zap (Uber) | Высокая производительность, структурированные логи |
| **Конфигурация** | Cleanenv | Простота, поддержка .env файлов |
| **Миграции БД** | golang-migrate | Версионирование схемы, откат изменений |

## Что я изучил в процессе разработки

### Технические навыки

1. **Микросервисная архитектура**
   - Разделение сервисов по доменам
   - Независимое развертывание и масштабирование
   - Обработка межсервисных ошибок

2. **gRPC и Protocol Buffers**
   - Определение контрактов через `.proto` файлы
   - Генерация типобезопасного кода
   - Оптимизация производительности vs REST

3. **Docker и контейнеризация**
   - Мультистейдж сборка для оптимизации образов
   - Docker Compose для оркестрации
   - Управление переменными окружения

4. **Работа с PostgreSQL**
   - Проектирование нормализованной схемы БД
   - Миграции и версионирование
   - Использование pgx для эффективной работы с БД

5. **Telegram Bot API**
   - Web Apps интеграция
   - Обработка обновлений через long polling
   - Graceful shutdown для корректного завершения

6. **Clean Architecture**
   - Разделение на слои (handler → service → repository)
   - Dependency Injection
   - Тестируемость кода

### Soft Skills

- **Самообучение**: Изучил все технологии самостоятельно по документации
- **Решение проблем**: Преодоление сложностей интеграции gRPC, настройки Docker
- **Архитектурное мышление**: Продумывание масштабируемости и расширяемости
- **Внимание к деталям**: Обработка edge cases, логирование, graceful shutdown

## Требования

- Go 1.23 или выше
- Docker и docker-compose
- Telegram Bot Token (получить у [@BotFather](https://t.me/BotFather))
- protoc (для генерации protobuf кода)

## Быстрый старт

### 1. Клонирование репозитория

```bash
git clone https://github.com/kiribu/financial-tracker-bot.git
cd financial-tracker-bot
```

### 2. Установка зависимостей

```bash
go mod download
```

### 3. Генерация protobuf кода

```bash
make proto
```

### 4. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
# Telegram Bot Token (обязательно)
BOT_TOKEN=your_bot_token_here

# PostgreSQL (по умолчанию для docker-compose)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=finance_tracker

# Gateway
HTTP_PORT=8080
USER_SERVICE_URL=user-service:50051
LEDGER_SERVICE_URL=ledger-service:50052

# Bot
GATEWAY_URL=http://gateway:8080
```

## Запуск

### Запуск через Docker Compose (рекомендуется)

1. Убедитесь, что переменная `BOT_TOKEN` установлена в `.env` или экспортирована:

```bash
export BOT_TOKEN=your_bot_token_here
```

2. Запустите все сервисы:

```bash
docker-compose up -d
```

3. Выполните миграции базы данных:

```bash
make migrate-up
```

Или вручную:

```bash
migrate -path migrations -database "postgres://postgres:postgres@localhost:5432/finance_tracker?sslmode=disable" up
```

### Запуск в режиме разработки

1. Запустите PostgreSQL через docker-compose:

```bash
docker-compose up -d postgres
```

2. Выполните миграции:

```bash
make migrate-up
```

3. Запустите сервисы по отдельности:

```bash
# Terminal 1: User Service
go run ./cmd/user-service

# Terminal 2: Ledger Service
go run ./cmd/ledger-service

# Terminal 3: Gateway
go run ./cmd/gateway

# Terminal 4: Bot
export BOT_TOKEN=your_bot_token_here
go run ./cmd/bot
```

## Cloudflare Tunnel

Для доступа к веб-интерфейсу (webapp) через HTTPS без настройки домена можно использовать Cloudflare Tunnel.

### Использование скрипта

1. Убедитесь, что Gateway запущен и доступен на `http://localhost:8080`

2. Запустите скрипт:

```bash
chmod +x start-cloudflared.sh
./start-cloudflared.sh
```

Скрипт автоматически:
- Проверит наличие `cloudflared`
- Скачает бинарник, если его нет
- Запустит туннель на `http://localhost:8080`

3. После запуска вы увидите HTTPS URL вида:
   ```
   https://xxxx-xxxx-xxxx.trycloudflare.com
   ```

4. Для доступа к веб-интерфейсу добавьте `/webapp` к URL:
   ```
   https://xxxx-xxxx-xxxx.trycloudflare.com/webapp
   ```

### Ручная установка cloudflared

Если хотите установить `cloudflared` вручную:

```bash
# Linux (amd64)
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
chmod +x cloudflared

# Запуск
./cloudflared tunnel --url http://localhost:8080
```

## Структура проекта

```
financial-tracker-bot/
├── cmd/                    # Точки входа сервисов
│   ├── bot/               # Bot Service
│   ├── gateway/           # API Gateway
│   ├── user-service/      # User Service
│   └── ledger-service/    # Ledger Service
├── internal/              # Внутренние пакеты
│   ├── bot/              # Логика бота
│   ├── gateway/          # HTTP обработчики, gRPC клиенты
│   ├── user/             # Доменная логика User Service
│   ├── ledger/           # Доменная логика Ledger Service
│   └── pkg/              # Общие утилиты (config, logger, errors)
├── proto/                 # Protobuf определения
│   ├── user/             # User Service proto
│   └── ledger/           # Ledger Service proto
├── migrations/            # SQL миграции
├── docker/                # Dockerfile'ы для сервисов
├── webapp/                # Веб-интерфейс
├── docker-compose.yml     # Docker Compose конфигурация
├── Makefile              # Команды для разработки
├── start-cloudflared.sh  # Скрипт для Cloudflare Tunnel
└── go.mod                # Go зависимости
```

## Команды Makefile

```bash
# Генерация protobuf кода
make proto

# Применить миграции
make migrate-up

# Откатить миграции
make migrate-down

# Запустить Docker контейнеры
make docker-up

# Остановить Docker контейнеры
make docker-down

# Очистить сгенерированные файлы
make clean
```

## API

### REST API (Gateway)

Gateway предоставляет REST API на порту 8080:

- `POST /api/bot/start` - Регистрация/инициализация пользователя
- `GET /api/accounts?telegram_id=...` - Получить список счетов
- `POST /api/transactions/expense` - Создать расход
- `POST /api/transactions/income` - Создать доход
- `POST /api/transactions/transfer` - Создать перевод
- `GET /api/transactions?telegram_id=...&period=week` - История транзакций
- `GET /api/stats/overview?telegram_id=...&period=week` - Статистика

### gRPC API

Сервисы взаимодействуют через gRPC:
- User Service: порт 50051
- Ledger Service: порт 50052

## Telegram Bot

Бот работает через веб-интерфейс (Telegram Web App). После запуска бота:

1. Отправьте команду `/start` для регистрации/инициализации
2. Нажмите кнопку "Открыть приложение" для доступа к веб-интерфейсу

### Функционал веб-приложения

Веб-приложение предоставляет полный функционал для управления финансами:

- **Добавление операций**: расходы, доходы, переводы между счетами
- **Управление счетами**: создание, редактирование, удаление счетов
- **Управление категориями**: создание и управление категориями транзакций
- **Просмотр балансов**: отображение балансов всех счетов
- **История транзакций**: просмотр истории операций с фильтрацией

## База данных

Проект использует PostgreSQL. Миграции находятся в директории `migrations/`.

Основные таблицы:
- `users` - Пользователи
- `accounts` - Счета
- `categories` - Категории транзакций
- `transactions` - Транзакции

## Разработка

### Генерация protobuf

После изменения `.proto` файлов:

```bash
make proto
```

### Добавление миграций

Создайте файлы миграций в формате:
- `XXX_description.up.sql` - применение миграции
- `XXX_description.down.sql` - откат миграции

### Тестирование

```bash
go test ./...
```

## Планы развития

- [ ] Добавление unit и integration тестов
- [ ] Реализация кэширования (Redis) для часто запрашиваемых данных
- [ ] Добавление метрик и мониторинга (Prometheus, Grafana)
- [ ] Реализация очередей сообщений (RabbitMQ/Kafka) для асинхронных задач
- [ ] Добавление аутентификации через JWT токены
- [ ] Экспорт данных в различные форматы (CSV, PDF отчеты)
- [ ] Мобильное приложение (React Native)
- [ ] Добавление аналитики и визуализации расходов (графики, диаграммы)

*Проект создан как демонстрация навыков и готовности к работе в команде разработки.*
