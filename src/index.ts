#!/usr/bin/env node

/**
 * Arke Upload CLI - Main entry point
 */

import { Command } from 'commander';
import { createUploadCommand } from './commands/upload.js';

const program = new Command();

program
  .name('arke-upload')
  .description('CLI tool for uploading files to Arke Institute\'s ingest service')
  .version('0.1.0');

// Add upload command
program.addCommand(createUploadCommand());

// If no arguments provided, show help
if (process.argv.length === 2) {
  program.help();
}

program.parse(process.argv);
