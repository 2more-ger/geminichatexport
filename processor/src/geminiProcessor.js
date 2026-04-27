/**
 * GeminiProcessor - Handles ALL Gemini CLI calls with rate limiting + retry logic
 * Critical: Respect 60 requests/minute limit = 1.1s delay between calls
 * Supports retry with exponential backoff for transient failures
 */

const { spawn } = require('child_process');
const path = require('path');

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1500,       // Start with 1.5s (above rate limit floor)
  maxDelayMs: 30000,       // Cap at 30s
  backoffMultiplier: 2.0,  // Double delay each retry
  retryOn: ['timeout', 'rate_limit', '429', '503', 'ECONNRESET', 'ETIMEDOUT']
};

class GeminiProcessor {
  constructor(options = {}) {
    this.delayMs = options.delayMs || 1100;
    this.lastCallTime = 0;
    this.geminiPath = options.geminiPath || '/root/.local/bin/gemini';
    this.verbose = options.verbose || false;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay
   */
  getBackoffDelay(attempt) {
    const delay = this.delayMs + (RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt));
    return Math.min(delay, RETRY_CONFIG.maxDelayMs);
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(error) {
    const msg = error.message || '';
    return RETRY_CONFIG.retryOn.some(token =>
      msg.includes(token) || msg.includes('429') || msg.includes('503')
    );
  }

  /**
   * Wait until rate limit window has passed
   */
  async waitForRateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.delayMs) {
      await this.sleep(this.delayMs - elapsed);
    }
    this.lastCallTime = Date.now();
  }

  /**
   * Spawn Gemini CLI and return promise
   */
  spawnGemini(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.geminiPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TERM: 'dumb', HOME: process.env.HOME, NODE_NO_WARNINGS: '1' }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Gemini CLI exit ${code}: ${stderr.slice(-500)}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on('error', (err) => reject(err));

      // Timeout per call
      setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error('Gemini CLI timeout (60s)'));
      }, 60000);
    });
  }

  /**
   * Call Gemini CLI with rate limiting + retry logic
   * @param {string} prompt - The prompt to send
   * @param {string} systemPrompt - Optional system prompt
   * @returns {Promise<string>} - The response text
   */
  async callGemini(prompt, systemPrompt = null) {
    let lastError;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        await this.waitForRateLimit();

        const args = ['-y', '-p', prompt];
        if (systemPrompt) {
          args.push('--system-prompt', systemPrompt);
        }
        args.push('--output-format', 'text');

        const stdout = await this.spawnGemini(args);
        return stdout.trim();

      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === RETRY_CONFIG.maxRetries;

        if (isLastAttempt || !this.isRetryableError(error)) {
          if (this.verbose) {
            console.warn(`[GeminiProcessor] Non-retryable error: ${error.message}`);
          }
          throw error;
        }

        const backoff = this.getBackoffDelay(attempt);
        if (this.verbose) {
          console.warn(`[GeminiProcessor] Attempt ${attempt + 1} failed: ${error.message}`);
          console.warn(`[GeminiProcessor] Retrying in ${Math.round(backoff)}ms...`);
        }
        await this.sleep(backoff);
      }
    }

    throw lastError;
  }

  /**
   * Call Gemini with a pre-constructed prompt string
   */
  async _call(prompt) {
    return this.callGemini(prompt);
  }

  /**
   * Generate a 3-sentence summary for preview
   */
  async generateSummary(chatContent) {
    const prompt = `Du fasst den folgenden Chat in genau 3 Sätzen zusammen.
Die Summary soll: (1) das Hauptthema benennen, (2) die Kernerkenntnis/Lösung nennen,
und (3) den Kontext/Usecase skizzieren.
Antworte NUR mit den 3 Sätzen, nichts anderes.

CHAT:
${chatContent}`;

    return this.callGemini(prompt);
  }

  /**
   * Refactor chat into precise technical documentation
   */
  async refactorContent(chatContent, intent) {
    const intentContext = {
      concept_explanation: 'Erkläre das Konzept präzise und strukturiert.',
      code_generation: 'Präsentiere den Code mit Kommentaren und Erklärungen.',
      problem_solving: 'Beschreibe das Problem und die gefundene Lösung.',
      tutorial: 'Strukturiere als Schritt-für-Schritt-Anleitung.',
      decision_record: 'Dokumentiere die Entscheidung mit Begründung.',
      reference_knowledge: 'Gib eine klare Referenzdefinition.',
      discussion: 'Fasse die Diskussion zusammen und extrahiere Kernaussagen.'
    };

    const contextHint = intentContext[intent] || 'Strukturiere als technische Dokumentation.';

    const prompt = `Du bist ein technischer Redakteur. Schreibe den folgenden Gemini-Chat als
präzise, fachsprachliche Dokumentation um. ${contextHint}

Regeln:
- KEINE Dialog-Historie ("Du:", "Ich:", "Gemini:")
- Entferne organisatorisches Rauschen (Korrekturen, Danke, Smalltalk)
- Strukturiere als technische Dokumentation mit Überschriften
- Behalte Fakten, Erklärungen, Code und Entscheidungen
- Baue [[WikiLinks]] ein wo thematisch passend (nur {Begriff} in geschweiften Klammern markieren)
- Verwende Fachbegriffe korrekt und konsistent

CHAT:
${chatContent}`;

    return this.callGemini(prompt);
  }

  /**
   * Generate flashcard Q&A pairs in Cloze format
   */
  async generateFlashcards(chatContent) {
    const prompt = `Erstelle 2-4 Anki-Cloze-Deletion-Karten aus dem folgenden Chat.
Format: {c1::Text} für Clozes.
Jede Karte behandelt eine KEY-ERKENNTNIS oder FAKT.
Antworte mit den Karten im Format:
- {c1::...} - {c1::...}
Nichts anderes.

CHAT:
${chatContent}`;

    return this.callGemini(prompt);
  }

  /**
   * Check for logical inconsistencies
   */
  async checkConsistency(chatContent) {
    const prompt = `Prüfe den folgenden Chat auf logische Inkonsistenzen, Widersprüche oder
Fehler in den Erklärungen.
Antworte mit:
PASS: keine Probleme gefunden
WARN: <Beschreibung der Inkonsistenz>
FAIL: <Beschreibung des Fehlers>

CHAT:
${chatContent}`;

    return this.callGemini(prompt);
  }

  /**
   * Extract topics from content
   */
  async extractTopics(chatContent) {
    const prompt = `Extrahiere die wichtigsten 3-5 Topics/Themen aus folgendem Chat.
Antworte NUR mit einer komma-getrennten Liste der Topics.
Verwende deutsche Begriffe.

CHAT:
${chatContent}`;

    return this.callGemini(prompt);
  }

  /**
   * Generate contextual WikiLink suggestions based on content
   */
  async suggestWikiLinks(content) {
    const prompt = `Analysiere den folgenden Text und schlage 3-5 Begriffe vor,
die als [[WikiLinks]] eingefügt werden sollten.
Antworte NUR mit einer komma-getrennten Liste von Begriffen.
Nur Begriffe, die im Text erwähnt werden oder thematisch eng damit zusammenhängen.

TEXT:
${content}`;

    return this.callGemini(prompt);
  }
}

module.exports = GeminiProcessor;
