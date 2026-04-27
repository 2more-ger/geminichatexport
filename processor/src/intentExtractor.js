/**
 * IntentExtractor - Parses Gemini chats and extracts intents
 * Separates organizational noise from hard knowledge transfer
 */

class IntentExtractor {
  constructor() {
    // Patterns for standalone noise (not part of substantial content)
    // Only mark as noise if the entire segment is just this pattern
    this.standaloneNoisePatterns = [
      /^(hi|hallo|hey|guten tag|good (morning|afternoon|evening))$/i,
      /^(danke|thanks|thx|danke schon|vielen dank)$/i,
      /^(kannst du|könntest du|can you|could you)$/i,
      /^(nochmal|again|bitte noch|once more)$/i,
      /^(entschuldigung|sorry|apologies|verzeihung)$/i,
      /^(ja|nein|yes|no)$/i,
      /^(ich verstehe|verstanden|i understand|got it)$/i,
      /^(korrekt|genau|super|perfekt)$/i,
      /^(abbrechen|cancel|stornieren)$/i,
    ];

    // Patterns that indicate no knowledge value regardless of length
    this.noValuePatterns = [
      /^kannst du.*nochmal/i,
      /^was meinst du/i,
      /^könntest du.*noch/i,
      /^entschuldigung.*noch/i,
    ];

    // Intent categories
    this.intentTypes = {
      CONCEPT_EXPLANATION: 'concept_explanation',
      CODE_GENERATION: 'code_generation',
      PROBLEM_SOLVING: 'problem_solving',
      TUTORIAL: 'tutorial',
      DECISION_RECORD: 'decision_record',
      REFERENCE_KNOWLEDGE: 'reference_knowledge',
      DISCUSSION: 'discussion'
    };
  }

  /**
   * Check if a segment is organizational noise
   */
  isNoise(text, speaker) {
    const trimmed = text.trim();
    
    if (!trimmed || trimmed.length < 5) {
      return true;
    }
    
    // Check if it's a standalone greeting or short response
    for (const pattern of this.standaloneNoisePatterns) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }

