/**
 * batchProcessor - Orchestrates the full processing pipeline
 */

const fs = require('fs').promises;
const path = require('path');

const IntentExtractor = require('./intentExtractor');
const GeminiProcessor = require('./geminiProcessor');
const SnippetExtractor = require('./snippetExtractor');
const ObsidianLinker = require('./obsidianLinker');
const FlashcardGenerator = require('./flashcardGenerator');
const MOCManager = require('./mocManager');
const Writer = require('./writer');

class BatchProcessor {
  constructor(options = {}) {
    this.options = {
      inputDir: options.inputDir || './input',
      outputDir: options.outputDir || '/workspace/Obsidian_Vault/gemini/',
      dryRun: options.dryRun || false,
      verbose: options.verbose || false,
      delayMs: options.delayMs || 1100 // 1.1s rate limit
    };

    // Initialize components
    this.intentExtractor = new IntentExtractor();
    this.geminiProcessor = new GeminiProcessor({ delayMs: this.options.delayMs });
    this.snippetExtractor = new SnippetExtractor();
    this.obsidianLinker = new ObsidianLinker(this.options.outputDir);
    this.flashcardGenerator = new FlashcardGenerator();
    this.mocManager = new MOCManager(this.options.outputDir);
    this.writer = new Writer({ outputDir: this.options.outputDir });
  }

  log(message) {
    if (this.options.verbose) {
      console.log(`[BatchProcessor] ${message}`);
    }
  }

  async initialize() {
    this.log('Initializing components...');
    await this.mocManager.initialize();
    await this.obsidianLinker.buildIndex();
    this.log('Initialization complete');
  }

  /**
   * Process a single chat file into one or more notes
   */
  async processChat(inputFile, outputDir) {
    this.log(`Processing: ${inputFile}`);
    
    // Read the file
    let chatContent;
    try {
      chatContent = await fs.readFile(inputFile, 'utf-8');
    } catch (error) {
      console.error(`Error reading ${inputFile}: ${error.message}`);
      return { success: false, error: error.message };
    }

    // Parse chat and extract intents
    const parsed = this.intentExtractor.parseChat(chatContent);
    this.log(`Found ${parsed.knowledgeSegments.length} knowledge segments`);

    // If no knowledge segments, skip
    if (parsed.knowledgeSegments.length === 0) {
      this.log(`No knowledge content in ${inputFile}, skipping`);
      return { success: true, skipped: true, reason: 'no knowledge segments' };
    }

    const results = [];

    // Process each knowledge segment as a separate note
    for (const segment of parsed.knowledgeSegments) {
      try {
        const noteResult = await this.processSegment(segment, parsed.frontmatter, outputDir);
        results.push(noteResult);
        
        // Small delay between segments
        await this.sleep(500);
      } catch (error) {
        console.error(`Error processing segment: ${error.message}`);
        results.push({ success: false, error: error.message });
      }
    }

    return {
      success: true,
      file: inputFile,
      notesCreated: results.filter(r => r.success).length,
      results
    };
  }

