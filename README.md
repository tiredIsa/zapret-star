# zapret-star

[![Current Release](https://img.shields.io/github/v/release/tiredIsa/zapret-star?include_prereleases&label=release)](https://github.com/tiredIsa/zapret-star/releases)

**Цель:** Упростить запуск и управление внешними программами, которые требуют сложных наборов аргументов. Проект призван заменить неудобные и многочисленные `.bat` скрипты единым, более дружелюбным интерфейсом, особенно в контексте решения современных проблем с доступом к сети.

---

> **⚠️ В разработке  ⚠️**
>
> Этот проект находится на стадии разработки. Следите за репозиторием на GitHub что-бы всегда иметь актуальную версию (до тех пор пока автообновление не прикручу).

---

### 🚀 Установка и Использование

1.  Перейдите в раздел [**Releases**](https://github.com/tiredIsa/zapret-star/releases) репозитория. 
2.  Скачайте последнюю версию `zapret-star-installer.exe`.
3.  Откройте терминал (Командная строка, PowerShell, Windows Terminal).
4.  Просто введите команду:
    ```bash
    zapret-star
    ```
5.  Используйте появившееся текстовое меню для управления zapret.
---

### 📝 Конфигурация

*   `zapret-star` читает конфигурацию для `winws.exe` из файла `config/config.json`.
*   Аргументы для `winws.exe` берутся из массива `strategys`.
*   **Важно (v0.0.1-beta):** На данный момент используется **только первая** стратегия (`strategys[0]`) из файла `config.json`. Поддержка выбора стратегий планируется в будущих версиях.
*   Переменные `{{BIN_PATH}}` и `{{LIST_PATH}}` в аргументах будут автоматически заменены на полные пути к папкам `bin` и `lists` соответственно.

---

### 💡 Планы на будущее

*   Добавление большего количества стратегий.
*   Добавление механизма автоматического обновления `zapret-star`.
*   Улучшение обработки ошибок и вывода информации.
*   (Возможно) Автоматическое скачивание/обновление списков.

---

### 🤝 Участие и Обратная связь

Найденные ошибки, предложения по улучшению и вопросы можно оставлять в разделе [**Issues**](https://github.com/tiredIsa/zapret-star/issues) репозитория.

---

### 📜 Лицензия

[MIT License](https://github.com/tiredIsa/zapret-star/blob/main/LICENSE)
