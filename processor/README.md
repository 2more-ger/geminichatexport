# Gemini Chat to Obsidian - Batch Processor

A Node.js module that transforms exported Gemini chat Markdown files into Obsidian-ready knowledge notes.

## Features

- **Parse Gemini chat exports** with YAML frontmatter and message turns
- **Transform to Obsidian format** with proper YAML frontmatter and tags
- **Auto-extract topics** using keyword analysis
- **Flexible output**:
  - Single consolidated note per conversation
  - Individual notes per message turn (`--split`)
  - Organized folder structures (`by-year`, `by-month`, `by-tag`)
- **Batch processing** of multiple files
- **Dry-run mode** for previewing transformations

## Installation

```bash
npm install
```

## Usage

### Command Line

```bash
# Basic usage
node src/index.js -i ./input -o ./output

# Split each message turn into individual notes
node src/index.js -i ./input -o ./output --split

# Organize by year
node src/index.js -i ./input -o ./output --folder-structure by-year

# Preview mode
node src/index.js -i ./input -o ./output --dry-run --verbose
```

### As a Module

```javascript
import { processBatch } from './src/batchProcessor.js';
import { parseGeminiChat, transformToObsidian } from './src/parser.js';

// Batch process
const result = processBatch({
  inputDir: './input',
  outputDir: './output',
  transformOptions: {
    splitMessages: false,
    includeMetadata: true,
    folderStructure: 'flat',
    extractTopics: true
  }
});

// Or use individually
const raw = readFileSync('./chat.md', 'utf-8');
const parsed = parseGeminiChat(raw);
const transformed = transformToObsidian(parsed, { splitMessages: true });
```

## Input Format

The processor expects Gemini chat exports with this format:

```markdown
---
title: "Chat Title"
uuid: "abc123"
exported: 2025-01-01 12:00:00
created: 2025-01-01 10:00:00
url: "https://gemini.google.com/app/abc123"
model: "2.0 Pro"
tags: ["gemini"]
messages: 5
---

# You

Your question or prompt here.

---

# Gemini

Gemini's response here.

---

# You

Follow-up question.

---

# Gemini

Another response.
```

## Output Format

### Single Note (default)

```markdown
---
title: "Chat Title"
created: 2025-01-01 10:00
exported: 2025-01-01 12:00
tags: ["gemini-export", "software-development"]
gemini_model: "2.0 Pro"
gemini_url: "https://gemini.google.com/app/abc123"
gemini_uuid: "abc123"
---

## Turn 1
**You**

Your question or prompt here.

## Turn 2
**Gemini**

Gemini's response here.
```

### Split Notes (with --split)

Each message turn becomes a separate file:
- `Chat-Title_Q1.md` - First user message
- `Chat-Title_A1.md` - First assistant response
- etc.

## CLI Options

| Option | Description |
|--------|-------------|
| `-i, --input <dir>` | Input directory containing Gemini chat exports |
| `-o, --output <dir>` | Output directory for Obsidian notes |
| `-s, --split` | Split each message turn into individual notes |
| `--no-metadata` | Exclude extended metadata from frontmatter |
| `--no-auto-tags` | Disable automatic topic extraction |
| `-r, --recursive` | Search input directory recursively |
| `-n, --dry-run` | Preview mode without writing files |
| `-v, --verbose` | Enable verbose output |
| `-f, --folder-structure` | Output folder structure: `flat`, `by-year`, `by-month`, `by-tag` |
| `-c, --config <file>` | Load configuration from JSON file |
| `-h, --help` | Show help message |

## API Reference

### processBatch(config)

Batch process multiple files.

```javascript
const result = processBatch({
  inputDir: './chats',
  outputDir: './obsidian',
  transformOptions: {
    splitMessages: false,
    includeMetadata: true,
    folderStructure: 'flat',
    extractTopics: true
  },
  recursive: false,
  dryRun: false,
  verbose: false
});
```

### parseGeminiChat(content)

Parse a Gemini chat export file.

```javascript
const parsed = parseGeminiChat(markdownContent);
// Returns: { metadata: {...}, messages: [...], originalContent: '...' }
```

### transformToObsidian(parsedChat, options)

Transform a parsed chat to Obsidian format.

```javascript
const transformed = transformToObsidian(parsed, {
  splitMessages: false,
  includeMetadata: true,
  folderStructure: 'flat',
  extractTopics: true
});
// Returns: [{ filename: '...', content: '...', metadata: {...} }]
```

## Folder Structure Options

- `flat` (default) - All notes in root output directory
- `by-year` - Organize by year (e.g., `2025/`)
- `by-month` - Organize by year/month (e.g., `2025/2025-01/`)
- `by-tag` - Organize by first detected tag

## Auto-Topic Extraction

When enabled, the processor analyzes message content and automatically adds relevant tags:

| Tag | Keywords |
|-----|----------|
| `software-development` | software, app, develop, code, programming, API |
| `machine-learning` | machine learning, AI, neural, model, training |
| `data-science` | data, analytics, statistics, visualization |
| `web-development` | web, HTML, CSS, JavaScript, React, frontend |
| `business` | business, marketing, sales, revenue, strategy |
| `nutrition` | food, nutrition, meal, diet, calories, protein |
| `research` | research, study, analysis, market, comparison |
| `recipe` | recipe, cook, ingredient, kitchen, baking |
| `travel` | travel, trip, hotel, flight, destination |
| `finance` | money, investment, stock, trading, banking |

## License

MIT
