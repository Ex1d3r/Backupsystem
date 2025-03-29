#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { exec, spawn } = require('child_process');
const cron = require('node-cron');
const moment = require('moment');

const colors = {
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    bold: (text) => `\x1b[1m${text}\x1b[0m`
};

const config = {
    defaultSourcePath: '/Users/exider/Primary/backups',
    defaultDestPath: '',
    logFile: path.join(__dirname, 'backup.log'),
    stateFile: path.join(__dirname, 'backup.state.json'),
    checkInterval: '0 */1 * * *',
};

let state = {
    lastCheckTime: null,
    destinationPath: '',
    backupConfigs: [
        {
            id: 1,
            name: 'Default Backup',
            sourcePath: '/Users/exider/Primary/backups',
            outputFolder: 'mac_backups', // Папка, куда будут помещаться бэкапы на SSD
            lastBackupTime: null,
            backupSuccessful: false
        }
    ]
};

// Load state from file if exists
function loadState() {
    try {
        if (fs.existsSync(config.stateFile)) {
            const stateData = fs.readFileSync(config.stateFile, 'utf8');
            state = { ...state, ...JSON.parse(stateData) };
            log(`State loaded: Last backup on ${state.lastBackupTime || 'never'}`);
        } else {
            log('No previous state found, starting fresh');
        }
    } catch (error) {
        log(`Error loading state: ${error.message}`, 'error');
    }
}

// Save state to file
function saveState() {
    try {
        fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
        log(`Error saving state: ${error.message}`, 'error');
    }
}

// Log function with timestamp
function log(message, level = 'info') {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    // Console output with colors
    switch (level) {
        case 'error':
            console.error(colors.red(logMessage));
            break;
        case 'warning':
            console.warn(colors.yellow(logMessage));
            break;
        case 'success':
            console.log(colors.green(logMessage));
            break;
        default:
            console.log(colors.blue(logMessage));
    }
    
    // Append to log file
    fs.appendFileSync(config.logFile, logMessage + '\n');
}

// Check if SSD is connected
function checkSSDConnected(destinationPath) {
    return new Promise((resolve) => {
        if (!destinationPath) {
            log('Destination path not set', 'error');
            resolve(false);
            return;
        }

        // Check if the directory exists and is accessible
        fs.access(destinationPath, fs.constants.W_OK, (err) => {
            if (err) {
                log(`SSD not accessible at ${destinationPath}: ${err.message}`, 'error');
                resolve(false);
            } else {
                log(`SSD connected and accessible at ${destinationPath}`, 'success');
                resolve(true);
            }
        });
    });
}

// Check if backup is needed for a specific backup configuration (has it been more than 24 hours since last backup)
function isBackupNeeded(backupConfig) {
    if (!backupConfig.lastBackupTime) {
        log(`No previous backup found for "${backupConfig.name}", backup needed`);
        return true;
    }

    const lastBackup = moment(backupConfig.lastBackupTime);
    const now = moment();
    const hoursSinceLastBackup = now.diff(lastBackup, 'hours');
    
    if (hoursSinceLastBackup >= 24) {
        log(`Last backup for "${backupConfig.name}" was ${hoursSinceLastBackup} hours ago, backup needed`);
        return true;
    } else {
        log(`Last backup for "${backupConfig.name}" was ${hoursSinceLastBackup} hours ago, no backup needed yet`);
        return false;
    }
}

