# 🌌 Gemini Chat Export

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Markdown](https://img.shields.io/badge/Format-Markdown-blue.svg)](https://daringfireball.net/projects/markdown/)

> Ein elegantes Tool zur Sicherung, Formatierung und Verwaltung deiner Google Gemini Chat-Verläufe in sauberen Markdown-Dateien.

## ✨ Features

- **Automatischer Export**: Speichert deine Prompts und die Antworten von Gemini lokal ab.
- **Sauberes Markdown-Format**: Bereinigt redundante Textblöcke und doppelte Antworten (Auto-Cleanup) für eine perfekte Lesbarkeit.
- **Metadaten-Support**: Fügt nützliche Frontmatter-Daten (Datum, Tags, Links zum Originalchat) im YAML-Format hinzu.
- **Strukturierte Archivierung**: Sortiert und speichert Chats übersichtlich in deinem Workspace.

## 🚀 Installation

Das Projekt besteht aus zwei Hauptkomponenten: Einer Chrome-Extension für den direkten Export aus dem Browser und einem Node.js-Prozessor zur Nachbearbeitung der Daten (z. B. für Obsidian).

### 1. Chrome Extension (Für den Export)
1. Öffne deinen Chromium-basierten Browser und navigiere zu `chrome://extensions`.
2. Aktiviere den **Entwicklermodus** (Toggle oben rechts).
3. Klicke auf **"Entpackte Erweiterung laden"**.
4. Wähle den Ordner `chrome-extension/` aus diesem Repository aus.
5. Das blaue Extension-Icon erscheint nun in deiner Toolbar.

### 2. Batch-Processor (Für Formatierung & Archivierung)
1. Klone das Repository und wechsle im Terminal in den `processor` Ordner:
   ```bash
   git clone https://github.com/dein-username/GeminiChatExport.git
   cd GeminiChatExport/processor
   ```
2. Installiere die Node.js-Abhängigkeiten (Node v18+ benötigt):
   ```bash
   npm install
   ```

## 💡 Nutzung

Der Export läuft **direkt über deinen Browser** ab, ein automatisierter Export über das Terminal in den Projektordner ist nicht möglich.

### 1. Chats exportieren
1. Öffne gemini.google.com und lade den gewünschten Chat.
2. Klicke auf das Icon der installierten Extension in der Toolbar.
3. Du hast nun folgende Möglichkeiten für den Export:
   - **Alles extrahieren:** Nutze die Optionen der Extension (z. B. *Export All Visible* oder *Export Current Chat*), um die gesamte sichtbare Historie als Markdown-Datei herunterzuladen.
   - **Zusammenfassung via Prompt Injection:** Lass dir von Gemini im Chatverlauf zunächst eine prägnante Zusammenfassung erstellen und lade anschließend gezielt nur die **letzte Chatnachricht** herunter.
4. Die `.md`-Datei wird in deinen Standard-Downloadordner heruntergeladen.

### 2. Chats formatieren & aufräumen
Nutze den Batch-Processor, um die unübersichtlichen Rohdaten aus dem Download-Ordner zu bereinigen und als strukturierte Knowledge-Notes (inkl. Frontmatter, Tags) abzuspeichern:

```bash
# Trockenlauf (Nur Vorschau der Änderungen anzeigen)
node src/index.js -i ~/Downloads/gemini-exports/ -o /pfad/zu/Deinem/Obsidian_Vault/gemini/ --dry-run -v

# Reale Konvertierung in den Zielordner
node src/index.js -i ~/Downloads/gemini-exports/ -o /pfad/zu/Deinem/Obsidian_Vault/gemini/ -v
```

## 🤝 Beitragen

Beiträge sind jederzeit willkommen! Wenn du Ideen zur Verbesserung hast, erstelle gerne einen Pull Request oder öffne ein Issue für Feedback und Bug-Reports. 

1. Forke das Projekt
2. Erstelle deinen Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Committe deine Änderungen (`git commit -m 'Add some AmazingFeature'`)
4. Pushe auf den Branch (`git push origin feature/AmazingFeature`)
5. Öffne einen Pull Request

## 📄 Lizenz

Dieses Projekt steht unter der MIT-Lizenz.