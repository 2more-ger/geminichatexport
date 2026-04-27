/**
 * Transformer: Convert parsed Gemini chats to Obsidian-ready format
 */

import { extractTitle, extractTopics } from './parser.js';

/**
 * Options for Obsidian transformation
 * @typedef {Object} ObsidianTransformOptions
 * @property {boolean} splitMessages - Split into individual notes per message turn
 * @property {boolean} includeMetadata - Include full metadata in frontmatter
 * @property {string} folderStructure - 'flat', 'by-year', 'by-month', 'by-tag'
 * @property {boolean} extractTopics - Auto-extract and add topic tags
 */

/**
 * Default transformation options
 */
export const DEFAULT_OPTIONS = {
  splitMessages: false,
  includeMetadata: true,
  folderStructure: 'flat',
  extractTopics: true,
  outputExtension: '.md'
};

/**
 * Transform a parsed Gemini chat to Obsidian format
 * @param {Object} parsedChat - Output from parser.parseGeminiChat()
 * @param {ObsidianTransformOptions} options - Transformation options
 * @returns {Array} Array of {filename, content, metadata} objects
 */
export function transformToObsidian(parsedChat, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { metadata, messages } = parsedChat;

  // Generate title if not present
  const title = metadata.title !== 'Untitled'
    ? metadata.title
    : extractTitle(messages);

  // Extract topics if enabled
  let additionalTags = [];
  if (opts.extractTopics) {
    additionalTags = extractTopics(messages);
  }

  // Build Obsidian frontmatter
  const frontmatter = buildObsidianFrontmatter(metadata, {
    ...opts,
    additionalTags
  });

  if (opts.splitMessages) {
    return transformSplitNotes(title, messages, frontmatter, metadata, opts);
  } else {
    return [transformSingleNote(title, messages, frontmatter, metadata, opts)];
  }
}

/**
 * Build Obsidian-compatible YAML frontmatter
 */
function buildObsidianFrontmatter(metadata, options) {
  const { additionalTags = [] } = options;

  // Convert dates to Obsidian-friendly format
  const createdDate = formatObsidianDate(metadata.created);
  const exportedDate = formatObsidianDate(metadata.exported);

  // Combine original tags with auto-extracted ones
  const allTags = [
    ...metadata.tags.filter(t => t !== 'gemini'),
    'gemini-export',
    ...additionalTags
  ].filter((v, i, a) => a.indexOf(v) === i); // unique

  const frontmatter = {
    title: metadata.title || 'Untitled',
    created: createdDate,
    exported: exportedDate,
    tags: allTags.length > 0 ? allTags : ['gemini-export']
  };

  if (options.includeMetadata) {
    frontmatter.gemini_model = metadata.model || '';
    frontmatter.gemini_url = metadata.url || '';
    frontmatter.gemini_uuid = metadata.uuid || '';
  }

  // Build YAML string manually for better control
  let yaml = '---\n';
  yaml += `title: "${escapeYamlString(frontmatter.title)}"\n`;
  yaml += `created: ${frontmatter.created}\n`;
  yaml += `exported: ${frontmatter.exported}\n`;
  yaml += `tags: [${frontmatter.tags.map(t => `"${t}"`).join(', ')}]\n`;

  if (options.includeMetadata) {
    if (frontmatter.gemini_model) yaml += `gemini_model: "${frontmatter.gemini_model}"\n`;
    if (frontmatter.gemini_url) yaml += `gemini_url: "${frontmatter.gemini_url}"\n`;
    if (frontmatter.gemini_uuid) yaml += `gemini_uuid: "${frontmatter.gemini_uuid}"\n`;
  }

  yaml += '---\n\n';

  return yaml;
}

/**
 * Transform to a single consolidated note
 */
function transformSingleNote(title, messages, frontmatter, metadata, options) {
  const content = buildConversationContent(messages, options);

  return {
    filename: sanitizeFilename(title) + options.outputExtension,
    content: frontmatter + content,
    metadata: {
      title,
      messageCount: messages.length,
      ...metadata
    }
  };
}

/**
 * Transform to multiple individual notes (one per message turn)
 */
function transformSplitNotes(title, messages, frontmatter, metadata, options) {
  const notes = [];

  messages.forEach((msg, index) => {
    const turnNumber = index + 1;
    const roleLabel = msg.role === 'user' ? 'Q' : 'A';
    const turnTitle = `${title} (${roleLabel}${turnNumber})`;

    // Per-message frontmatter (lighter)
    const perMessageFrontmatter = buildPerMessageFrontmatter(
      turnTitle,
      msg,
      metadata,
      { turnNumber, totalTurns: messages.length, ...options }
    );

    const content = perMessageFrontmatter +
      `# ${msg.role === 'user' ? 'Question' : 'Response'}\n\n` +
      msg.content + '\n';

    notes.push({
      filename: `${sanitizeFilename(title)}_${roleLabel}${turnNumber}${options.outputExtension}`,
      content,
      metadata: {
        title: turnTitle,
        role: msg.role,
        turnNumber,
        totalTurns: messages.length,
        originalDate: metadata.created
      }
    });
  });

  return notes;
}

/**
 * Build lighter frontmatter for split notes
 */
function buildPerMessageFrontmatter(title, message, metadata, options) {
  const createdDate = formatObsidianDate(metadata.created);
  const tags = ['gemini-export', message.role === 'user' ? 'gemini-question' : 'gemini-response'];

  let yaml = '---\n';
  yaml += `title: "${escapeYamlString(title)}"\n`;
  yaml += `created: ${createdDate}\n`;
  yaml += `tags: [${tags.map(t => `"${t}"`).join(', ')}]\n`;
  yaml += `gemini_turn: ${options.turnNumber}/${options.totalTurns}\n`;
  yaml += `gemini_uuid: "${metadata.uuid || ''}"\n`;
  yaml += '---\n\n';

  return yaml;
}

/**
 * Build conversation content with formatted messages
 */
function buildConversationContent(messages, options) {
  let content = '';

  messages.forEach((msg, index) => {
    const turnNumber = index + 1;

    content += `## Turn ${turnNumber}\n`;
    content += `**${msg.role === 'user' ? 'You' : 'Gemini'}**\n\n`;
    content += msg.content + '\n\n';
  });

  return content;
}

/**
 * Format date for Obsidian (YYYY-MM-DD HH:mm)
 */
function formatObsidianDate(dateString) {
  if (!dateString) return new Date().toISOString().slice(0, 16).replace('T', ' ');

  try {
    const date = new Date(dateString);
    return date.toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * Sanitize filename for filesystem
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 200);
}

/**
 * Escape special characters in YAML strings
 */
function escapeYamlString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Get folder path based on folder structure option
 * @param {Object} metadata - Chat metadata
 * @param {string} structure - Folder structure type
 * @returns {string} Folder path
 */
export function getFolderPath(metadata, structure = 'flat') {
  const createdDate = new Date(metadata.created || metadata.exported);

  switch (structure) {
    case 'by-year':
      return `${createdDate.getFullYear()}`;

    case 'by-month':
      const year = createdDate.getFullYear();
      const month = String(createdDate.getMonth() + 1).padStart(2, '0');
      return `${year}/${year}-${month}`;

    case 'by-tag':
      const tags = metadata.tags || [];
      return tags[0] || 'untagged';

    case 'flat':
    default:
      return '';
  }
}
