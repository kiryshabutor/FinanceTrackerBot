# Техническое задание  
## Проект: Личный финансовый трекер с Telegram-ботом

Версия: **0.3 (draft)**  
Автор: ты + ИИ  

---

## 1. Цели проекта

### 1.1. Бизнес-цель

Создать личный **финансовый трекер**, доступный через **Telegram-бота**, который позволяет пользователю:

- вести учёт **расходов**, **доходов** и **переводов между собственными счетами**;
- работать с несколькими счетами (карты, наличные, депозиты и т.п.);
- анализировать расходы/доходы за различные периоды;
- получать ежедневное напоминание о необходимости внести операции (расходы/доходы).

Проект **не является** банковским приложением, не работает с реальными деньгами и не ограничивает пользователя средствами на счёте. Это **только трекинг**.

### 1.2. Техническая цель

Применить и закрепить:

- язык **Go (Golang)**;
- **микросервисную архитектуру**;
- взаимодействие сервисов по **gRPC** и **REST**;
- работу с **PostgreSQL** и **Redis**;
- контейнеризацию через **Docker** и **docker-compose**;
- интеграцию с **Telegram Bot API**.

В первой версии **Kafka не используется**.

---

## 2. Общие требования

### 2.1. Архитектурный стиль

- Микросервисная архитектура с **монорепозиторием** (все сервисы в одном репозитории).
- Взаимодействие:
  - **Bot Service → API Gateway** — REST (HTTP + JSON),
  - **API Gateway → микросервисы** — gRPC,
  - микросервисы → PostgreSQL / Redis — через Go-драйверы.

### 2.2. Языки и версии

- Основной язык: **Go 1.22+**.
- Протоколы:
  - **gRPC + Protobuf** — межсервисное взаимодействие,
  - **REST (HTTP/JSON)** — интерфейс API Gateway.

### 2.3. Инфраструктура

- **PostgreSQL**:
  - одна инстанция;
  - одна БД (например, `finance_tracker`), в которой находятся таблицы всех сервисов (логически разделённых).

- **Redis** (опционально, но желателен):
  - кеш маппинга `telegram_id → user_id`,
  - другие временные данные по необходимости.

- **Docker**:
  - каждый сервис + Postgres + Redis — в отдельном контейнере.

- **docker-compose**:
  - оркестрация всех контейнеров для локального запуска.

- **Telegram Bot API**:
  - получение апдейтов через **long polling (`getUpdates`)**,
  - отправка сообщений через `sendMessage` и дополнительные методы (например, `sendChatAction`, `answerCallbackQuery`).

### 2.4. Ограничения и упрощения

- Kafka и другие брокеры сообщений **не используются** в первой версии.
- Один репозиторий (монорепа), в котором содержатся все сервисы и общий код.
- Основное окружение: **локальная разработка** (docker-compose).

---

## 3. Архитектура системы

### 3.1. Высокоуровневая схема

```text
Пользователь в Telegram
        │
        ▼
  Серверы Telegram
        │ (HTTP, getUpdates / sendMessage)
        ▼
    Bot Service (Go)
        │  REST (HTTP/JSON)
        ▼
    API Gateway (Go)
        │         │         │         │
        │ gRPC    │ gRPC    │ gRPC    │ gRPC
        ▼         ▼         ▼         ▼
 [User Service][Ledger Service][Analytics Service]
        │               │              │              │
                  PostgreSQL (одна инстанция, одна БД, несколько таблиц)

## 3.2. Компоненты

### 3.2.1. Bot Service (Telegram-бот)

**Роль:**

- Реализация протокола Telegram:
  - long polling: `getUpdates` с параметром `timeout` (например, 30 секунд);
  - обработка апдейтов: текстовые сообщения, команды, inline-кнопки, reply-кнопки;
  - отправка ответов пользователю через `sendMessage`, `sendChatAction`, `answerCallbackQuery` и т.п.

**Функции:**

- Принимает апдейты от Telegram (через HTTP-запросы к `api.telegram.org`).
- Парсит команды/сообщения пользователя:
  - `/start`, `/help`, `/expense`, `/income`, `/transfer`, `/balance`, `/history`, `/stats`, `/settings` и т.д.
- Управляет диалогом с пользователем:
  - задаёт вопросы,
  - показывает кнопки,
  - двигает “мастер” добавления операций.
- Преобразует результат диалога в REST-запросы к API Gateway.
- На основе ответов от API Gateway формирует понятные сообщения пользователю.

**Технические детали:**

- Бинарь `cmd/bot/main.go`.
- Используется популярная Go-библиотека для Telegram Bot API (например, `tgbotapi`).
- Конфиг:
  - токен бота (из BotFather),
  - URL API Gateway (например, `http://gateway:8080`).

