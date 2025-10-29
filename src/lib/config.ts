/**
 * Configuration management - loads from config file, env vars, and CLI args
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getLogger } from '../utils/logger.js';

export interface ConfigFile {
  workerUrl?: string;
  uploader?: string;
  rootPath?: string;
  parallel?: number;
  parallelParts?: number;
  allowedExtensions?: string[];
  metadata?: Record<string, any>;
}

const CONFIG_FILE_NAMES = [
  '.arke-upload.json',
  '.arke-upload.config.json',
  'arke-upload.config.json',
];

/**
 * Load configuration from various sources (priority: CLI args > env vars > config file > defaults)
 */
export async function loadConfig(cliOptions: any): Promise<ConfigFile> {
  const logger = getLogger();

  // 1. Load from config file
  const fileConfig = await loadConfigFile();

  // 2. Load from environment variables
  const envConfig = loadEnvConfig();

  // 3. Merge with CLI options (CLI has highest priority)
  // Note: Commander sets default values, so we check if they were explicitly provided
  const config: ConfigFile = {
    workerUrl: cliOptions.workerUrl || envConfig.workerUrl || fileConfig.workerUrl || 'https://ingest.arke.institute',
    uploader: cliOptions.uploader || envConfig.uploader || fileConfig.uploader,
    // For rootPath, check if it's the default '/' - if so, prefer config/env
    rootPath: (cliOptions.rootPath && cliOptions.rootPath !== '/')
      ? cliOptions.rootPath
      : (envConfig.rootPath || fileConfig.rootPath || cliOptions.rootPath || '/'),
    // For parallel, check if it's the default '5' - if so, prefer config/env
    parallel: (cliOptions.parallel && cliOptions.parallel !== '5')
      ? parseInt(cliOptions.parallel, 10)
      : (envConfig.parallel || fileConfig.parallel || parseInt(cliOptions.parallel || '5', 10)),
    parallelParts: (cliOptions.parallelParts && cliOptions.parallelParts !== '3')
      ? parseInt(cliOptions.parallelParts, 10)
      : (envConfig.parallelParts || fileConfig.parallelParts || parseInt(cliOptions.parallelParts || '3', 10)),
    allowedExtensions: cliOptions.allowedExtensions || envConfig.allowedExtensions || fileConfig.allowedExtensions,
    metadata: cliOptions.metadata || envConfig.metadata || fileConfig.metadata,
  };

  logger.debug('Configuration loaded', { config });

  return config;
}

/**
 * Load configuration from file
 * Searches in: current directory, home directory
 */
async function loadConfigFile(): Promise<ConfigFile> {
  const logger = getLogger();
  const searchPaths = [
    process.cwd(),
    os.homedir(),
  ];

  for (const dir of searchPaths) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = path.join(dir, fileName);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const config = JSON.parse(content);
        logger.debug(`Loaded config from: ${filePath}`);
        return config;
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          logger.warn(`Error reading config file ${filePath}: ${error.message}`);
        }
      }
    }
  }

  return {};
}

/**
 * Load configuration from environment variables
 */
function loadEnvConfig(): ConfigFile {
  const config: ConfigFile = {};

  if (process.env.ARKE_WORKER_URL) {
    config.workerUrl = process.env.ARKE_WORKER_URL;
  }

  if (process.env.ARKE_UPLOADER) {
    config.uploader = process.env.ARKE_UPLOADER;
  }

  if (process.env.ARKE_ROOT_PATH) {
    config.rootPath = process.env.ARKE_ROOT_PATH;
  }

  if (process.env.ARKE_PARALLEL) {
    config.parallel = parseInt(process.env.ARKE_PARALLEL, 10);
  }

  if (process.env.ARKE_PARALLEL_PARTS) {
    config.parallelParts = parseInt(process.env.ARKE_PARALLEL_PARTS, 10);
  }

  if (process.env.ARKE_ALLOWED_EXTENSIONS) {
    config.allowedExtensions = process.env.ARKE_ALLOWED_EXTENSIONS.split(',').map(ext => ext.trim());
  }

  if (process.env.ARKE_METADATA) {
    try {
      config.metadata = JSON.parse(process.env.ARKE_METADATA);
    } catch (error) {
      // Ignore invalid JSON
    }
  }

  return config;
}

/**
 * Create a default config file
 */
export async function createDefaultConfigFile(outputPath?: string): Promise<string> {
  const defaultConfig: ConfigFile = {
    workerUrl: 'https://ingest.arke.institute',
    uploader: 'Your Name',
    rootPath: '/',
    parallel: 5,
    parallelParts: 3,
  };

  const configPath = outputPath || path.join(process.cwd(), '.arke-upload.json');
  await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  return configPath;
}