  async processSegment(segment, frontmatter, outputDir) {
    const content = segment.content;

    this.log(`Processing segment: ${segment.intent}`);

    // 1. Generate summary (rate limited)
    this.log('Generating summary...');
    let summary = '';
    try {
      summary = await this.geminiProcessor.generateSummary(content);
    } catch (error) {
      console.warn(`Summary generation failed: ${error.message}`);
      summary = 'Summary generation failed';
    }

    // 2. Refactor content to technical documentation (rate limited)
    this.log('Refactoring content...');
    let refactoredContent = '';
    try {
      refactoredContent = await this.geminiProcessor.refactorContent(content, segment.intent);
    } catch (error) {
      console.warn(`Refactoring failed: ${error.message}`);
      refactoredContent = content; // Fallback to original
    }

    // 3. Extract code snippets
    this.log('Extracting code snippets...');
    const codeResult = this.snippetExtractor.process(refactoredContent);
    const codeBlocks = codeResult.formattedBlocks || [];

    // 4. Check consistency (rate limited)
    this.log('Checking consistency...');
    let consistencyCheck = 'PASS';
    try {
      const checkResult = await this.geminiProcessor.checkConsistency(content);
      if (checkResult.startsWith('WARN')) {
        consistencyCheck = `WARN: ${checkResult.substring(5)}`;
      } else if (checkResult.startsWith('FAIL')) {
        consistencyCheck = `FAIL: ${checkResult.substring(5)}`;
      }
    } catch (error) {
      console.warn(`Consistency check failed: ${error.message}`);
    }

    // 5. Generate flashcards (rate limited)
    this.log('Generating flashcards...');
    let flashcards = [];
    try {
      const fcResult = await this.geminiProcessor.generateFlashcards(content);
      flashcards = this.flashcardGenerator.parseGeminiOutput(fcResult);
    } catch (error) {
      console.warn(`Flashcard generation failed: ${error.message}`);
    }

    // 6. Extract topics (rate limited)
    this.log('Extracting topics...');
    let topics = [];
    try {
      const topicsStr = await this.geminiProcessor.extractTopics(content);
      topics = topicsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
    } catch (error) {
      console.warn(`Topic extraction failed: ${error.message}`);
    }

    // 7. Insert wiki links
    this.log('Inserting wiki links...');
    const linkedContent = this.obsidianLinker.insertLinks(refactoredContent, topics);

    // 8. Build note data
    const noteData = {
      title: this.generateTitle(segment, frontmatter),
      metadata: {
        title: this.generateTitle(segment, frontmatter),
        uuid: this.generateUUID(),
        exported: this.getTimestamp(),
        created: frontmatter?.created || null,
        url: frontmatter?.url || null,
        tags: ['gemini', segment.intent, ...topics.slice(0, 3)],
        summary: summary,
        consistency_check: consistencyCheck
      },
      summary,
      content: linkedContent,
      codeBlocks,
      flashcardSection: flashcards.length > 0 
        ? this.flashcardGenerator.generateFlashcardSection(flashcards)
        : '',
      flashcards,
      relatedNotes: []
    };

    // 9. Find related notes
    for (const topic of topics) {
      const related = this.obsidianLinker.findRelatedNotes(topic, 3);
      noteData.relatedNotes.push(...related);
    }

    // Add flashcards to content if present
    if (flashcards.length > 0) {
      noteData.content += noteData.flashcardSection;
    }

    // 10. Write the note
    const writeResult = await this.writer.writeNote(noteData, this.options.dryRun);

    // 11. Update MOCs
    if (!this.options.dryRun && topics.length > 0) {
      await this.mocManager.addNoteToMOCs(noteData.title, topics, summary);
    }

    this.log(`Note created: ${noteData.title}`);
    
    return {
      success: writeResult.success,
      title: noteData.title,
      path: writeResult.path || 'dry-run',
      intent: segment.intent,
      topics
    };
  }

  generateTitle(segment, frontmatter) {
    // Try to extract a good title from the content
    const lines = segment.content.split('\n').filter(l => l.trim().length > 0);
    
    // Look for first significant line
    for (const line of lines.slice(0, 5)) {
      const cleaned = line.replace(/^[#\-*]/, '').trim();
      if (cleaned.length > 10 && cleaned.length < 80) {
        return this.cleanTitle(cleaned);
      }
    }
    
    // Fallback to frontmatter title or generic
    return frontmatter?.title 
      ? this.cleanTitle(frontmatter.title)
      : `Note-${Date.now()}`;
  }

  cleanTitle(title) {
    return title
      .replace(/^You:\s*/i, '')
      .replace(/^Gemini:\s*/i, '')
      .replace(/[^a-zA-Z0-9ÄÖÜäöüß\-_\s]/g, '')
      .trim()
      .substring(0, 80);
  }

  generateUUID() {
    const crypto = require('crypto');
    return crypto.randomUUID();
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Process all files in input directory
   */
  async processAll() {
    await this.initialize();

    // Get all markdown files from input directory
    const files = await fs.readdir(this.options.inputDir);
    const mdFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.markdown'));

    this.log(`Found ${mdFiles.length} markdown files to process`);

    const results = [];
    
    for (const file of mdFiles) {
      const inputPath = path.join(this.options.inputDir, file);
      
      console.log(`Processing: ${file}`);
      const result = await this.processChat(inputPath, this.options.outputDir);
      results.push(result);
      
      // Delay between files to respect rate limits
      if (mdFiles.indexOf(file) < mdFiles.length - 1) {
        this.log('Waiting before next file...');
        await this.sleep(2000);
      }
    }

    return {
      total: mdFiles.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      skipped: results.filter(r => r.skipped).length,
      results
    };
  }
}

module.exports = BatchProcessor;