**Особенности:**

- Не ходит напрямую в БД/Redis.
- Не содержит доменной бизнес-логики (вся логика денег — в микросервисах).
- Может запускаться:
  - локально через `go run ./cmd/bot`,
  - или как отдельный контейнер в `docker-compose`.

---

### 3.2.2. API Gateway

**Роль:**

- REST-фасад для Bot Service.
- Конвертер REST → gRPC для микросервисов.
- Интеграционная точка: все внешние клиенты (сейчас только бот) ходят **только сюда**.

**Основные задачи:**

- Принимать REST-запросы от Bot Service.
- По `telegram_id` определять соответствующего `user_id` через User Service:
  - `GetUserByTelegramId(telegram_id)`.
- Роутить запрос в нужный микросервис:
  - User Service — пользователи/настройки.
  - Ledger Service — счета/транзакции.
  - Analytics Service — статистика.
  - Notification Service — управление напоминаниями (по необходимости).
- Обрабатывать ошибки:
  - логировать,
  - возвращать понятные коды и сообщения для бота.
- Минимально форматировать ответы:
  - чтобы боту было удобно строить сообщения пользователю.

**Технические детали:**

- Бинарь `cmd/gateway/main.go`.
- HTTP-сервер на Go (стандартная библиотека или `chi`/`gorilla` и т.п.).
- gRPC-клиенты к микросервисам.
- Возможный кеш `telegram_id → user_id` в Redis.

---

### 3.2.3. User Service

**Роль:**

- Управление пользователями и их настройками.

**Функциональность:**

- Создание пользователя:
  - при первом `/start` по `telegram_id`.
- Поиск пользователя:
  - `GetUserByTelegramId(telegram_id)`.
- Управление настройками:
  - базовая валюта (`base_currency`),
  - язык (`language`),
  - часовой пояс (`timezone`),
  - включены ли напоминания (`notifications_enabled`),
  - время напоминания (`reminder_time`).

**Данные (PostgreSQL):**

- Таблица `users`:
  - `id` (PK, `user_id`),
  - `telegram_id` (BIGINT/STRING, уникальный),
  - `username`,
  - `first_name`,
  - `last_name`,
  - `created_at`.

- Таблица `user_settings`:
  - `user_id` (PK, FK → `users.id`),
  - `base_currency` (TEXT, например `"RUB"`),
  - `language` (TEXT, например `"ru"`),
  - `timezone` (TEXT, например `"Europe/Moscow"`),
  - `notifications_enabled` (BOOL),
  - `reminder_time` (TIME или TEXT `"HH:MM"`),
  - `created_at`, `updated_at`.

**Бизнес-правила:**

- При создании нового пользователя:
  - выставить дефолты:
    - `base_currency = "RUB"`,
    - `language = "ru"` (или по умолчанию),
    - `timezone` — можно спросить у пользователя позже,
    - `notifications_enabled = true`,
    - `reminder_time = "21:00"` (например).

---

### 3.2.4. Ledger Service (денежное ядро)

**Роль:**

- Вся логика, связанная с деньгами:
  - счета,
  - категории,
  - транзакции (расходы/доходы/переводы).

**Функциональность:**

1. **Счета (Accounts):**
   - Создание нового счёта.
   - Получение списка счетов пользователя.
   - Обновление баланса при операциях.

2. **Категории (Categories):**
   - Список категорий по пользователю и типу (`expense` / `income`).
   - Возможность иметь глобальные категории (без user_id) и пользовательские.

3. **Транзакции (Transactions):**
   - Создание расхода (`expense`).
   - Создание дохода (`income`).
   - Создание перевода (`transfer`) между своими счетами.

