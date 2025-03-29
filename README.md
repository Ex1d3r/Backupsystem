# Daily Backup System | Система ежедневного резервного копирования

[English](#english) | [Русский](#russian)

<a name="english"></a>
## English

### Overview
A script for automatic daily backup from your Mac to an external SSD drive with connection checking and last backup tracking.

### Features
- Checks if SSD is connected before backing up
- Only performs backup once every 24 hours
- Logs all operations
- Tracks status and time of last backup
- Can run as a daemon (hourly checks)
- Creates backups in a dedicated subfolder on the SSD to preserve other files

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

#### Setting the output folder name (optional)
By default, backups are stored in a folder named `mac_backups` on your SSD. You can change this:

```bash
node backup.js --set-output-folder custom_backup_folder
```

#### Running backup manually

```bash
node backup.js --backup-now
```

#### Checking backup status

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
Скрипт для автоматического ежедневного резервного копирования с Mac на внешний SSD с проверкой подключения и отслеживанием времени последнего бэкапа.

### Функциональность
- Проверка подключения SSD перед бэкапом
- Выполнение бэкапа только раз в сутки
- Запись логов всех операций
- Отслеживание статуса и времени последнего бэкапа
- Возможность запуска в режиме демона (проверки каждый час)
- Создает бэкапы в отдельной подпапке на SSD, чтобы не затрагивать другие файлы

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

#### Настройка имени выходной папки (опционально)
По умолчанию бэкапы сохраняются в папке `mac_backups` на вашем SSD. Вы можете изменить это:

```bash
node backup.js --set-output-folder имя_вашей_папки
```

#### Запуск бэкапа вручную

```bash
node backup.js --backup-now
```

#### Проверка статуса бэкапа

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
3. Бэкапы хранятся в подпапке `mac_backups` на вашем SSD
