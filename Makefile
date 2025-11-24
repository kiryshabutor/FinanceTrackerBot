.PHONY: proto migrate-up migrate-down docker-up docker-down clean

# Генерация protobuf кода
proto:
	@echo "Generating protobuf code..."
	@find proto -name "*.proto" -exec protoc --go_out=. --go_opt=paths=source_relative --go-grpc_out=. --go-grpc_opt=paths=source_relative {} \;

# Миграции вверх
migrate-up:
	@echo "Running migrations..."
	@migrate -path migrations -database "postgres://postgres:postgres@localhost:5432/finance_tracker?sslmode=disable" up

# Миграции вниз
migrate-down:
	@echo "Rolling back migrations..."
	@migrate -path migrations -database "postgres://postgres:postgres@localhost:5432/finance_tracker?sslmode=disable" down

# Запуск Docker контейнеров
docker-up:
	docker-compose up -d

# Остановка Docker контейнеров
docker-down:
	docker-compose down

# Очистка
clean:
	@echo "Cleaning generated files..."
	@find . -name "*.pb.go" -delete
	@find . -name "*.pb.gw.go" -delete





