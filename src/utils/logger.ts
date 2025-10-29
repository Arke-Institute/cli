/**
 * Structured logging utility
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private level: LogLevel;
  private logFile?: string;

  constructor(level: LogLevel = LogLevel.INFO, logFile?: string) {
    this.level = level;
    this.logFile = logFile;
  }

  debug(message: string, meta?: any): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: any): void {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, meta?: any): void {
    this.log(LogLevel.ERROR, message, meta);
  }

  private log(level: LogLevel, message: string, meta?: any): void {
    if (level < this.level) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];

    const logEntry = {
      timestamp,
      level: levelName,
      message,
      ...(meta && { meta }),
    };

    // Console output (formatted for readability)
    const color = this.getColor(level);
    const reset = '\x1b[0m';
    console.log(`${color}[${timestamp}] ${levelName}${reset}: ${message}`);
    if (meta) {
      console.log('  ', meta);
    }

    // File output (JSON format)
    if (this.logFile) {
      this.writeToFile(JSON.stringify(logEntry) + '\n').catch((err) => {
        console.error('Failed to write to log file:', err);
      });
    }
  }

  private getColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return '\x1b[36m'; // Cyan
      case LogLevel.INFO:
        return '\x1b[32m'; // Green
      case LogLevel.WARN:
        return '\x1b[33m'; // Yellow
      case LogLevel.ERROR:
        return '\x1b[31m'; // Red
      default:
        return '\x1b[0m'; // Reset
    }
  }

  private async writeToFile(content: string): Promise<void> {
    if (!this.logFile) return;

    await fs.appendFile(this.logFile, content, 'utf-8');
  }
}

// Singleton instance
let loggerInstance: Logger;

export function initLogger(debug: boolean = false, logFile?: string): Logger {
  const level = debug ? LogLevel.DEBUG : LogLevel.INFO;
  loggerInstance = new Logger(level, logFile);
  return loggerInstance;
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}
