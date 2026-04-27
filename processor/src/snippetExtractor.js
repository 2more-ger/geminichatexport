/**
 * SnippetExtractor - Isolates code snippets and runs technical audit
 */

class SnippetExtractor {
  constructor() {
    // Common language patterns
    this.languageMap = {
      'javascript': ['javascript', 'js', 'node'],
      'typescript': ['typescript', 'ts'],
      'python': ['python', 'py'],
      'java': ['java'],
      'csharp': ['csharp', 'c#', '.cs'],
      'cpp': ['cpp', 'c++', 'cplusplus'],
      'go': ['go', 'golang'],
      'rust': ['rust'],
      'html': ['html', 'html5'],
      'css': ['css', 'stylesheet'],
      'sql': ['sql', 'mysql', 'postgresql'],
      'bash': ['bash', 'shell', 'sh', 'zsh'],
      'json': ['json'],
      'yaml': ['yaml', 'yml'],
      'markdown': ['markdown', 'md'],
      'dockerfile': ['dockerfile', 'docker'],
      'jsx': ['jsx', 'react'],
      'tsx': ['tsx', 'react'],
    };
  }

  /**
   * Detect language from code block header
   */
  detectLanguage(header) {
    if (!header) return 'text';
    
    const lower = header.toLowerCase();
    
    for (const [lang, keywords] of Object.entries(this.languageMap)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          return lang;
        }
      }
    }
    
    return 'text';
  }

  /**
   * Extract all code blocks from content
   */
  extractCodeBlocks(content) {
    const blocks = [];
    // Match ```language\ncode\n``` patterns
    const regex = /```(\"*[^\n]*\"*)\n([\r\n]*[\\S[\r\n]*]*?)```/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      const header = match[1].trim();
      const code = match[2];
      const language = this.detectLanguage(header);
      
      blocks.push({
        language,
        header,
        code: code.trim(),
        complexity: this.estimateComplexity(code, language),
        dependencies: this.extractDependencies(code, language),
        caveats: this.extractCaveats(code, language)
      });
    }
    
    return blocks;
  }

  /**
   * Estimate code complexity
   */
  estimateComplexity(code, language) {
    let score = 1; // base complexity
    
    // Count lines
    const lines = code.split('\n').length;
    if (lines > 50) score++;
    if (lines > 100) score++;
    
    // Count function/class definitions
    const funcPatterns = [
      /\bfunction\b/, /\basync\b/, /\bclass\b/, /\bdef\b/,
      /\bconst\b.*=\b.*=>/, /\blet\b.*=.*=>/,
      /^\//, /^\/\//, /^\/\/\//, /^\/\/\b/
    ];
    
    let definitions = 0;
    for (const pattern of funcPatterns) {
      definitions += (code.match(pattern) || []).length;
    }
    if (definitions > 5) score++;
    if (definitions > 10) score++;
    
    // Nesting depth
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of code) {
      if (char === '{' || char === '(' || char === '[') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}' || char === ')' || char === ']') {
        currentDepth--;
      }
    }
    if (maxDepth > 4) score++;
    if (maxDepth > 7) score++;
    
    return Math.min(score, 5);
  }

  /**
   * Extract dependencies from code
   */
  extractDependencies(code, language) {
    const deps = [];
    
    switch (language) {
      case 'javascript':
      case 'typescript':
        // Extract import/require statements
        const importMatches = code.match(/(?:import|require)\b[^;]*/g);
        if (importMatches) {
          for (const match of importMatches) {
            // Extract module names
            const moduleMatch = match.match(/['\"]([^'\"]+)['\"]/);
            if (moduleMatch) {
              deps.push(moduleMatch[1]);
            }
          }
        }
        break;
        
      case 'python':
        // Extract imports
        const pyImportMatches = code.match(/^(?:import|from)\b.+$/gm);
        if (pyImportMatches) {
          for (const match of pyImportMatches) {
            const parts = match.split(' ');
            if (parts[0] === 'import' && parts[1]) {
              deps.push(parts[1]);
            } else if (parts[0] === 'from') {
              deps.push(parts[1]);
            }
          }
        }
        break;
        
      case 'sql':
        // Extract table references
        const tables = code.match(/\bFROM\b|\bJOIN\b/gi);
        if (tables) {
          deps.push(`Tables referenced: ${tables.length}`);
        }
        break;
    }
    
    return deps;
  }

  /**
   * Extract caveats or notes about the code
   */
  extractCaveats(code, language) {
    const caveats = [];
    
    // Check for TODO/FIXME/HACK comments
    const comments = code.match(/\/\/\/?.*(?:TODO|FIXME|HACK|XXX)/gi);
    if (comments) {
      caveats.push(...comments.map(c => c.trim()));
    }
    
    // Check for hardcoded values
    if (/password|api[_-]?key|secret|token/i.test(code)) {
      caveats.push('Contains potential secrets - verify before committing');
    }
    
    // Check for console.log/debug
    if (/console\/(log|debug|info)/.test(code) && language === 'javascript') {
      caveats.push('Contains debug output - remove before production');
    }
    
    // Check for deprecated patterns
    if (/var\b/.test(code) && language === 'javascript') {
      caveats.push('Uses var - consider modern let/const');
    }
    
    // Check for inline styles (HTML)
    if (/\bstyle\b.*=/.test(code) && language === 'html') {
      caveats.push('Inline styles detected - consider CSS classes');
    }
    
    return caveats;
  }

  /**
   * Format code block for Obsidian with technical audit
   */
  formatCodeBlock(block) {
    let result = '';
    
    // Add language and complexity indicator
    const complexityEmoji = ['🟢', '🟡', '🟠', '🔴', '⚫'][block.complexity - 1] || '🟡';
    result += `// ${complexityEmoji} Complexity: ${block.complexity}/5 | Language: ${block.language}\n`;
    
    // Add dependencies if found
    if (block.dependencies.length > 0) {
      result += `// Dependencies: ${block.dependencies.join(', ')}\n`;
    }
    
    // Add caveats if found
    for (const caveat of block.caveats) {
      result += `// ⚠️ ${caveat}\n`;
    }
    
    // Add the actual code
    result += '```' + block.language + '\n';
    result += block.code + '\n';
    result += '```\n';
    
    return result;
  }

  /**
   * Process entire content and extract formatted code blocks
   */
  process(content) {
    const blocks = this.extractCodeBlocks(content);
    
    if (blocks.length === 0) {
      return {
        hasCode: false,
        formattedBlocks: [],
        summary: ''
      };
    }
    
    const formattedBlocks = blocks.map(b => this.formatCodeBlock(b));
    
    const summary = blocks.length === 1 
      ? `1 code snippet (${blocks[0].language})`
      : `${blocks.length} code snippets (${[...new Set(blocks.map(b => b.language))].join(', ')})`;
    
    return {
      hasCode: true,
      blocks,
      formattedBlocks,
      summary
    };
  }
}

module.exports = SnippetExtractor;
