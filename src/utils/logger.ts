import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { createWriteStream } from 'fs';
import { format } from 'util';

// Define log levels
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Logger class
class Logger {
  private logLevel: LogLevel;
  private logStream: fs.WriteStream | null;
  private maxLogSize: number;
  private logDir: string;
  private logFile: string;
  private errorFile: string;

  constructor() {
    // Set default log level from environment or default to INFO
    this.logLevel = (process.env.LOG_LEVEL?.toUpperCase() === 'DEBUG') ? LogLevel.DEBUG :
      (process.env.LOG_LEVEL?.toUpperCase() === 'WARN') ? LogLevel.WARN :
      (process.env.LOG_LEVEL?.toUpperCase() === 'ERROR') ? LogLevel.ERROR :
      LogLevel.INFO;

    // Set up log file paths
    this.logDir = process.env.LOG_DIR || path.join(homedir(), '.cliphelper', 'logs');
    this.logFile = path.join(this.logDir, 'cliphelper.log');
    this.errorFile = path.join(this.logDir, 'cliphelper-error.log');
    this.maxLogSize = parseInt(process.env.MAX_LOG_SIZE || '10485760', 10); // 10MB default
    this.logStream = null;

    // Create log directory if it doesn't exist
    this.initLogDirectory();
  }

  private initLogDirectory() {
    try {
      // Create log directory
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Initialize log file if it doesn't exist
      if (!fs.existsSync(this.logFile)) {
        fs.writeFileSync(this.logFile, '');
      }

      // Initialize error log file if it doesn't exist
      if (!fs.existsSync(this.errorFile)) {
        fs.writeFileSync(this.errorFile, '');
      }

      // Rotate logs if needed
      this.rotateLogIfNeeded(this.logFile);
      this.rotateLogIfNeeded(this.errorFile);

      // Open log stream
      this.logStream = createWriteStream(this.logFile, { flags: 'a' });
    } catch (err) {
      console.error('Failed to initialize log directory:', err);
    }
  }

  private rotateLogIfNeeded(filePath: string) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > this.maxLogSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `${filePath}.${timestamp}`;
        fs.renameSync(filePath, backupFile);
        fs.writeFileSync(filePath, '');
      }
    } catch (err) {
      console.error(`Failed to rotate log file ${filePath}:`, err);
    }
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  private writeToLog(level: string, message: string) {
    const formattedMessage = this.formatMessage(level, message);
    console.log(formattedMessage);

    if (this.logStream) {
      this.logStream.write(formattedMessage + '\n');
    }

    // Write errors to a separate error log file
    if (level === 'ERROR') {
      try {
        fs.appendFileSync(this.errorFile, formattedMessage + '\n');
      } catch (err) {
        console.error('Failed to write to error log:', err);
      }
    }
  }

  public debug(message: string, ...args: any[]) {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.writeToLog('DEBUG', format(message, ...args));
    }
  }

  public info(message: string, ...args: any[]) {
    if (this.logLevel <= LogLevel.INFO) {
      this.writeToLog('INFO', format(message, ...args));
    }
  }

  public warn(message: string, ...args: any[]) {
    if (this.logLevel <= LogLevel.WARN) {
      this.writeToLog('WARN', format(message, ...args));
    }
  }

  public error(message: string, ...args: any[]) {
    if (this.logLevel <= LogLevel.ERROR) {
      this.writeToLog('ERROR', format(message, ...args));
    }
  }

  public close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// Create and export a singleton instance
const logger = new Logger();
export default logger;