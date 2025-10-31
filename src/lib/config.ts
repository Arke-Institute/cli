/**
 * Configuration management - loads from config file, env vars, and CLI args
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getLogger } from '../utils/logger.js';
import { ProcessingConfig, DEFAULT_PROCESSING_CONFIG } from '../types/processing.js';
import { PreprocessorConfig, DEFAULT_PREPROCESSOR_CONFIG } from '../types/preprocessor.js';
import { validateTiffMode, validateTiffQuality } from './validation.js';

export interface ConfigFile {
  workerUrl?: string;
  uploader?: string;
  rootPath?: string;
  parentPi?: string;
  parallel?: number;
  parallelParts?: number;
  metadata?: Record<string, any>;
  processing?: ProcessingConfig;
  preprocessor?: PreprocessorConfig;
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

  // Merge processing config with defaults to ensure all fields are present
  const processingConfig = mergeProcessingWithDefaults(
    envConfig.processing || fileConfig.processing
  );

  // Merge preprocessor config with defaults
  const preprocessorConfig = mergePreprocessorWithDefaults(
    cliOptions,
    envConfig.preprocessor,
    fileConfig.preprocessor
  );

  const config: ConfigFile = {
    workerUrl: cliOptions.workerUrl || envConfig.workerUrl || fileConfig.workerUrl || 'https://ingest.arke.institute',
    uploader: cliOptions.uploader || envConfig.uploader || fileConfig.uploader,
    // For rootPath, check if it's the default '/' - if so, prefer config/env
    rootPath: (cliOptions.rootPath && cliOptions.rootPath !== '/')
      ? cliOptions.rootPath
      : (envConfig.rootPath || fileConfig.rootPath || cliOptions.rootPath || '/'),
    // For parentPi, check if it's the default (26 zeros) - if so, prefer config/env
    parentPi: (cliOptions.parentPi && cliOptions.parentPi !== '00000000000000000000000000')
      ? cliOptions.parentPi
      : (envConfig.parentPi || fileConfig.parentPi || cliOptions.parentPi || '00000000000000000000000000'),
    // For parallel, check if it's the default '5' - if so, prefer config/env
    parallel: (cliOptions.parallel && cliOptions.parallel !== '5')
      ? parseInt(cliOptions.parallel, 10)
      : (envConfig.parallel || fileConfig.parallel || parseInt(cliOptions.parallel || '5', 10)),
    parallelParts: (cliOptions.parallelParts && cliOptions.parallelParts !== '3')
      ? parseInt(cliOptions.parallelParts, 10)
      : (envConfig.parallelParts || fileConfig.parallelParts || parseInt(cliOptions.parallelParts || '3', 10)),
    metadata: cliOptions.metadata || envConfig.metadata || fileConfig.metadata,
    processing: processingConfig,
    preprocessor: preprocessorConfig,
  };

  logger.debug('Configuration loaded', { config });

  return config;
}

/**
 * Merge partial processing config with defaults
 */
function mergeProcessingWithDefaults(partial?: Partial<ProcessingConfig>): ProcessingConfig {
  if (!partial) {
    return DEFAULT_PROCESSING_CONFIG;
  }
  return {
    ocr: partial.ocr ?? DEFAULT_PROCESSING_CONFIG.ocr,
    describe: partial.describe ?? DEFAULT_PROCESSING_CONFIG.describe,
    pinax: partial.pinax ?? DEFAULT_PROCESSING_CONFIG.pinax,
  };
}

/**
 * Merge preprocessor config from CLI, env, and file (CLI has highest priority)
 */
function mergePreprocessorWithDefaults(
  cliOptions: any,
  envConfig?: Partial<PreprocessorConfig>,
  fileConfig?: Partial<PreprocessorConfig>
): PreprocessorConfig {
  const logger = getLogger();

  // Parse and validate TIFF mode (CLI > env > file > default)
  let tiffMode = DEFAULT_PREPROCESSOR_CONFIG.tiffMode;
  if (cliOptions.convertTiff && cliOptions.convertTiff !== 'convert') {
    tiffMode = validateTiffMode(cliOptions.convertTiff);
  } else if (envConfig?.tiffMode) {
    tiffMode = validateTiffMode(envConfig.tiffMode);
  } else if (fileConfig?.tiffMode) {
    tiffMode = validateTiffMode(fileConfig.tiffMode);
  } else if (cliOptions.convertTiff === 'convert') {
    tiffMode = 'convert';
  }

  // Parse and validate TIFF quality (CLI > env > file > default)
  let tiffQuality = DEFAULT_PREPROCESSOR_CONFIG.tiffQuality;
  if (cliOptions.tiffQuality && cliOptions.tiffQuality !== '95') {
    const parsed = parseInt(cliOptions.tiffQuality, 10);
    validateTiffQuality(parsed);
    tiffQuality = parsed;
  } else if (envConfig?.tiffQuality !== undefined) {
    validateTiffQuality(envConfig.tiffQuality);
    tiffQuality = envConfig.tiffQuality;
  } else if (fileConfig?.tiffQuality !== undefined) {
    validateTiffQuality(fileConfig.tiffQuality);
    tiffQuality = fileConfig.tiffQuality;
  } else if (cliOptions.tiffQuality === '95') {
    tiffQuality = 95;
  }

  // Preprocess directory (CLI > env > file > undefined)
  const preprocessDir =
    cliOptions.preprocessDir ||
    envConfig?.preprocessDir ||
    fileConfig?.preprocessDir;

  return {
    tiffMode,
    tiffQuality,
    preprocessDir,
  };
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

  if (process.env.ARKE_PARENT_PI) {
    config.parentPi = process.env.ARKE_PARENT_PI;
  }

  if (process.env.ARKE_PARALLEL) {
    config.parallel = parseInt(process.env.ARKE_PARALLEL, 10);
  }

  if (process.env.ARKE_PARALLEL_PARTS) {
    config.parallelParts = parseInt(process.env.ARKE_PARALLEL_PARTS, 10);
  }

  if (process.env.ARKE_METADATA) {
    try {
      config.metadata = JSON.parse(process.env.ARKE_METADATA);
    } catch (error) {
      // Ignore invalid JSON
    }
  }

  if (process.env.ARKE_PROCESSING) {
    try {
      config.processing = JSON.parse(process.env.ARKE_PROCESSING);
    } catch (error) {
      // Ignore invalid JSON
    }
  }

  // Preprocessor config
  if (process.env.ARKE_TIFF_MODE) {
    if (!config.preprocessor) {
      config.preprocessor = { ...DEFAULT_PREPROCESSOR_CONFIG };
    }
    config.preprocessor.tiffMode = process.env.ARKE_TIFF_MODE as any;
  }

  if (process.env.ARKE_TIFF_QUALITY) {
    if (!config.preprocessor) {
      config.preprocessor = { ...DEFAULT_PREPROCESSOR_CONFIG };
    }
    config.preprocessor.tiffQuality = parseInt(process.env.ARKE_TIFF_QUALITY, 10);
  }

  if (process.env.ARKE_PREPROCESS_DIR) {
    if (!config.preprocessor) {
      config.preprocessor = { ...DEFAULT_PREPROCESSOR_CONFIG };
    }
    config.preprocessor.preprocessDir = process.env.ARKE_PREPROCESS_DIR;
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
