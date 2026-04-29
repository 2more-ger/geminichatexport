// Popup script for Gemini Chat Export
// Since content_scripts is declared in manifest.json, content.js
// is always loaded in Gemini tabs — chrome.tabs.sendMessage works reliably.

document.addEventListener('DOMContentLoaded', () => {
    const exportCurrentBtn = document.getElementById('exportCurrent');
    const exportAllBtn = document.getElementById('exportAll');
    const downloadOptimizedBtn = document.getElementById('downloadOptimized');
    const statusEl = document.getElementById('status');
    const progressEl = document.getElementById('progress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    // --- UI helpers ---

    function showStatus(message, isError = false) {
        statusEl.textContent = message;
        statusEl.classList.remove('hidden', 'error');
        if (isError) statusEl.classList.add('error');
        setTimeout(() => statusEl.classList.add('hidden'), 5000);
    }

    function showProgress(current, total) {
        progressEl.classList.remove('hidden');
        progressFill.style.width = ((current / total) * 100) + '%';
        progressText.textContent = `${current} / ${total}`;
    }

    function hideProgress() {
        progressEl.classList.add('hidden');
    }

    // --- Util ---

    function slugify(text) {
        return (text || '').toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-').trim();
    }

    function generateMarkdown(cd) {
        let md = '---\n';
        md += `title: "${cd.title || 'Untitled Chat'}"\n`;
        md += `uuid: "${cd.uuid || crypto.randomUUID()}"\n`;
        md += `exported: ${cd.exported || new Date().toISOString()}\n`;
        md += `created: ${cd.created || new Date().toISOString()}\n`;
        md += `url: "https://gemini.google.com/app/${cd.chatId || 'unknown'}"\n`;
        if (cd.model) md += `model: "${cd.model}"\n`;
        md += `tags: ["gemini"]\n`;
        md += `messages: ${cd.messageCount || 0}\n`;
        md += '---\n\n';
        (cd.messages || []).forEach((msg, i) => {
            md += `# ${msg.role}\n\n${msg.content}\n\n`;
            if (i < cd.messages.length - 1) md += '---\n\n';
        });
        return md;
    }

    function generateFilename(cd) {
        const date = new Date().toISOString().split('T')[0];
        return `${date}-${slugify(cd.title || 'Untitled Chat')}.md`;
    }

    async function downloadMarkdown(markdown, filename) {
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        await chrome.downloads.download({ url, filename, saveAs: true });
        URL.revokeObjectURL(url);
    }

    // --- Send message to content script with retry ---

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    async function sendToTab(action, retries = 3) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url || !tab.url.includes('gemini.google.com')) {
            showStatus('Please navigate to a Gemini chat first', true);
            return null;
        }

        for (let i = 0; i < retries; i++) {
            try {
                return await chrome.tabs.sendMessage(tab.id, action);
            } catch (err) {
                const msg = (err.message || err.toString() || '');
                const isConnErr = msg.includes('Receiving end does not exist') ||
                                  msg.includes('Could not establish connection');

                if (isConnErr) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ['content.js']
                        });
                        await sleep(200);
                        return await chrome.tabs.sendMessage(tab.id, action);
                    } catch (injectErr) {
                        if (i >= retries - 1) throw new Error('Content Script fehlt. Bitte F5 drücken.');
                    }
                } else if (i >= retries - 1) {
                    throw err;
                }

                // Content script might not be ready yet — short wait
                await sleep(300);
            }
        }
    }

    // --- Handler ---

    exportCurrentBtn.addEventListener('click', async () => {
        exportCurrentBtn.disabled = true;
        exportCurrentBtn.textContent = 'Extracting...';

        try {
            const response = await sendToTab({ action: 'extractChat' });
            if (!response || !response.success || !response.data) {
                throw new Error('No chat data received from page');
            }

            const cd = response.data.chatData;
            cd.title = cd.title || 'Untitled Chat';
            cd.uuid = cd.uuid || crypto.randomUUID();

            const md = generateMarkdown(cd);
            const fn = generateFilename(cd);
            await downloadMarkdown(md, fn);
            showStatus(`Exported: ${cd.title}`);
        } catch (err) {
            console.error(err);
            showStatus('Export error: ' + err.message, true);
        } finally {
            exportCurrentBtn.disabled = false;
            exportCurrentBtn.textContent = 'Export Current Chat';
        }
    });

    exportAllBtn.addEventListener('click', async () => {
        exportAllBtn.disabled = true;
        exportAllBtn.textContent = 'Extracting...';

        try {
            const response = await sendToTab({ action: 'extractAllChats' });
            if (!response || !response.success || !response.chats || !response.chats.length) {
                throw new Error('No chats found to export');
            }

            const total = response.chats.length;
            let exported = 0;
            for (const chat of response.chats) {
                showProgress(exported + 1, total);
                await sleep(100);
                exported++;
            }
            showStatus(`Found ${exported} chats in list (navigation not yet implemented)`);
        } catch (err) {
            console.error(err);
            showStatus('Export error: ' + err.message, true);
        } finally {
            exportAllBtn.disabled = false;
            exportAllBtn.textContent = 'Export All Visible Chats';
            hideProgress();
        }
    });

    downloadOptimizedBtn.addEventListener('click', async () => {
        downloadOptimizedBtn.disabled = true;
        downloadOptimizedBtn.textContent = 'Generating...';
        hideProgress();

        const optimizedPrompt = `Agiere als Senior Knowledge Manager und technischer Architekt. Analysiere den gesamten bisherigen Chatverlauf und synthetisiere eine hochstrukturierte, für einen Obsidian Vault optimierte Dokumentation im Markdown-Format. 

Analysiere im ersten Schritt die primäre Natur des Chats (z.B. Forschung, Config/Installation, Strategiediskussion, Casual). Passe die Gewichtung der folgenden Sektionen dynamisch an den identifizierten Typ an. Eliminiere redundante Gesprächsanteile und fokussiere auf maximale Informationsdichte.

Generiere die Ausgabe exakt nach folgender Struktur. 
KRITISCHER PARSING-BEFEHL: Das YAML-Frontmatter für den Header MUSS zwingend in Zeile 1 beginnen und DARF UNTER KEINEN UMSTÄNDEN in Markdown-Code-Blöcke (Backticks) gewrappt werden. Nutze ausschließlich --- als Begrenzung für die Metadaten.

---
tags: [Generiere 2-4 präzise hierarchische Tags, z.B. infra/mobile, platform/android]
date: [Aktuelles Datum im Format YYYY-MM-DD]
type: [Forschung | Config | Installation | Diskussion | Casual]
status: [Gelöst | Offen | Fortlaufend]
---

# [Generiere einen prägnanten, spezifischen Titel, der den Kern des Chats trifft]

## 🎯 Kontext & Problemstellung
- **Auslöser:** [Präzise Definition des ursprünglichen Anliegens/Problems in maximal 2 Sätzen]
- **Zielsetzung:** [Das angestrebte Endresultat des Chats]

## 🔄 Analyse des Konversationsverlaufs
- **Meilensteine:** [Stichpunktartige Skizzierung der logischen Schritte und entscheidenden Wendepunkte]
- **Verworfene Ansätze:** [Kurze Dokumentation von Fehlversuchen oder Sackgassen, inkl. Begründung, warum sie verworfen wurden]

## 💡 Schlüsselerkenntnisse & Ergebnisse
- **Core Findings:** [Die finalen Antworten, Lösungen oder strategischen Beschlüsse]
- **Artefakte:** [Essenzielle Code-Snippets, abstrakte Konfigurations-Parameter oder zentrale Thesen. Nutze hierfür zwingend korrekte Markdown-Code-Blöcke. Bei Installationen: Spezifische Umgebungsvariablen oder Abhängigkeiten]

## 🛠️ Installations- & Bereitstellungsanleitung (NUR WENN Chat-Typ = "Config" oder "Installation")
[Ignoriere diese gesamte Sektion bei Forschungs-, Casual- oder reinen Theorie-Chats]
- **Architekturentscheidung:** [Kurze Begründung, warum exakt dieses Setup/Tool für die finale Installation gewählt wurde (Entscheidungslogik)]
- **Prärequisiten:** [Zwingend benötigte Systemanforderungen, Vorinstallationen oder Zugriffsrechte]
- **Lineare Ausführung:** 
  [Erstelle eine chronologische, fehlerfreie Schritt-für-Schritt-Anleitung zur Reproduktion der Installation. Filter alle im Chat gemachten Fehler oder Irrwege heraus. Nutze präzise Markdown-Code-Blöcke für CLI-Befehle oder Datei-Edits, bereit zum Copy-Paste.]

## 🚀 Next Steps & Offene Flanken
- **Ungelöst:** [Verbliebene Fragen oder technische Schulden]
- **Aktionen:** [Notwendige Folgeaktivitäten oder Skalierungsschritte]`;

        try {
            // First, get the current chat's title for the filename
            const chatInfoResponse = await sendToTab({ action: 'extractChat' });
            if (!chatInfoResponse || !chatInfoResponse.success) {
                throw new Error('Could not get current chat title.');
            }
            const originalTitle = chatInfoResponse.data.chatData.title || 'Untitled Chat';

            showStatus('Generating summary...');
            const summaryResponse = await sendToTab({ action: 'generateSummary', prompt: optimizedPrompt });

            if (!summaryResponse || !summaryResponse.success) {
                throw new Error(summaryResponse.error || 'Failed to generate summary.');
            }

            const summaryMarkdown = summaryResponse.summary;
            const filename = `${new Date().toISOString().split('T')[0]}-${slugify(originalTitle)}-summary.md`;

            await downloadMarkdown(summaryMarkdown, filename);
            showStatus(`Exported summary for: ${originalTitle}`);

        } catch (err) {
            console.error(err);
            showStatus('Error: ' + err.message, true);
        } finally {
            downloadOptimizedBtn.disabled = false;
            downloadOptimizedBtn.textContent = 'Download Optimized';
        }
    });
});