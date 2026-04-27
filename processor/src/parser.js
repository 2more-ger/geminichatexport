/**
 * Parser for Gemini chat export Markdown files
 * Extracts frontmatter metadata and message content
 */

import matter from 'gray-matter';

/**
 * Parse a Gemini chat export file and extract structured data
 * @param {string} content - Raw markdown content
 * @returns {Object} Parsed Gemini chat object
 */
export function parseGeminiChat(content) {
  // Use gray-matter to parse YAML frontmatter
  const { data, content: body } = matter(content);

  // Extract metadata from frontmatter
  const metadata = {
    title: data.title || 'Untitled',
    uuid: data.uuid || '',
    exported: data.exported || new Date().toISOString(),
    created: data.created || new Date().toISOString(),
    url: data.url || '',
    model: data.model || '',
    tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []),
    messageCount: data.messages || 0
  };

  // Parse message turns from body
  const messages = parseMessages(body);

  return {
    metadata,
    messages,
    originalContent: body
  };
}

/**
 * Parse individual message turns from the Gemini chat body
 * @param {string} body - Content after frontmatter
 * @returns {Array} Array of message objects
 */
function parseMessages(body) {
  const messages = [];

  // Split by --- separator which divides message turns
  const turns = body.split(/^---$/m).filter(turn => turn.trim());

  for (const turn of turns) {
    const trimmed = turn.trim();
    if (!trimmed) continue;

    // Check if this is a "You" message or "Gemini" message
    const youMatch = trimmed.match(/^# You\s*\n([\s\S]*?)(?=\n---|$)/i);
    const geminiMatch = trimmed.match(/^# Gemini\s*\n([\s\S]*?)(?=\n---|$)/is);

    if (youMatch) {
      messages.push({
        role: 'user',
        content: cleanContent(youMatch[1])
      });
    } else if (geminiMatch) {
      messages.push({
        role: 'assistant',
        content: cleanContent(geminiMatch[1])
      });
    } else if (trimmed.startsWith('# You')) {
      // Handle case where content follows directly on next line
      const content = trimmed.replace(/^# You\s*\n?/, '').trim();
      if (content) {
        messages.push({
          role: 'user',
          content: cleanContent(content)
        });
      }
    } else if (trimmed.startsWith('# Gemini')) {
      const content = trimmed.replace(/^# Gemini\s*\n?/, '').trim();
      if (content) {
        messages.push({
          role: 'assistant',
          content: cleanContent(content)
        });
      }
    }
  }

  return messages;
}

/**
 * Clean message content by removing attachments sections and normalizing
 * @param {string} content - Raw message content
 * @returns {string} Cleaned content
 */
function cleanContent(content) {
  if (!content) return '';

  let cleaned = content;

  // Remove attachment sections
  cleaned = cleaned.replace(/## Attachments\s*\n[\s\S]*$/gi, '');

  // Remove Document source references
  cleaned = cleaned.replace(/^Source:.*$/gm, '');

  // Remove standalone URLs that appear after content
  cleaned = cleaned.replace(/\n\nhttps?:\/\/.*$/g, '');

  // Remove http://googleusercontent.com/... lines
  cleaned = cleaned.replace(/^http:\/\/googleusercontent\.com\/.*$/gm, '');

  // Remove http://googleusercontent.com/... lines that aren't standalone
  cleaned = cleaned.replace(/\nhttp:\/\/googleusercontent\.com\/.*$/g, '');

  // Clean up multiple empty lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Extract title from the first user message if not in frontmatter
 * @param {Array} messages - Array of message objects
 * @returns {string} Extracted or default title
 */
export function extractTitle(messages) {
  if (!messages || messages.length === 0) return 'Untitled Chat';

  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return 'Untitled Chat';

  // Take first 100 chars of first message as title, clean it up
  let title = firstUserMessage.content
    .replace(/\n+/g, ' ')
    .replace(/#+\s*/g, '')
    .trim()
    .substring(0, 100);

  if (title.length === 100) {
    title += '...';
  }

  return title || 'Untitled Chat';
}

/**
 * Extract topics/tags from content using keyword analysis
 * @param {Array} messages - Array of message objects
 * @returns {Array} Suggested tags
 */
export function extractTopics(messages) {
  const allContent = messages.map(m => m.content).join(' ').toLowerCase();

  const topicKeywords = {
    'software-development': ['software', 'app', 'entwickler', 'development', 'code', 'programming', 'api', 'database', 'backend', 'frontend'],
    'machine-learning': ['machine learning', 'ml', 'ai', 'neural', 'model', 'training', 'deep learning', 'nlp'],
    'data-science': ['data', 'analytics', 'statistics', 'visualization', 'pandas', 'numpy', 'jupyter'],
    'web-development': ['web', 'html', 'css', 'javascript', 'react', 'vue', 'frontend', 'backend', 'api'],
    'business': ['business', 'marketing', 'sales', 'revenue', 'strategy', 'company', 'startup'],
    'nutrition': ['food', 'nutrition', 'meal', 'diet', 'calories', 'protein', 'health'],
    'research': ['research', 'study', 'analysis', 'market', 'comparison', 'review'],
    'recipe': ['recipe', 'cook', 'ingredient', 'kitchen', 'baking', 'food'],
    'travel': ['travel', 'trip', 'hotel', 'flight', 'destination', 'vacation'],
    'finance': ['money', 'investment', 'stock', 'crypto', 'trading', 'banking', 'loan']
  };

  const suggestedTags = [];

  for (const [tag, keywords] of Object.entries(topicKeywords)) {
    const matchCount = keywords.filter(kw => allContent.includes(kw)).length;
    if (matchCount >= 2) {
      suggestedTags.push(tag);
    }
  }

  return suggestedTags;
}