**Бизнес-правила:**

- У пользователя может быть **любое количество счетов**.
- **Баланс счёта может уходить в минус**:
  - не блокировать транзакции из-за недостатка средств.
- При создании транзакции:
  - проверяется принадлежность счётов пользователю;
  - сумма должна быть > 0;
  - тип (`expense` / `income` / `transfer`) определяет, как меняется баланс.

**Данные (PostgreSQL):**

- Таблица `accounts`:
  - `id` (PK),
  - `user_id` (FK),
  - `name` (TEXT),
  - `currency` (TEXT),
  - `balance` (NUMERIC/DECIMAL, может быть отрицательным),
  - `is_archived` (BOOL),
  - `created_at`, `updated_at`.

- Таблица `categories`:
  - `id` (PK),
  - `user_id` (FK, NULL для глобальных категорий),
  - `name` (TEXT),
  - `type` (TEXT: `"expense"` / `"income"`),
  - `created_at`.

- Таблица `transactions`:
  - `id` (PK),
  - `user_id` (FK),
  - `account_id` (FK → `accounts.id`),
  - `related_account_id` (FK → `accounts.id`, NULL, используется для `transfer`),
  - `category_id` (FK → `categories.id`, NULL для `transfer`),
  - `type` (TEXT: `"expense"` / `"income"` / `"transfer"`),
  - `amount` (NUMERIC, > 0),
  - `currency` (TEXT),
  - `description` (TEXT, NULLABLE),
  - `operation_date` (TIMESTAMP),
  - `created_at` (TIMESTAMP).

**Изменение балансов:**

- `expense`:
  - `accounts.balance = balance - amount`.
- `income`:
  - `accounts.balance = balance + amount`.
- `transfer`:
  - `from_account.balance = balance - amount`,
  - `to_account.balance = balance + amount`.

---

### 3.2.5. Analytics Service

**Роль:**

- Статистика и агрегированные данные по транзакциям.

**Функциональность (MVP):**

- Статистика за выбранный период:
  - **Периоды**:
    - `today` (текущий день),
    - `week` (последние 7 дней),
    - `month` (текущий календарный месяц или последние 30 дней — выбрать и зафиксировать).
- Метрики:
  - `total_expense` — суммарные расходы за период;
  - `total_income` — суммарные доходы за период;
  - расходы по категориям за период.

**Реализация на MVP:**

- Можно считать всё “на лету”:
  - Analytics Service делает запрос в Ledger Service или напрямую в таблицу `transactions` с нужными фильтрами по `user_id` и дате.
- Оптимизации (предагрегированные таблицы) можно добавить позже.

---

### 3.2.6. Notification Service

**Роль:**

- Реализация механизма ежедневных напоминаний пользователю о необходимости внести расходы/доходы.

**Функциональность:**

- Хранение параметров:
  - `notifications_enabled` (включено/выключено),
  - `reminder_time` (локальное время, например, `"21:00"`),
  - `timezone` (строка типа `Europe/Moscow` — берётся из настроек пользователя).
- Планировщик (scheduler):
  - раз в фиксированный интервал (например, раз в минуту) выполняет:
    - определяет текущее UTC-время;
    - для каждого пользователя с включёнными напоминаниями:
      - преобразует UTC во время в его `timezone`,
      - сравнивает часы и минуты с `reminder_time`,
      - проверяет, было ли сегодня уже отправлено напоминание;
      - если нет — инициирует отправку.

**Отправка уведомлений:**

- Notification Service инициирует вызов в API Gateway:
  - `POST /api/notifications/reminder` (например) с `user_id`.
- Gateway:
  - по `user_id` получает `telegram_id` из User Service,
  - формирует полезную нагрузку для Bot Service или сразу дергает бот-эндпоинт,
  - Bot Service отправляет `sendMessage` пользователю в Telegram.

Пример текста:
> “Напоминание: не забудь внести сегодняшние расходы/доходы.”

---

## 4. Структура репозитория

Рекомендуемая структура монорепозитория:

