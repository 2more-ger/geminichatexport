/**
 * MOCManager - Manages Map of Content files for Obsidian
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class MOCManager {
  constructor(vaultPath) {
    this.vaultPath = vaultPath;
    this.mocDir = path.join(vaultPath, 'moc');
    this.mocs = new Map(); // topic -> { path, notes[] }
  }

  async initialize() {
    try {
      await fs.mkdir(this.mocDir, { recursive: true });
      await this.scanExistingMOCs();
    } catch (e) {
      console.warn(`[MOCManager] Init warning: ${e.message}`);
    }
  }

  async scanExistingMOCs() {
    try {
      const files = await fs.readdir(this.mocDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = await fs.readFile(path.join(this.mocDir, file), 'utf-8');
          const topic = file.replace('.md', '').replace(/^MOC - /, '');
          this.mocs.set(topic, {
            path: path.join(this.mocDir, file),
            notes: this.extractNotesFromMOC(content)
          });
        }
      }
    } catch (e) {
      // MOC dir might not exist yet, that's ok
    }
  }

  extractNotesFromMOC(content) {
    const notes = [];
    // Look for [[Note Title]] patterns
    const matches = content.match(/\[\[([^\]]+)\]\]/g);
    if (matches) {
      for (const match of matches) {
        const title = match.replace(/[\[\]]/g, '');
        notes.push({ title, linked: true });
      }
    }
    return notes;
  }

  generateUUID() {
    return crypto.randomUUID();
  }

  async updateMOCForTopic(topic, newNotes, summary = '') {
    const sanitizedTopic = this.sanitizeTopic(topic);
    const mocPath = path.join(this.mocDir, `MOC - ${sanitizedTopic}.md`);
    
    // Get existing notes for this MOC
    let existingNotes = [];
    if (this.mocs.has(sanitizedTopic)) {
      existingNotes = this.mocs.get(sanitizedTopic).notes;
    }
    
    // Merge new notes (avoid duplicates)
    const noteTitles = new Set(existingNotes.map(n => n.title));
    for (const note of newNotes) {
      if (!noteTitles.has(note.title)) {
        existingNotes.push({ title: note.title, summary: note.summary || '' });
        noteTitles.add(note.title);
      }
    }
    
    // Generate MOC content
    let content = '---\n';
    content += `title: "MOC - ${sanitizedTopic}"\n`;
    content += `uuid: "${this.generateUUID()}"\n`;
    content += `tags: ["moc", "${sanitizedTopic}"]\n`;
    content += `type: "map-of-content"\n`;
    content += '---\n\n';
    
    content += `# Map of Content: ${sanitizedTopic}\n\n`;
    
    if (summary) {
      content += `> ${summary}\n\n`;
    }
    
    content += `This MOC aggregates ${existingNotes.length} note(s) related to **${sanitizedTopic}**.\n\n`;
    content += `## Notes\n\n`;
    
    for (const note of existingNotes) {
      content += `### [[${note.title}]]\n`;
      if (note.summary) {
        content += `${note.summary}\n\n`;
      }
    }
    
    content += `---\n*Auto-generated MOC on ${new Date().toISOString()}*\n`;
    
    // Write MOC
    await fs.writeFile(mocPath, content, 'utf-8');
    
    // Update cache
    this.mocs.set(sanitizedTopic, {
      path: mocPath,
      notes: existingNotes
    });
    
    return { success: true, path: mocPath, noteCount: existingNotes.length };
  }

  async addNoteToMOCs(noteTitle, topics, summary = '') {
    const results = [];
    for (const topic of topics) {
      const result = await this.updateMOCForTopic(topic, [{ title: noteTitle, summary }]);
      results.push(result);
    }
    return results;
  }

  sanitizeTopic(topic) {
    return topic
      .replace(/[^a-zA-Z0-9ÄÖÜäöüß\-_\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  async getMOCForTopic(topic) {
    const sanitized = this.sanitizeTopic(topic);
    return this.mocs.get(sanitized) || null;
  }

  async listMOCs() {
    return Array.from(this.mocs.entries()).map(([topic, data]) => ({
      topic,
      path: data.path,
      noteCount: data.notes.length
    }));
  }
}

module.exports = MOCManager;