    // Check no-value patterns
    for (const pattern of this.noValuePatterns) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }

    // User messages that are very short (< 30 chars) are likely just instructions
    // but we should still keep them as they define the intent
    if (speaker === 'You' && trimmed.length < 30 && !trimmed.includes('.')) {
      return true;
    }

    return false;
  }

  /**
   * Classify the intent of a chat segment
   */
  classifyIntent(chatText) {
    const text = chatText.toLowerCase();

    // Code generation indicators
    if (/\b(code|function|class|script|program|implement|erstelle|schreibe)\b/.test(text) &&
        /```/.test(chatText)) {
      return this.intentTypes.CODE_GENERATION;
    }

    // Problem solving indicators
    if (/\b(fehler|error|bug|problem|issue|debug|troubleshoot|klappt nicht|funktioniert nicht)\b/.test(text)) {
      return this.intentTypes.PROBLEM_SOLVING;
    }

    // Tutorial indicators
    if (/\b(schritt|tutorial|anleitung|guide|wie man|how to|steps|step by step)\b/.test(text)) {
      return this.intentTypes.TUTORIAL;
    }

    // Decision record indicators
    if (/\b(entscheidung|decision|architecture|technologie|approach|wir werden|we will|empfehle|recommend)\b/.test(text)) {
      return this.intentTypes.DECISION_RECORD;
    }

    // Concept explanation indicators
    if (/\b(erkläre|explain|was ist|what is|konzept|concept|verstehen|understanding|bedeutet|means)\b/.test(text)) {
      return this.intentTypes.CONCEPT_EXPLANATION;
    }

    // Reference knowledge indicators
    if (/\b(definition|fakt|fact|definition|ist ein|is a|gehört zu|belongs to)\b/.test(text)) {
      return this.intentTypes.REFERENCE_KNOWLEDGE;
    }

    // Default to discussion
    return this.intentTypes.DISCUSSION;
  }

  /**
   * Extract title from chat content
   */
  extractTitle(chatContent) {
    // Try to find a title in the first user message
    const lines = chatContent.split('\n');
    for (const line of lines) {
      // Skip frontmatter and headers
      if (line.startsWith('---') || line.startsWith('#')) continue;
      
      // Clean line
      const cleaned = line.replace(/^#?\/?\/?(You|Gemini)\/?/g, '').trim();
      if (cleaned.length > 5 && cleaned.length < 100) {
        // Capitalize first letter
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
    }
    return 'Untitled Chat';
  }

  /**
   * Parse a full chat file and extract intents
   */
  parseChat(chatContent) {
    // Extract frontmatter if present
    let frontmatter = {};
    let bodyContent = chatContent;

    const fmMatch = chatContent.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      // Parse frontmatter
      const fmLines = fmMatch[1].split('\n');
      for (const line of fmLines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.substring(0, colonIdx).trim();
          let value = line.substring(colonIdx + 1).trim();
          // Remove quotes if present
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }
          frontmatter[key] = value;
        }
      }
      bodyContent = chatContent.substring(fmMatch[0].length).trim();
    }

    // Split into message segments
    const segments = this.splitIntoSegments(bodyContent);
    
    // Process segments - combine user intent with Gemini response
    // A pair of (You + Gemini) = one knowledge unit
    const knowledgeSegments = [];
    const noiseSegments = [];

    let currentKnowledgeUnit = null;

    for (const segment of segments) {
      if (segment.speaker === 'You') {
        // Save previous unit if exists
        if (currentKnowledgeUnit && currentKnowledgeUnit.content.trim()) {
          if (!this.isNoise(currentKnowledgeUnit.content, 'Gemini')) {
            knowledgeSegments.push({
              speaker: currentKnowledgeUnit.speaker,
              content: currentKnowledgeUnit.content,
              intent: this.classifyIntent(currentKnowledgeUnit.content)
            });
          } else {
            noiseSegments.push(currentKnowledgeUnit);
          }
        }
        // Start new unit with user message as context
        currentKnowledgeUnit = {
          speaker: 'You',
          userContent: segment.content,
          content: segment.content // User content sets the intent context
        };
      } else if (segment.speaker === 'Gemini' && currentKnowledgeUnit) {
        // Append Gemini response to current unit
        currentKnowledgeUnit.content += '\n\n' + segment.content;
      } else if (segment.speaker === 'Gemini') {
        // Gemini response without preceding user message
        currentKnowledgeUnit = {
          speaker: 'Gemini',
          content: segment.content
        };
      }
    }

    // Don't forget the last unit
    if (currentKnowledgeUnit && currentKnowledgeUnit.content.trim()) {
      if (!this.isNoise(currentKnowledgeUnit.content, currentKnowledgeUnit.speaker === 'You' ? 'You' : 'Gemini')) {
        knowledgeSegments.push({
          speaker: currentKnowledgeUnit.speaker,
          content: currentKnowledgeUnit.content,
          intent: this.classifyIntent(currentKnowledgeUnit.content)
        });
      } else {
        noiseSegments.push(currentKnowledgeUnit);
      }
    }

    return {
      frontmatter,
      knowledgeSegments,
      noiseSegments,
      title: frontmatter.title || this.extractTitle(bodyContent)
    };
  }

  /**
   * Split chat content into segments (user/gemini pairs)
   */
  splitIntoSegments(content) {
    const segments = [];
    const lines = content.split('\n');
    
    let currentSegment = null;
    let currentSpeaker = null;

    for (const line of lines) {
      // Detect speaker change - handle both "# You" and "#You" formats
      const speakerMatch = line.match(/^#\s*\/?(You|Gemini)/);
      
      if (speakerMatch) {
        const speaker = speakerMatch[1];
        
        // Save previous segment
        if (currentSegment && currentSegment.content.trim()) {
          segments.push({
            speaker: currentSpeaker,
            content: currentSegment.content.trim()
          });
        }
        
        currentSpeaker = speaker;
        currentSegment = { content: '' };
      } else if (currentSegment) {
        currentSegment.content += line + '\n';
      }
    }

    // Don't forget the last segment
    if (currentSegment && currentSegment.content.trim()) {
      segments.push({
        speaker: currentSpeaker,
        content: currentSegment.content.trim()
      });
    }

    return segments;
  }
}

module.exports = IntentExtractor;