// Perform backup using rsync for a specific backup configuration
function performBackup(backupConfig, destinationPath) {
    return new Promise((resolve, reject) => {
        if (!destinationPath) {
            reject(new Error('Destination path not set'));
            return;
        }

        const sourcePath = backupConfig.sourcePath;
        // Создаем отдельную подпапку для бэкапов на SSD, чтобы не затронуть другие файлы
        const backupSubfolder = path.join(destinationPath, backupConfig.outputFolder);
        log(`Starting backup "${backupConfig.name}" from ${sourcePath} to ${backupSubfolder}`);
        
        // Ensure the destination directory exists
        fs.ensureDirSync(backupSubfolder);
        
        // Использование rsync с опцией --delete
        // Удаление работает только в подпапке конфигурации
        const rsyncArgs = [
            '-av',
            '--delete',
            // Exclude macOS system files and metadata
            '--exclude', '.DS_Store',
            '--exclude', '.Spotlight-V100',
            '--exclude', '.Trashes',
            '--exclude', '.fseventsd',
            '--exclude', '.TemporaryItems',
            '--exclude', '._.Trashes',
            '--exclude', '.apdisk',
            `${sourcePath}/`,
            backupSubfolder
        ];
        
        log(`Executing: rsync ${rsyncArgs.join(' ')}`);
        
        // Use spawn to handle process with potentially large output
        const rsyncProcess = spawn('rsync', rsyncArgs);
        
        let stdoutChunks = [];
        let stderrChunks = [];
        
        rsyncProcess.stdout.on('data', (data) => {
            if (stdoutChunks.length < 10) {
                stdoutChunks.push(data.toString());
            }
        });
        
        rsyncProcess.stderr.on('data', (data) => {
            stderrChunks.push(data.toString());
            log(`rsync stderr: ${data.toString().trim()}`, 'warning');
        });
        
        rsyncProcess.on('close', (code) => {
            if (code !== 0) {
                const errorMessage = `Backup "${backupConfig.name}" failed with exit code ${code}`;
                log(errorMessage, 'error');
                if (stderrChunks.length > 0) {
                    log(`rsync stderr: ${stderrChunks.join('')}`, 'error');
                }
                backupConfig.backupSuccessful = false;
                saveState();
                reject(new Error(errorMessage));
                return;
            }
            
            log(`rsync completed with exit code ${code} (success)`);
            if (stdoutChunks.length > 0) {
                log(`First few lines of rsync output: ${stdoutChunks.slice(0, 3).join('').trim()}...`);
            }
            log(`Backup "${backupConfig.name}" completed successfully`, 'success');
            
            // Update state
            backupConfig.lastBackupTime = moment().format();
            backupConfig.backupSuccessful = true;
            saveState();
            
            resolve();
        });
        
        rsyncProcess.on('error', (error) => {
            log(`Failed to start rsync for "${backupConfig.name}": ${error.message}`, 'error');
            backupConfig.backupSuccessful = false;
            saveState();
            reject(error);
        });
    });
}

// Main function to check and perform backup for all configurations
async function checkAndBackup() {
    try {
        log('Checking backup status for all configurations...');
        state.lastCheckTime = moment().format();
        saveState();
        
        // Check if destination is set
        if (!state.destinationPath) {
            log('Destination path not set, cannot perform backup', 'error');
            return;
        }
        
        // Check if SSD is connected
        const ssdConnected = await checkSSDConnected(state.destinationPath);
        if (!ssdConnected) {
            log('SSD not connected, skipping backup', 'warning');
            return;
        }
        
        log('SSD connected, checking all backup configurations');
        
        // Process each backup configuration
        for (const backupConfig of state.backupConfigs) {
            log(`Checking backup configuration: "${backupConfig.name}" (ID: ${backupConfig.id})`);
            if (isBackupNeeded(backupConfig)) {
                await performBackup(backupConfig, state.destinationPath);
            }
        }
        
    } catch (error) {
        log(`Error during backup process: ${error.message}`, 'error');
    }
}