```bash
finance-tracker/
  cmd/
    bot/                  # main.go для Bot Service
    gateway/              # main.go для API Gateway
    user-service/         # main.go для User Service
    ledger-service/       # main.go для Ledger Service
    analytics-service/    # main.go для Analytics Service
    notification-service/ # main.go для Notification Service

  internal/
    bot/                  # логика бота: обработка команд, диалоги
    gateway/              # HTTP-обработчики, gRPC-клиенты
    user/                 # доменная логика User Service
    ledger/               # доменная логика Ledger Service
    analytics/            # доменная логика Analytics Service
    notification/         # логика планировщика и отправки напоминаний
    pkg/                  # общие утилиты, модели, ошибки, обёртки

  proto/
    user.proto
    ledger.proto
    analytics.proto
    notification.proto

  migrations/
    user/                 # миграции для user-related таблиц
    ledger/               # миграции для счетов и транзакций
    analytics/            # при необходимости
    notification/         # при необходимости

  docker/
    Dockerfile.bot
    Dockerfile.gateway
    Dockerfile.user
    Dockerfile.ledger
    Dockerfile.analytics
    Dockerfile.notification

  docker-compose.yml
  go.mod
  go.sum
  README.md

## 5. Бизнес-логика подробно

### 5.1. Пользователь и его настройки

**Создание пользователя:**

- При `/start` Bot Service отправляет в API Gateway объект:
  - `telegram_id`,
  - `username`,
  - `first_name`,
  - `last_name` (опционально).
- Gateway вызывает User Service:
  - `GetOrCreateUser(telegram_id, profile_data)`.
- Если пользователь **не существует**:
  - создаётся запись в таблице `users`,
  - создаётся запись в таблице `user_settings` с дефолтными значениями:
    - `base_currency = "RUB"`,
    - `language = "ru"` (или другая дефолтная),
    - `timezone = NULL` (пока пользователь не задаст),
    - `notifications_enabled = true`,
    - `reminder_time = "21:00"`.

**Настройки пользователя:**

- Хранятся в `user_settings`:
  - `base_currency` — базовая валюта (RUB, USD и т.д.),
  - `language` — язык интерфейса,
  - `timezone` — строка IANA (`"Europe/Moscow"`, `"Europe/Paris"` и т.д.),
  - `notifications_enabled` — включены ли напоминания,
  - `reminder_time` — время ежедневного напоминания в локальном времени (`"HH:MM"`).

**Изменение настроек:**

- Через `/settings` бот показывает меню:
  - выбор валюты,
  - выбор часового пояса,
  - включение/выключение напоминаний,
  - изменение времени напоминаний.
- По действию пользователя Bot Service отправляет запрос в Gateway:
  - `POST /api/user/settings` → Gateway → User Service → обновление `user_settings`.

---

### 5.2. Счета (Accounts)

**Назначение:**

- Счёт — логическая сущность, отражающая источник/контейнер денег:
  - банк. карта, кошелёк, наличные и т.д.

**Создание счёта:**

- На этапе онбординга можно:
  - автоматически создать один дефолтный счёт, например, `"Основной"`.
- В перспективе можно добавить:
  - команду/сценарий “Добавить счёт”.

**Использование:**

- Все транзакции (расходы, доходы, переводы) привязаны к счёту:
  - для `expense` / `income` — один счёт,
  - для `transfer` — два счёта (источник и приёмник).

**Баланс:**

- В поле `balance` хранится текущее состояние счёта.
- **Баланс может быть отрицательным**:
  - никакой проверки “баланс не должен быть меньше нуля” не делается,
  - пользователь может фиксировать расход, даже если на счёте “по учёту” денег не хватает.

**Таблица `accounts`:**

- `id` (PK),
- `user_id` (FK → `users.id`),
- `name` (TEXT),
- `currency` (TEXT),
- `balance` (NUMERIC/DECIMAL, может быть < 0),
- `is_archived` (BOOL),
- `created_at`, `updated_at`.

---

### 5.3. Категории (Categories)

**Назначение:**

- Категория описывает тип операции:
  - “Еда”, “Транспорт”, “Жильё”, “Зарплата” и т.п.

**Типы категорий:**

- `expense` — расход,
- `income` — доход.

**Глобальные и пользовательские категории:**

- Глобальные (общие для всех) могут иметь `user_id = NULL`.
- Пользовательские категории — `user_id = конкретный пользователь`.

**Таблица `categories`:**

- `id` (PK),
- `user_id` (FK или NULL),
- `name` (TEXT),
- `type` (TEXT: `"expense"` или `"income"`),
- `created_at`.

**Поведение:**

- На старте системы:
  - заполняется набор дефолтных категорий.
- В дальнейшем (опционально):
  - пользователь может добавлять свои категории через отдельный функционал.

---

### 5.4. Транзакции (Transactions)

**Типы транзакций:**

1. **Расход (`expense`)**
2. **Доход (`income`)**
3. **Перевод (`transfer`)** — между счетами одного пользователя.

**Общие поля:**

Таблица `transactions`:

- `id` (PK),
- `user_id` (FK → `users.id`),
- `account_id` (FK → `accounts.id`),
- `related_account_id` (FK → `accounts.id`, NULL для не-переводов),
- `category_id` (FK → `categories.id`, NULL для `transfer`),
- `type` (TEXT: `"expense"` / `"income"` / `"transfer"`),
- `amount` (NUMERIC, > 0),
- `currency` (TEXT),
- `description` (TEXT, NULLABLE),
- `operation_date` (TIMESTAMP, дата/время операции),
- `created_at` (TIMESTAMP, когда запись создана в системе).

#### 5.4.1. Логика расходов (`expense`)

- Пользователь выбирает:
  - счёт,
  - категорию типа `expense`,
  - сумму,
  - (опционально) описание.
- Ledger Service:
  - создаёт запись в `transactions` с `type = "expense"`,
  - уменьшает `accounts.balance` на `amount`.

**Особенности:**

- Никакой блокировки по балансу:
  - даже если `balance - amount < 0`, операция считается валидной.

#### 5.4.2. Логика доходов (`income`)

- Аналогично расходам, но:
  - `type = "income"`,
  - счёт — тот, куда “поступили” деньги,
  - категория типа `income`.
- Ledger Service:
  - создаёт запись в `transactions`,
  - увеличивает `accounts.balance` на `amount`.

#### 5.4.3. Логика переводов (`transfer`)

- Пользователь выбирает:
  - счёт-источник (`from_account_id`),
  - счёт-назначения (`to_account_id`),
  - сумму,
  - (опционально) описание.
- Ledger Service:
  - проверяет, что оба счёта принадлежат одному и тому же пользователю,
  - создаёт запись:
    - `type = "transfer"`,
    - `account_id = from_account_id`,
    - `related_account_id = to_account_id`,
    - `category_id = NULL` (по умолчанию),
  - уменьшает `balance` у `from_account_id` на `amount`,
  - увеличивает `balance` у `to_account_id` на `amount`.

**Альтернативный подход (возможен, но не обязателен в данном ТЗ):**

- Хранить перевод двумя записями:
  - расход со счёта-источника,
  - доход на счёт-назначение,
  - связать их `transfer_group_id` или аналогом.
- В данном ТЗ зафиксирован вариант **одной записи `transfer`** с двумя аккаунтами.

---

### 5.5. Напоминания (NotificationService)

**Цель:**

- Раз в день в указанное пользователем время присылать ему напоминание, чтобы он не забывал внести свои расходы/доходы.

**Данные:**

- Состояние напоминаний хранится в `user_settings`:
  - `notifications_enabled` (BOOL),
  - `reminder_time` (TIME или TEXT `"HH:MM"`),
  - `timezone` (строка IANA, может храниться там же).




**Защита от дублей:**

- Можно использовать таблицу `reminder_logs`:
  - `user_id`,
  - `date` (DATE),
  - `sent_at` (TIMESTAMP),
- либо поле `last_reminder_date` в настройках.

---

## 6. Поведение и функциональность Telegram-бота

### 6.1. Основные команды

#### `/start`

- Регистрация/инициализация пользователя.
- Шаги:
  1. Отправка данных в Gateway (`/api/bot/start`).
  2. Получение/создание `user_id` и настроек.




#### `/expense`

- Сценарий (диалоговый):
  1. Бот спрашивает сумму.
  3. Если больше одного счёта — спрашивает, с какого счёта списать.
  4. После выбора:
     - отправляет запрос в Gateway → Ledger Service (`CreateExpense`),
     - получает результат.
  5. Отвечает пользователю:
     - “✅ Добавлен расход 500 ₽, категория ‘Еда’, счёт ‘Карта’. Баланс: 12 300 ₽.”

- Возможное расширение:
  - короткий формат `/expense 500 еда`.

#### `/income`

- Аналогичный сценарий, но с типом `income`.

#### `/transfer`

- Сценарий:
  1. Бот запрашивает счёт-источник (inline-кнопки со счетами).
  2. Затем счёт-назначения (исключая источник).
  3. Запрос суммы.
  4. Gateway → Ledger Service (`CreateTransfer`).
  5. Ответ пользователю:
     - новые балансы обоих счетов.

#### `/balance`

- Bot → Gateway → Ledger Service: получить список счетов и их балансы.
- Ответ в Телеграм:
  ```text
  Карта Тинькофф: 12 300 ₽
  Наличные:        5 200 ₽
  ...

