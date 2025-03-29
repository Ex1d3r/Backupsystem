# Daily Backup System | Система ежедневного резервного копирования

[English](#english) | [Русский](#russian)

<a name="english"></a>
## English

### Overview
A script for automatic daily backup from your Mac to an external SSD drive with connection checking, last backup tracking, and support for multiple backup configurations.

### Features
- Checks if SSD is connected before backing up
- Only performs backup once every 24 hours
- Logs all operations
- Tracks status and time of last backup
- Can run as a daemon (hourly checks)
- Creates backups in a dedicated subfolder on the SSD to preserve other files
- Supports multiple backup configurations with different source paths and output folders
- Command-line interface for managing backup configurations

### Installation

```bash
# Install dependencies
npm install
```

### Usage

#### Setting the external SSD path
Before using the script, you need to specify the path to your external SSD:

```bash
node backup.js --set-destination /path/to/external/ssd
```

#### Managing backup configurations

##### Adding a new backup configuration
```bash
node backup.js --add-backup --name "Documents" --source "/Users/username/Documents" --folder "documents_backup"
```

##### Removing a backup configuration
```bash
node backup.js --remove-backup 2  # Where 2 is the ID of the configuration
```

##### Editing a backup configuration
```bash
node backup.js --edit-backup 2 --name "New Name" --source "/new/path" --folder "new_folder"
```
All parameters for editing are optional - specify only what you want to change.

#### Running backup manually
For all configurations:
```bash
node backup.js --backup-now
```

For a specific configuration:
```bash
node backup.js --backup-now --id 2  # Where 2 is the ID of the configuration
```

#### Checking backup status
View status of all backup configurations:
```bash
node backup.js --status
```

#### Running as a daemon (hourly check)

```bash
node backup.js --daemon
```

The script will check if the SSD is connected every hour and perform a backup if more than 24 hours have passed since the last backup.

#### Using with PM2 for persistence

```bash
# Install PM2 globally
npm install -g pm2

# Start the backup daemon with PM2
pm2 start backup.js -- --daemon

# Make PM2 start on system boot
pm2 startup
pm2 save
```

#### Help

```bash
node backup.js --help
```

### Usage Tips

1. Make sure the `rsync` utility is installed (usually pre-installed on macOS)
2. Operation logs are saved to `backup.log` in the script directory
3. Backups are stored in a subfolder called `mac_backups` on your SSD

<a name="russian"></a>
## Русский

### Обзор
Скрипт для автоматического ежедневного резервного копирования с Mac на внешний SSD с проверкой подключения, отслеживанием времени последнего бэкапа и поддержкой нескольких конфигураций резервного копирования.

### Функциональность
- Проверка подключения SSD перед бэкапом
- Выполнение бэкапа только раз в сутки
- Запись логов всех операций
- Отслеживание статуса и времени последнего бэкапа
- Возможность запуска в режиме демона (проверки каждый час)
- Создает бэкапы в отдельной подпапке на SSD, чтобы не затрагивать другие файлы
- Поддержка нескольких конфигураций резервного копирования с разными исходными путями и выходными папками
- Интерфейс командной строки для управления конфигурациями резервного копирования

### Установка

```bash
# Установка зависимостей
npm install
```

### Использование

#### Настройка пути к внешнему SSD
Перед использованием скрипта необходимо указать путь к внешнему SSD:

```bash
node backup.js --set-destination /путь/к/внешнему/ssd
```

#### Управление конфигурациями резервного копирования

##### Добавление новой конфигурации
```bash
node backup.js --add-backup --name "Документы" --source "/Users/username/Documents" --folder "documents_backup"
```

##### Удаление конфигурации
```bash
node backup.js --remove-backup 2  # Где 2 - это ID конфигурации
```

##### Редактирование конфигурации
```bash
node backup.js --edit-backup 2 --name "Новое имя" --source "/новый/путь" --folder "новая_папка"
```
Все параметры для редактирования опциональны - укажите только то, что хотите изменить.

#### Запуск бэкапа вручную
Для всех конфигураций:
```bash
node backup.js --backup-now
```

Для конкретной конфигурации:
```bash
node backup.js --backup-now --id 2  # Где 2 - это ID конфигурации
```

#### Проверка статуса бэкапа
Просмотр статуса всех конфигураций:
```bash
node backup.js --status
```

#### Запуск в режиме демона (проверка каждый час)

```bash
node backup.js --daemon
```

Скрипт будет проверять подключение SSD каждый час и выполнять бэкап, если с момента последнего копирования прошло более 24 часов.

#### Использование с PM2 для постоянной работы

```bash
# Установка PM2 глобально
npm install -g pm2

# Запуск демона бэкапа через PM2
pm2 start backup.js -- --daemon

# Настройка автозапуска PM2 при старте системы
pm2 startup
pm2 save
```

#### Помощь

```bash
node backup.js --help
```

### Рекомендации по использованию

1. Убедитесь, что у вас установлена утилита `rsync` (обычно она предустановлена в macOS)
2. Логи операций сохраняются в файл `backup.log` в директории скрипта
3. Для каждой конфигурации можно указать отдельную подпапку для хранения бэкапов на SSD
4. Используйте уникальные имена для конфигураций, чтобы легче их идентифицировать
