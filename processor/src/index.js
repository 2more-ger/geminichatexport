#!/usr/bin/env node

/**
 * Gemini Chat to Obsidian - Batch Processor
 * CLI Entry Point
 */

const BatchProcessor = require('./batchProcessor');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);

const options = {
  inputDir: null,
  outputDir: '/workspace/Obsidian_Vault/gemini/',
  dryRun: false,
  verbose: false
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  switch (arg) {
    case '-i':
    case '--input':
      options.inputDir = args[++i];
      break;
    case '-o':
    case '--output':
      options.outputDir = args[++i];
      break;
    case '--dry-run':
      options.dryRun = true;
      break;
    case '-v':
    case '--verbose':
      options.verbose = true;
      break;
    case '-h':
    case '--help':
      console.log(`
Gemini Chat to Obsidian Batch Processor

Usage:
  node index.js -i <input-dir> [options]

Options:
  -i, --input <dir>    Input directory with exported .md files (required)
  -o, --output <dir>   Output directory for Obsidian notes (default: /workspace/Obsidian_Vault/gemini/)
  --dry-run            Preview mode without writing files
  -v, --verbose        Verbose logging
  -h, --help           Show this help message

Example:
  node index.js -i /workspace/GeminiBackup -o /tmp/test-output --dry-run -v
      `);
      process.exit(0);
      break;
    default:
      if (!arg.startsWith('-')) {
        // Assume it's the input directory
        options.inputDir = arg;
      }
  }
}

// Validate required options
if (!options.inputDir) {
  console.error('Error: Input directory is required');
  console.error('Use -i or --input to specify the input directory');
  console.error('Run with -h or --help for usage information');
  process.exit(1);
}

// Validate input directory exists
const fs = require('fs');
if (!fs.existsSync(options.inputDir)) {
  console.error(`Error: Input directory does not exist: ${options.inputDir}`);
  process.exit(1);
}

// Start processing
console.log('='.repeat(60));
console.log('Gemini Chat to Obsidian Batch Processor');
console.log('='.repeat(60));
console.log('');
console.log(`Input Directory:  ${options.inputDir}`);
console.log(`Output Directory: ${options.outputDir}`);
console.log(`Dry Run:          ${options.dryRun ? 'YES' : 'NO'}`);
console.log(`Verbose:          ${options.verbose ? 'YES' : 'NO'}`);
console.log('');

// Create processor and run
const processor = new BatchProcessor({
  inputDir: options.inputDir,
  outputDir: options.outputDir,
  dryRun: options.dryRun,
  verbose: options.verbose
});

processor.processAll()
  .then(results => {
    console.log('');
    console.log('='.repeat(60));
    console.log('Processing Complete');
    console.log('='.repeat(60));
    console.log(`Total Files:      ${results.total}`);
    console.log(`Successful:       ${results.successful}`);
    console.log(`Failed:           ${results.failed}`);
    console.log(`Skipped:          ${results.skipped}`);
    console.log('');
    
    if (results.failed > 0) {
      console.log('Failed files:');
      for (const r of results.results.filter(r => !r.success)) {
        console.log(`  - ${r.file}: ${r.error}`);
      }
    }
    
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
