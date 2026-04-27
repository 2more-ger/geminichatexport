/**
 * ObsidianLinker - Handles [[WikiLinks]] and MOC management
 */

const fs = require('fs').promises;
const path = require('path');

class ObsidianLinker {
  constructor(vaultPath) {
    this.vaultPath = vaultPath;
    this.index = null;
    this.aliasMap = new Map();
    this.titleMap = new Map();
  }

  /**
   * Build index of all existing notes and their titles/aliases
   */
  async buildIndex() {
    this.index = [];
    this.aliasMap.clear();
    this.titleMap.clear();

    try {
      const files = await fs.readdir(this.vaultPath, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.md')) {
          const filePath = path.join(this.vaultPath, file.name);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const title = this.extractTitle(content) || file.name.replace('.md', '');
            
            this.index.push({
              path: filePath,
              name: file.name,
              title: title
            });
            
            this.titleMap.set(title.toLowerCase(), { path: filePath, title });
            
            // Check for aliases in frontmatter
            const aliases = this.extractAliases(content);
            for (const alias of aliases) {
              this.aliasMap.set(alias.toLowerCase(), { path: filePath, title });
            }
          } catch (e) {
            // Skip files we can't read
          }
        }
      }
      
      console.log(`[ObsidianLinker] Indexed ${this.index.length} notes`);
    } catch (e) {
      console.warn(`[ObsidianLinker] Could not scan vault: ${e.message}`);
      this.index = [];
    }
  }

  /**
   * Extract title from content
   */
  extractTitle(content) {
    // Try frontmatter title first
    const fmMatch = content.match(/^title:\s*["']?([^"'\n]+)["']?/m);
    if (fmMatch) {
      return fmMatch[1].trim();
    }
    
    // Try first H1
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }
    
    return null;
  }

  /**
   * Extract aliases from frontmatter
   */
  extractAliases(content) {
    const aliases = [];
    const aliasMatch = content.match(/^aliases:\s*\[(.*?)\]/m);
    if (aliasMatch) {
      const aliasContent = aliasMatch[1];
      const matches = aliasContent.match(/"([^"]+)"/g);
      if (matches) {
        for (const m of matches) {
          aliases.push(m.replace(/"/g, ''));
        }
      }
    }
    return aliases;
  }

  /**
   * Find related notes based on topic
   */
  findRelatedNotes(topic, limit = 5) {
    if (!this.index) return [];
    
    const topicLower = topic.toLowerCase();
    const scores = [];
    
    for (const note of this.index) {
      let score = 0;
      
      // Exact title match
      if (note.title.toLowerCase().includes(topicLower)) {
        score += 10;
      }
      
      // Alias match
      const aliasEntry = this.aliasMap.get(topicLower);
      if (aliasEntry && aliasEntry.path === note.path) {
        score += 8;
      }
      
      // Partial match in title
      const words = topicLower.split(/\s+/);
      for (const word of words) {
        if (word.length > 2 && note.title.toLowerCase().includes(word)) {
          score += 3;
        }
      }
      
      if (score > 0) {
        scores.push({ note, score });
      }
    }
    
    // Sort by score and return top results
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit).map(s => s.note);
  }

  /**
   * Insert [[WikiLinks]] where relevant in content
   */
  insertLinks(content, topics = []) {
    let result = content;
    
    // For each topic, find related notes and add links
    for (const topic of topics) {
      const related = this.findRelatedNotes(topic, 3);
      
      for (const note of related) {
        // Create wiki link
        const wikiLink = `[[${note.title}]]`;
        
        // Only add if not already present
        if (!result.includes(wikiLink)) {
          // Add at end of relevant paragraph or as a new line
          // This is a simple implementation - could be smarter
          const linkMarker = `\n// Related: ${wikiLink}`;
          if (!result.includes(linkMarker)) {
            result += `\n\n${linkMarker}`;
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Get all known topics/titles for linking
   */
  getKnownTopics() {
    if (!this.index) return [];
    return this.index.map(n => n.title);
  }
}

module.exports = ObsidianLinker;