/history

    Параметры (опционально в тексте команды или через кнопки):

        today, week, month, либо без параметров → “последние N операций”.

    Bot → Gateway → Ledger Service: ListTransactions.

    Бот выводит последние операции с датой, суммой, категорией, счётом.




6.2. UI: в файле bot.txt

7. Модель данных (сводно)
7.1. user_service

users

    id (PK),

    telegram_id (уникальный),

    username,

    first_name,

    last_name,

    created_at.

user_settings

    user_id (PK, FK → users.id),


    reminder_time,

    created_at,

    updated_at.

7.2. ledger_service

accounts

    id (PK),

    user_id,

    name,

    balance,

    is_archived,

    created_at,

    updated_at.

categories

    id (PK),

    user_id (NULL для глобальных),

    name,

    type (expense / income),

    created_at.

transactions

    id (PK),

    user_id,

    account_id,

    related_account_id (NULL, используется для transfer),

    category_id (NULL для transfer),

    type (expense / income / transfer),

    amount,

    description,

    operation_date,

    created_at.

7.3. analytics_service

На MVP — можно не иметь отдельные таблицы, считать на лету.

На будущее:

daily_aggregates

    id,

    user_id,

    date,

    total_expense,

    total_income.

category_aggregates

    id,

    user_id,

    category_id,

    period_start,

    period_end,

    total_expense,

    total_income.

