# GeminiChatExport - TODO / Anleitung

## Projektstruktur
```
GeminiChatExport/
├── chrome-extension/    # Chrome Extension für Export
├── processor/           # Node.js Batch-Processor
└── TODO.md             # Diese Datei
```

---

## 1. Chrome Extension installieren

### Voraussetzungen
- Chrome / Chromium / Brave Browser

### Installation

1. Browser öffnen → `chrome://extensions`

2. **Entwicklermodus** aktivieren (Toggle oben rechts)

3. **"Entpackte Erweiterung laden"** klicken

4. Ordner auswählen:
   ```
   /workspace/GeminiChatExport/chrome-extension/
   ```

5. Extension erscheint in der Toolbar (blaues Icon)

### Verwendung

1. Zu `https://gemini.google.com` navigieren
2. Einen Chat öffnen
3. Auf das Extension-Icon klicken
4. Buttons:
   - **Export Current Chat** → Einzelner Chat als .md
   - **Export All Visible** → Alle sichtbaren Chats als .md

### Export-Format

Die Extension erstellt Obsidian-fertige Markdown-Dateien:
```yaml
---
title: "Chat Titel"
uuid: "<v4-uuid>"
exported: "<ISO-timestamp>"
created: "<Originaldatum>"
url: "https://gemini.google.com/app/<chat-id>"
model: "<Modell>"
tags: ["gemini"]
messages: <Anzahl>
---

# You
[User-Prompt]

---

# Gemini
[Gemini-Antwort]
```

### Bekannte Limitierungen

- Chrome UI-Änderungen können Selectors brechen → dann Extension anpassen
- Läuft client-side, kein 5er-Limit wie andere Plugins
- Exportiert nur aktuell geladene Chats

---

## 2. Batch-Processor installieren & nutzen

### Voraussetzungen
- Node.js 18+ (für ES Modules)
- Gemini CLI (`/root/.local/bin/gemini`)
- Gemini API Key in `~/.gemini/.env`

### Installation

```bash
cd /workspace/GeminiChatExport/processor
npm install
```

### Konfiguration

Falls Output-Vault nicht默认值:
```bash
export OBSIDIAN_VAULT=/path/to/dein/vault
```

### Usage

```bash
# Hilfreich!
node src/index.js --help

# Dry-run (nur Vorschau, keine Dateien schreiben)
node src/index.js -i /workspace/GeminiBackup -o /tmp/output --dry-run -v

# Echt verarbeiten
node src/index.js -i /workspace/GeminiBackup -o /workspace/Obsidian_Vault/gemini/ -v
```

### Argumente

| Flag | Beschreibung | Default |
|------|-------------|---------|
| `-i, --input <dir>` | Input-Ordner mit exportierten .md Dateien | (required) |
| `-o, --output <dir>` | Output-Ordner für Obsidian Notes | `/workspace/Obsidian_Vault/gemini/` |
| `--dry-run` | Nur Vorschau, keine Dateien schreiben | false |
| `-v, --verbose` | Detaillierte Logs | false |

### Was der Processor macht

1. **Intent-Extraktion** → Noise vs. Wissen trennen
2. **AI-Refactoring** → Gemini CLI schreibt fachsprachliche Doku
3. **3-Satz-Zusammenfassung** → Obsidian Preview
4. **WikiLinks** → [[Links]] basierend auf Vault-Index
5. **MOC** → Map of Content für Themen
6. **Code-Snippets** → Isoliert mit techn. Audit
7. **Flashcards** → Cloze-Deletion für Anki
8. **Konsistenzprüfung** → Logische Fehler erkennen

### Rate Limiting

- Gemini CLI Free Tier: 60 req/min
- Processor: 1.1s Delay zwischen Calls
- **Ca. 60-90 Sekunden pro Chat** (wegen AI-Refactoring)

### Troubleshooting

**`tcsetattr: Inappropriate ioctl for device`**
→ Fix wurde bereits angewendet (TERM=dumb)

**`Gemini CLI timeout after 60s`**
→ Chat zu lang, Rate Limit getriggert, oder API-Problem
→ Einfach nochmal versuchen

**Keine WikiLinks eingefügt**
→ Vault-Index ist leer → Notes werden trotzdem geschrieben, Links kommen beim nächsten Scan

---

## Workflow: Komplett

```
1. Chrome Extension installieren (einmalig)

2. Chats in Gemini durchstöbern, exportieren:
   → .md Dateien in Input-Ordner (z.B. ~/Downloads/gemini-exports/)

3. Batch-Processor starten:
   node src/index.js \
     -i ~/Downloads/gemini-exports/ \
     -o /workspace/Obsidian_Vault/gemini/ \
     -v

4. Fertige Notes in Obsidian unter /gemini/:
   - einzelne Topics als Notes
   - MOCs unter /gemini/moc/
   - Flashcards mit #flashcard Tag
```

---

## Geplant / Offene Tasks

- [ ] Extension: Selectors updaten wenn Google UI ändert
- [ ] Processor: Parallel-Processing mit burst-Handling
- [ ] Processor: Webhook für Fertig-Benachrichtigung
- [ ] Obsidian Plugin: Direkter Import ohne Datei-Zwischenablage
- [ ] Extension: Batch-Export aller Chat-History (recursive scroll)
