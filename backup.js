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
    sourcePath: '/Users/exider/Primary/backups',
    defaultDestPath: '',
    logFile: path.join(__dirname, 'backup.log'),
    stateFile: path.join(__dirname, 'backup.state.json'),
    checkInterval: '0 */1 * * *',
};

let state = {
    lastBackupTime: null,
    lastCheckTime: null,
    backupSuccessful: false,
    destinationPath: '',
    outputFolder: 'mac_backups', // Папка, куда будут помещаться бэкапы на SSD
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

// Check if backup is needed (has it been more than 24 hours since last backup)
function isBackupNeeded() {
    if (!state.lastBackupTime) {
        log('No previous backup found, backup needed');
        return true;
    }

    const lastBackup = moment(state.lastBackupTime);
    const now = moment();
    const hoursSinceLastBackup = now.diff(lastBackup, 'hours');
    
    if (hoursSinceLastBackup >= 24) {
        log(`Last backup was ${hoursSinceLastBackup} hours ago, backup needed`);
        return true;
    } else {
        log(`Last backup was ${hoursSinceLastBackup} hours ago, no backup needed yet`);
        return false;
    }
}

// Perform backup using rsync
function performBackup(sourcePath, destinationPath) {
    return new Promise((resolve, reject) => {
        if (!destinationPath) {
            reject(new Error('Destination path not set'));
            return;
        }

        // Создаем отдельную подпапку для бэкапов на SSD, чтобы не затронуть другие файлы
        const backupSubfolder = path.join(destinationPath, state.outputFolder);
        log(`Starting backup from ${sourcePath} to ${backupSubfolder}`);
        
        // Ensure the destination directory exists
        fs.ensureDirSync(backupSubfolder);
        
        // Использование rsync с опцией --delete
        // Удаление работает только в подпапке mac_backups
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
                const errorMessage = `Backup failed with exit code ${code}`;
                log(errorMessage, 'error');
                if (stderrChunks.length > 0) {
                    log(`rsync stderr: ${stderrChunks.join('')}`, 'error');
                }
                reject(new Error(errorMessage));
                return;
            }
            
            log(`rsync completed with exit code ${code} (success)`);
            if (stdoutChunks.length > 0) {
                log(`First few lines of rsync output: ${stdoutChunks.slice(0, 3).join('').trim()}...`);
            }
            log('Backup completed successfully', 'success');
            
            // Update state
            state.lastBackupTime = moment().format();
            state.backupSuccessful = true;
            saveState();
            
            resolve();
        });
        
        rsyncProcess.on('error', (error) => {
            log(`Failed to start rsync: ${error.message}`, 'error');
            reject(error);
        });
    });
}

// Main function to check and perform backup
async function checkAndBackup() {
    try {
        log('Checking backup status...');
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
        
        // Check if backup is needed
        if (!isBackupNeeded()) {
            log('Backup not needed at this time');
            return;
        }
        
        // Perform backup
        await performBackup(config.sourcePath, state.destinationPath);
        
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
    
    if (process.argv.includes('--set-output-folder')) {
        const index = process.argv.indexOf('--set-output-folder');
        if (index > -1 && index + 1 < process.argv.length) {
            const newFolder = process.argv[index + 1];
            state.outputFolder = newFolder;
            saveState();
            log(`Output folder set to: ${newFolder}`, 'success');
            process.exit(0);
        } else {
            log('Please provide an output folder name', 'error');
            process.exit(1);
        }
    }
    
    if (process.argv.includes('--backup-now')) {
        log('Manual backup triggered');
        checkAndBackup().then(() => process.exit(0));
        return; // Don't start scheduled task
    }
    
    if (process.argv.includes('--status')) {
        if (state.lastBackupTime) {
            const lastBackup = moment(state.lastBackupTime);
            const now = moment();
            const hoursSinceLastBackup = now.diff(lastBackup, 'hours');
            log(`Last successful backup: ${state.lastBackupTime} (${hoursSinceLastBackup} hours ago)`);
        } else {
            log('No backup has been performed yet');
        }
        log(`Destination path: ${state.destinationPath || 'Not set'}`);
        log(`Output folder: ${state.outputFolder}`);
        process.exit(0);
    }
    
    if (process.argv.includes('--help') || process.argv.length === 2) {
        console.log(colors.bold('\nBackup System - Daily SSD Backup Script\n'));
        console.log('Usage:');
        console.log('  node backup.js [options]\n');
        console.log('Options:');
        console.log('  --set-destination <path>  Set the SSD destination path');
        console.log('  --set-output-folder <name> Set the output folder name on SSD (default: mac_backups)');
        console.log('  --backup-now              Run backup immediately');
        console.log('  --status                  Show backup status');
        console.log('  --daemon                  Run as a daemon (checks hourly)');
        console.log('  --help                    Show this help message\n');
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