// Set up command line interface
function setupCLI() {
    if (process.argv.includes('--set-destination')) {
        const index = process.argv.indexOf('--set-destination');
        if (index > -1 && index + 1 < process.argv.length) {
            const newPath = process.argv[index + 1];
            state.destinationPath = newPath;
            saveState();
            log(`Destination path set to: ${newPath}`, 'success');
            process.exit(0);
        } else {
            log('Please provide a destination path', 'error');
            process.exit(1);
        }
    }
    
    // Add a new backup configuration
    if (process.argv.includes('--add-backup')) {
        // Get parameters for the new backup configuration
        const nameIndex = process.argv.indexOf('--name');
        const sourceIndex = process.argv.indexOf('--source');
        const folderIndex = process.argv.indexOf('--folder');
        
        if (nameIndex === -1 || sourceIndex === -1 || folderIndex === -1 || 
            nameIndex + 1 >= process.argv.length || 
            sourceIndex + 1 >= process.argv.length || 
            folderIndex + 1 >= process.argv.length) {
            log('Please provide all required parameters: --name, --source, --folder', 'error');
            console.log('Example: node backup.js --add-backup --name "Documents Backup" --source "/Users/exider/Documents" --folder "documents_backup"');
            process.exit(1);
        }
        
        const name = process.argv[nameIndex + 1];
        const sourcePath = process.argv[sourceIndex + 1];
        const outputFolder = process.argv[folderIndex + 1];
        
        // Generate a new ID (max ID + 1)
        const maxId = state.backupConfigs.reduce((max, config) => Math.max(max, config.id), 0);
        const newId = maxId + 1;
        
        // Add new backup configuration
        state.backupConfigs.push({
            id: newId,
            name,
            sourcePath,
            outputFolder,
            lastBackupTime: null,
            backupSuccessful: false
        });
        
        saveState();
        log(`Added new backup configuration: "${name}" (ID: ${newId})`, 'success');
        log(`Source path: ${sourcePath}`, 'info');
        log(`Output folder: ${outputFolder}`, 'info');
        process.exit(0);
    }
    
    // Remove a backup configuration
    if (process.argv.includes('--remove-backup')) {
        const index = process.argv.indexOf('--remove-backup');
        if (index > -1 && index + 1 < process.argv.length) {
            const idToRemove = parseInt(process.argv[index + 1], 10);
            
            if (isNaN(idToRemove)) {
                log('Please provide a valid backup ID to remove', 'error');
                process.exit(1);
            }
            
            const initialLength = state.backupConfigs.length;
            state.backupConfigs = state.backupConfigs.filter(config => config.id !== idToRemove);
            
            if (state.backupConfigs.length === initialLength) {
                log(`No backup configuration found with ID: ${idToRemove}`, 'error');
                process.exit(1);
            }
            
            saveState();
            log(`Removed backup configuration with ID: ${idToRemove}`, 'success');
            process.exit(0);
        } else {
            log('Please provide a backup ID to remove', 'error');
            process.exit(1);
        }
    }
    
    // Modify an existing backup configuration
    if (process.argv.includes('--edit-backup')) {
        const index = process.argv.indexOf('--edit-backup');
        if (index > -1 && index + 1 < process.argv.length) {
            const idToEdit = parseInt(process.argv[index + 1], 10);
            
            if (isNaN(idToEdit)) {
                log('Please provide a valid backup ID to edit', 'error');
                process.exit(1);
            }
            
            const configIndex = state.backupConfigs.findIndex(config => config.id === idToEdit);
            
            if (configIndex === -1) {
                log(`No backup configuration found with ID: ${idToEdit}`, 'error');
                process.exit(1);
            }
            
            const nameIndex = process.argv.indexOf('--name');
            const sourceIndex = process.argv.indexOf('--source');
            const folderIndex = process.argv.indexOf('--folder');
            
            // Update fields if provided
            if (nameIndex > -1 && nameIndex + 1 < process.argv.length) {
                state.backupConfigs[configIndex].name = process.argv[nameIndex + 1];
            }
            
            if (sourceIndex > -1 && sourceIndex + 1 < process.argv.length) {
                state.backupConfigs[configIndex].sourcePath = process.argv[sourceIndex + 1];
            }
            
            if (folderIndex > -1 && folderIndex + 1 < process.argv.length) {
                state.backupConfigs[configIndex].outputFolder = process.argv[folderIndex + 1];
            }
            
            saveState();
            log(`Updated backup configuration with ID: ${idToEdit}`, 'success');
            process.exit(0);
        } else {
            log('Please provide a backup ID to edit', 'error');
            process.exit(1);
        }
    }
    
    if (process.argv.includes('--backup-now')) {
        const idIndex = process.argv.indexOf('--id');
        
        if (idIndex > -1 && idIndex + 1 < process.argv.length) {
            const backupId = parseInt(process.argv[idIndex + 1], 10);
            
            if (isNaN(backupId)) {
                log('Please provide a valid backup ID', 'error');
                process.exit(1);
            }
            
            const backupConfig = state.backupConfigs.find(config => config.id === backupId);
            
            if (!backupConfig) {
                log(`No backup configuration found with ID: ${backupId}`, 'error');
                process.exit(1);
            }
            
            log(`Manual backup triggered for "${backupConfig.name}" (ID: ${backupId})`);
            
            // Check if SSD is connected and perform backup for the specified configuration only
            (async () => {
                if (!state.destinationPath) {
                    log('Destination path not configured. Please configure with --set-destination', 'error');
                    process.exit(1);
                }
                
                try {
                    const ssdConnected = await checkSSDConnected(state.destinationPath);
                    if (!ssdConnected) {
                        log('SSD not connected or not accessible, cannot perform backup', 'error');
                        process.exit(1);
                    }
                    
                    await performBackup(backupConfig, state.destinationPath);
                    process.exit(0);
                } catch (error) {
                    log(`Error in backup process: ${error.message}`, 'error');
                    process.exit(1);
                }
            })();
        } else {
            // No specific ID provided, back up all configurations
            log('Manual backup triggered for all configurations');
            checkAndBackup().then(() => process.exit(0));
        }
        return; // Don't start scheduled task
    }
    
    if (process.argv.includes('--status')) {
        log('Backup configurations:');
        
        if (state.backupConfigs.length === 0) {
            log('No backup configurations defined');
        } else {
            for (const config of state.backupConfigs) {
                console.log('---------------------------------------------------');
                console.log(`${colors.bold('ID:')} ${config.id}`);
                console.log(`${colors.bold('Name:')} ${config.name}`);
                console.log(`${colors.bold('Source path:')} ${config.sourcePath}`);
                console.log(`${colors.bold('Output folder:')} ${config.outputFolder}`);
                
                if (config.lastBackupTime) {
                    const lastBackup = moment(config.lastBackupTime);
                    const now = moment();
                    const hoursSinceLastBackup = now.diff(lastBackup, 'hours');
                    console.log(`${colors.bold('Last backup:')} ${config.lastBackupTime} (${hoursSinceLastBackup} hours ago)`);
                    console.log(`${colors.bold('Status:')} ${config.backupSuccessful ? colors.green('Success') : colors.red('Failed')}`);
                } else {
                    console.log(`${colors.bold('Last backup:')} Never`);
                }
            }
            console.log('---------------------------------------------------');
        }
        
        log(`Destination path: ${state.destinationPath || 'Not set'}`);
        process.exit(0);
    }
    
    if (process.argv.includes('--help') || process.argv.length === 2) {
        console.log(colors.bold('\nBackup System - Daily SSD Backup Script\n'));
        console.log('Usage:');
        console.log('  node backup.js [options]\n');
        console.log('Options:');
        console.log('  --set-destination <path>   Set the SSD destination path');
        console.log('  --add-backup               Add a new backup configuration');
        console.log('    --name <name>              Name for the backup configuration');
        console.log('    --source <path>            Source path to backup');
        console.log('    --folder <name>            Output folder name on the SSD');
        console.log('  --remove-backup <id>       Remove a backup configuration');
        console.log('  --edit-backup <id>         Edit a backup configuration');
        console.log('    --name <name>              New name (optional)');
        console.log('    --source <path>            New source path (optional)');
        console.log('    --folder <name>            New output folder name (optional)');
        console.log('  --backup-now               Run backup immediately for all configurations');
        console.log('    --id <id>                  Backup only the specified configuration');
        console.log('  --status                   Show backup configurations and status');
        console.log('  --daemon                   Run as a daemon (checks hourly)');
        console.log('  --help                     Show this help message\n');
        console.log('Examples:');
        console.log('  Add backup:  node backup.js --add-backup --name "Documents" --source "/Users/exider/Documents" --folder "documents_backup"');
        console.log('  Run backup:  node backup.js --backup-now --id 2');
        console.log('  Edit backup: node backup.js --edit-backup 2 --source "/Users/exider/Photos"\n');
        process.exit(0);
    }
}

// Initialize and run
function init() {
    // Ensure log directory exists
    fs.ensureDirSync(path.dirname(config.logFile));
    
    log('Backup system initializing...');
    
    // Load saved state
    loadState();
    
    // Set up CLI
    setupCLI();
    
    // If running as daemon
    if (process.argv.includes('--daemon')) {
        log(`Starting daemon mode, checking every hour (${config.checkInterval})`);
        
        // Run initial check
        checkAndBackup();
        
        // Schedule regular checks using cron
        cron.schedule(config.checkInterval, () => {
            log('Scheduled check triggered');
            checkAndBackup();
        });
        
        // Keep process alive
        console.log(colors.green('Daemon running in background. Press Ctrl+C to exit.'));
    } else {
        log('Run with --daemon flag to start scheduled checks');
        process.exit(0);
    }
}

// Start the application
init();
