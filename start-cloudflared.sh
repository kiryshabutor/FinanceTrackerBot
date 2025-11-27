#!/bin/bash

# Скрипт для запуска HTTPS туннеля через cloudflared (не требует регистрации)

# Проверяем наличие cloudflared
if [ ! -f "./cloudflared" ]; then
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
    chmod +x cloudflared
fi

# Временный файл для отслеживания
flag_file="/tmp/cloudflared_url_printed_$$"

# Запускаем cloudflared и фильтруем вывод
./cloudflared tunnel --url http://localhost:8080 2>&1 | while IFS= read -r line; do
    if [ ! -f "$flag_file" ]; then
        url=$(echo "$line" | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | head -1)
        if [ -n "$url" ]; then
            echo "${url}/webapp"
            touch "$flag_file"
        fi
    fi
    # После вывода URL просто игнорируем остальные строки
done

# Удаляем временный файл при завершении
rm -f "$flag_file"




