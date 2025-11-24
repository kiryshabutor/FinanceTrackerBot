#!/bin/bash

# Скрипт для запуска HTTPS туннеля через cloudflared (не требует регистрации)

echo "🚀 Запуск cloudflared туннеля..."
echo ""
echo "Ожидайте, пока появится HTTPS URL..."
echo "После запуска скопируйте HTTPS URL и добавьте /webapp в конец"
echo ""

# Проверяем наличие cloudflared
if [ ! -f "./cloudflared" ]; then
    echo "❌ cloudflared не найден. Устанавливаю..."
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
    chmod +x cloudflared
    echo "✅ cloudflared установлен"
fi

# Запускаем cloudflared
./cloudflared tunnel --url http://localhost:8080