7.4. notification_service

Можно использовать user_settings для хранения параметров напоминаний.
Дополнительно (опционально):

reminder_logs

    id,

    user_id,

    date (DATE),

    sent_at (TIMESTAMP).

8. REST API Gateway (черновой дизайн)

    Примерный набор эндпоинтов, который может меняться при реализации, но должен покрывать описанный функционал.

8.1. Пользователи и настройки
POST /api/bot/start

    Вход:

{
  "telegram_id": 123456789,
  "username": "someuser",
  "first_name": "Имя",
  "last_name": "Фамилия"
}

Выход:

    {
      "user_id": 1,
      
    }



POST /api/user/settings

    Вход:

    {
      "telegram_id": 123456789,

    }


8.2. Счета и транзакции
GET /api/accounts?telegram_id=...

    Ответ:

    {
      "accounts": [
        { "id": 1, "name": "Основной", "balance": 12300 },
        { "id": 2, "name": "Наличные" , "balance": 5200 }
      ]
    }

POST /api/transactions/expense

    Вход:

{
  "telegram_id": 123456789,
  "account_id": 1,
  "amount": 500,
  "category_id": 10,
  "description": "обед"
}

Выход:

    {
      "status": "ok",
      "transaction_id": 123,
      "account_balance": 11800
    }

POST /api/transactions/income

    Аналогично, с типом дохода.

POST /api/transactions/transfer

    Вход:

{
  "telegram_id": 123456789,
  "from_account_id": 1,
  "to_account_id": 2,
  "amount": 1000,
  "description": "перевод на наличные"
}

Выход:

    {
      "status": "ok",
      "from_account_balance": 11300,
      "to_account_balance": 6200
    }

GET /api/balance?telegram_id=...

    Аналогично /api/accounts.

