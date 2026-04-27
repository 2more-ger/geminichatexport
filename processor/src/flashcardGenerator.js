/**
 * FlashcardGenerator - Generates Anki-ready flashcards using Cloze deletion format
 */

class FlashcardGenerator {
  constructor() {
    // Patterns that indicate key concepts
    this.keyConceptPatterns = [
      /\b(ist|bezeichnet|definiert als|means|is defined as)\b.*?[.!?]/gi,
      /\b(wichtig|important|essentiell|essential|notwendig|necessary)\b.*?[.!?]/gi,
      /\b(Vorteil|Nachteil|advantage|disadvantage|pro|con)\b.*?[.!?]/gi,
      /\b(Grund|reason|because|because of)\b.*?[.!?]/gi,
      /\b(Schritt|step|Phase|phase|Process|process)\b.*?[.!?]/gi,
      /\b(Technologie|technology|Framework|framework|Tool|tool)\b.*?[.!?]/gi,
      /\b(Regel|rule|Prinzip|principle|Konzept|concept)\b.*?[.!?]/gi,
    ];
  }

  /**
   * Parse Gemini flashcard output into structured cards
   */
  parseGeminiOutput(output) {
    const cards = [];
    
    // Match cloze patterns like {c1::text} or {c1::...} - {c1::...}
    // Gemini format uses {c1::...} but we need to be careful about escaping
    
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Look for cloze patterns - {c1::...}
      const clozeMatches = line.match(/\{c1::[^}]+\}/g);
      if (clozeMatches && clozeMatches.length > 0) {
        cards.push(line.trim());
      }
    }
    
    // Fallback: if no cloze found, try to extract key sentences
    if (cards.length === 0) {
      return this.extractKeySentences(output);
    }
    
    return cards;
  }

  /**
   * Fallback: extract key sentences as flashcards
   */
  extractKeySentences(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const cards = [];
    
    for (const sentence of sentences.slice(0, 4)) {
      const trimmed = sentence.trim();
      if (trimmed.length > 30) {
        // Create cloze by hiding the key concept
        const words = trimmed.split(' ');
        if (words.length > 5) {
          // Hide middle section
          const hiddenCount = Math.max(1, Math.floor(words.length * 0.3));
          const start = Math.floor(words.length * 0.3);
          const hidden = words.slice(start, start + hiddenCount).join(' ');
          
          const cloze = `{c1::${hidden}}`;
          const card = words.slice(0, start).join(' ') + ' ' + cloze + ' ' + 
                      words.slice(start + hiddenCount).join(' ') + '.';
          cards.push(card);
        }
      }
    }
    
    return cards;
  }

  /**
   * Format flashcard for Obsidian with #flashcard tag
   */
  formatFlashcard(card, index) {
    // Ensure proper cloze format
    let formatted = card;
    
    // If no cloze marker, wrap first significant phrase
    if (!formatted.includes('{c1::')) {
      // Try to identify a key term to cloze
      formatted = `{c1::${formatted}}`;
    }
    
    return `- ${formatted}`;
  }

  /**
   * Generate flashcard section for Obsidian note
   */
  generateFlashcardSection(cards) {
    if (!cards || cards.length === 0) {
      return '';
    }
    
    let section = '\n## Flashcards\n\n';
    
    for (let i = 0; i < cards.length; i++) {
      section += this.formatFlashcard(cards[i], i + 1) + '\n';
    }
    
    section += '\n---\n*Use Obsidian-to-Anki plugin to sync*';
    
    return section;
  }

  /**
   * Extract key concepts from content for flashcard generation
   */
  extractKeyConcepts(content) {
    const concepts = [];
    
    for (const pattern of this.keyConceptPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        concepts.push(...matches);
      }
    }
    
    // Deduplicate and limit
    const unique = [...new Set(concepts)];
    return unique.slice(0, 5);
  }

  /**
   * Generate frontmatter for flashcard notes
   */
  generateFlashcardFrontmatter(tags) {
    return `tags: [${tags.join(', ')}, #flashcard]`;
  }
}

module.exports = FlashcardGenerator;
