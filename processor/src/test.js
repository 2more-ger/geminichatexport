/**
 * Test file for Gemini Chat to Obsidian processor
 */

import { parseGeminiChat, extractTitle, extractTopics } from './parser.js';
import { transformToObsidian, getFolderPath } from './transformer.js';

// Sample Gemini chat export
const sampleChat = `---
title: "Tiefkühlmahlzeiten Vergleich"
uuid: "5f712b710c7aa958"
exported: 2025-09-23 14:30:00
created: 2025-09-23 12:00:00
url: "https://gemini.google.com/app/5f712b710c7aa958"
model: "2.5 Pro"
tags: ["gemini", "nutrition"]
messages: 2
---

# You

Recherchiere bitte welche anbieter von Tiefkühl mahlzeiten am preiswertesten ist.

---

# Gemini

Hier ist meine Recherche zu Tiefkühlmahlzeiten-Anbietern.

Die Top-Anbieter sind:
- Frosta
- Rewe Beste Wahl
- Aldi

| Anbieter | Preis pro 100g |
|----------|----------------|
| Frosta | 0,96 € |
| Rewe | 0,85 € |

Fazit: Aldi und Rewe sind am preiswertesten.

---

# You

Erweitere das bitte um den Anbieter Juit.

---

# Gemini

Juit ist ein Premium-Anbieter mit folgenden Merkmalen:
- Kein Abo-Modell
- Regionale Zutaten
- Handwerkliche Zubereitung

Preis: ca. 8-10 € pro Gericht.
`;

console.log('=== Testing Gemini Chat Parser ===\n');

// Test parsing
console.log('1. Testing parseGeminiChat()...');
const parsed = parseGeminiChat(sampleChat);
console.log('   Metadata:', JSON.stringify(parsed.metadata, null, 2));
console.log('   Message count:', parsed.messages.length);
console.log('   First message role:', parsed.messages[0].role);
console.log('   First message preview:', parsed.messages[0].content.substring(0, 50) + '...');

// Test title extraction
console.log('\n2. Testing extractTitle()...');
const title = extractTitle(parsed.messages);
console.log('   Extracted title:', title);

// Test topic extraction
console.log('\n3. Testing extractTopics()...');
const topics = extractTopics(parsed.messages);
console.log('   Extracted topics:', topics);

// Test transformation
console.log('\n=== Testing Obsidian Transformer ===\n');

console.log('4. Testing transformToObsidian() - single note...');
const single = transformToObsidian(parsed, { splitMessages: false });
console.log('   Filename:', single[0].filename);
console.log('   Content preview:', single[0].content.substring(0, 200) + '...');

console.log('\n5. Testing transformToObsidian() - split notes...');
const split = transformToObsidian(parsed, { splitMessages: true });
console.log('   Number of notes:', split.length);
split.forEach((note, i) => {
  console.log(`   Note ${i+1}:`, note.filename);
});

console.log('\n6. Testing getFolderPath()...');
console.log('   flat:', getFolderPath(parsed.metadata, 'flat'));
console.log('   by-year:', getFolderPath(parsed.metadata, 'by-year'));
console.log('   by-month:', getFolderPath(parsed.metadata, 'by-month'));
console.log('   by-tag:', getFolderPath(parsed.metadata, 'by-tag'));

// Test with real file content
console.log('\n=== Testing with Real File Content ===\n');

import { readFileSync } from 'fs';

try {
  const realContent = readFileSync('/workspace/GeminiBackup/2025-01-02-Journal-App-Entwicklungsplan.md', 'utf-8');
  const realParsed = parseGeminiChat(realContent);

  console.log('7. Parsed real file:');
  console.log('   Title:', realParsed.metadata.title);
  console.log('   UUID:', realParsed.metadata.uuid);
  console.log('   Messages:', realParsed.messages.length);
  console.log('   First user message:', realParsed.messages[0].content.substring(0, 80) + '...');

  const realTransformed = transformToObsidian(realParsed);
  console.log('\n8. Transformed to Obsidian:');
  console.log('   Filename:', realTransformed[0].filename);
  console.log('   Content length:', realTransformed[0].content.length, 'chars');

} catch (e) {
  console.log('   (Real file test skipped or error:', e.message, ')');
}

console.log('\n=== All Tests Complete ===');