GET /api/transactions?telegram_id=...&period=week&limit=10

    Ответ:

    {
      "transactions": [
        {
          "id": 123,
          "type": "expense",
          "amount": 500,
          "category_name": "Еда",
          "account_name": "Карта Тинькофф",
          "operation_date": "2025-01-15T14:32:00Z",
          "description": "обед"
        }
        // ...
      ]
    }

8.3. Статистика
GET /api/stats/overview?telegram_id=...&period=week

    Ответ:

    {
      "period": "week",
      "total_expense": 12450,
      "total_income": 50000
    }

GET /api/stats/by-category?telegram_id=...&period=week

    Ответ:

    {
      "period": "week",
      "categories": [
        { "category_id": 10, "name": "Еда", "total_expense": 4300 },
        { "category_id": 11, "name": "Транспорт", "total_expense": 2100 }
      ]
    }

9. gRPC (концептуальный уровень)
9.1. User Service

service UserService {
  rpc GetOrCreateUser(GetOrCreateUserRequest) returns (UserResponse);
  rpc GetUserByTelegramId(GetUserByTelegramIdRequest) returns (UserResponse);
  rpc GetUserSettings(GetUserSettingsRequest) returns (UserSettingsResponse);
  rpc UpdateUserSettings(UpdateUserSettingsRequest) returns (UserSettingsResponse);
}

9.2. Ledger Service

service LedgerService {
  rpc CreateExpense(CreateExpenseRequest) returns (TransactionResponse);
  rpc CreateIncome(CreateIncomeRequest) returns (TransactionResponse);
  rpc CreateTransfer(CreateTransferRequest) returns (TransferResponse);

  rpc ListAccounts(ListAccountsRequest) returns (ListAccountsResponse);
  rpc ListCategories(ListCategoriesRequest) returns (ListCategoriesResponse);
  rpc ListTransactions(ListTransactionsRequest) returns (ListTransactionsResponse);
  rpc GetBalance(GetBalanceRequest) returns (GetBalanceResponse);
}

9.3. Analytics Service

service AnalyticsService {
  rpc GetOverview(GetOverviewRequest) returns (OverviewResponse);
  rpc GetCategoryStats(GetCategoryStatsRequest) returns (CategoryStatsResponse);
}


10. Нефункциональные требования
10.1. Производительность

    Время обработки типичных операций (например, добавление расхода) от момента получения апдейта Bot Service до отправки ответа пользователю:

        целевое значение: ≤ 500 мс в условиях локальной разработки (docker-compose, без экстремальной нагрузки).

10.2. Надёжность

    Сервисы должны устойчиво переносить рестарты контейнеров.

    При временных сбоях БД/сети:

        должны логироваться ошибки,

        пользователю должен возвращаться понятный текст ошибки через бот.

10.3. Логирование

    Использовать структурированные логи (например, zap или zerolog).

    Логировать:

        старт/остановку сервисов,

        входящие REST/gRPC запросы (кратко, без чувствительных данных),

        ошибки,

        ключевые бизнес-события (создание транзакций, изменение настроек).

10.4. Docker / docker-compose

    docker-compose up поднимает:

        postgres,

        redis,

        gateway,

        user-service,

        ledger-service,

        analytics-service,

        bot (бот может запускаться отдельно).

    Все сервисы доступны друг другу по именам:

        postgres:5432,

        redis:6379,

        gateway:8080,

        user-service:... и т.д.


библиотеки, которые будем юзать:
Telegram:

github.com/go-telegram-bot-api/telegram-bot-api/v5

HTTP / REST / Router (Gateway):

github.com/go-chi/chi/v5

gRPC + Protobuf:

google.golang.org/grpc

google.golang.org/protobuf

плагины: protoc-gen-go, protoc-gen-go-grpc

PostgreSQL:

github.com/jackc/pgx/v5

(опционально) github.com/jmoiron/sqlx

Миграции:

github.com/golang-migrate/migrate/v4

Redis:

github.com/redis/go-redis/v9

Конфиги:

github.com/ilyakaznacheev/cleanenv

Логи:

go.uber.org/zap

Валидация:

github.com/go-playground/validator/v10

Планировщик (если захотим cron):

github.com/robfig/cron/v3

либо просто time.Ticker из стандартной библиотеки.

Тесты:

github.com/stretchr/testify
