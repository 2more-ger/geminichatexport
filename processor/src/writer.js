/**
 * Writer - Writes final Obsidian notes with proper format
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class Writer {
  constructor(options = {}) {
    this.outputDir = options.outputDir || '/workspace/Obsidian_Vault/gemini/';
  }

  /**
   * Generate UUID v4
   */
  generateUUID() {
    return crypto.randomUUID();
  }

  /**
   * Generate timestamp in ISO format
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Sanitize filename for filesystem
   */
  sanitizeFilename(name) {
    return name
      .replace(/[^a-zA-Z0-9ÄÖÜäöüß\-_\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);
  }

  /**
   * Generate YAML frontmatter
   */
  generateFrontmatter(data) {
    let fm = '---\n';
    fm += `title: "${data.title || 'Untitled'}"\n`;
    fm += `uuid: "${data.uuid || this.generateUUID()}"\n`;
    fm += `exported: "${data.exported || this.getTimestamp()}"\n`;
    
    if (data.created) {
      fm += `created: "${data.created}"\n`;
    }
    if (data.url) {
      fm += `url: "${data.url}"\n`;
    }
    if (data.model) {
      fm += `model: "${data.model}"\n`;
    }
    
    // Tags
    const tags = data.tags || ['gemini'];
    fm += `tags: [${tags.map(t => `"${t}"`).join(', ')}]\n`;
    
    fm += `type: "${data.type || 'gemini-export'}"\n`;
    
    if (data.summary) {
      fm += `summary: "${this.escapeYamlString(data.summary)}"\n`;
    }
    
    if (data.consistency_check) {
      fm += `consistency_check: "${data.consistency_check}"\n`;
    }
    
    fm += '---\n';
    
    return fm;
  }

  /**
   * Escape string for YAML
   */
  escapeYamlString(str) {
    if (!str) return '';
    // Remove newlines and escape quotes
    return str.replace(/"/g, '\\"').replace(/\n/g, ' ').trim();
  }

  /**
   * Build the complete Obsidian note
   */
  buildNote(noteData) {
    let content = this.generateFrontmatter(noteData.metadata);
    
    // Title as H1
    content += `\n# ${noteData.title}\n\n`;
    
    // Summary section at top for preview
    if (noteData.summary) {
      content += `## Summary\n`;
      content += `${noteData.summary}\n\n`;
    }
    
    // Main content
    if (noteData.content) {
      content += `## Content\n`;
      content += `${noteData.content}\n\n`;
    }
    
    // Code snippets section
    if (noteData.codeBlocks && noteData.codeBlocks.length > 0) {
      content += `## Code Snippets\n\n`;
      for (const block of noteData.codeBlocks) {
        content += block + '\n';
      }
    }
    
    // Related links
    if (noteData.relatedNotes && noteData.relatedNotes.length > 0) {
      content += `## Related\n`;
      content += noteData.relatedNotes.map(n => `- [[${n.title}]]`).join('\n');
      content += '\n\n';
    }
    
    // Flashcards
    if (noteData.flashcards && noteData.flashcards.length > 0) {
      content += `## Flashcards\n\n`;
      for (const card of noteData.flashcards) {
        content += `- ${card}\n`;
      }
      content += '\n---\n*Use Obsidian-to-Anki plugin to sync*\n\n';
    }
    
    // Footer
    content += `---\n*Exported from Gemini on ${this.getTimestamp()}*\n`;
    
    return content;
  }

  /**
   * Write note to file
   */
  async writeNote(noteData, dryRun = false) {
    const filename = this.sanitizeFilename(noteData.title) + '.md';
    const filepath = path.join(this.outputDir, filename);
    
    const content = this.buildNote(noteData);
    
    if (dryRun) {
      console.log(`[DRY RUN] Would write: ${filepath}`);
      console.log('--- Preview ---');
      console.log(content.substring(0, 500) + '...\n');
      return { success: true, path: filepath, dryRun: true };
    }
    
    try {
      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });
      
      // Write the file
      await fs.writeFile(filepath, content, 'utf-8');
      
      return { success: true, path: filepath };
    } catch (error) {
      console.error(`[Writer] Error writing ${filepath}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create MOC (Map of Content) entry
   */
  async writeMocEntry(topic, notes, dryRun = false) {
    const mocDir = path.join(this.outputDir, 'moc');
    const filename = this.sanitizeFilename(topic) + '.md';
    const filepath = path.join(mocDir, filename);
    
    let content = '---\n';
    content += `title: "MOC - ${topic}"\n`;
    content += `uuid: "${this.generateUUID()}"\n`;
    content += `tags: ["moc", "index"]\n`;
    content += `type: "map-of-content"\n`;
    content += '---\n\n';
    
    content += `# Map of Content: ${topic}\n\n`;
    content += `This MOC aggregates notes related to **${topic}**.\n\n`;
    content += `## Notes\n\n`;
    
    for (const note of notes) {
      const summary = note.summary || 'No summary available';
      content += `### [[${note.title}]]\n`;
      content += `${summary}\n\n`;
    }
    
    content += `---\n*Auto-generated MOC*\n`;
    
    if (dryRun) {
      console.log(`[DRY RUN] Would write MOC: ${filepath}`);
      return { success: true, path: filepath, dryRun: true };
    }
    
    try {
      await fs.mkdir(mocDir, { recursive: true });
      await fs.writeFile(filepath, content, 'utf-8');
      return { success: true, path: filepath };
    } catch (error) {
      console.error(`[Writer] Error writing MOC ${filepath}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Writer;
