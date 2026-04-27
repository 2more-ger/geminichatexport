// Content script for Gemini Chat Export
// Extracts chat data and generates Obsidian-ready Markdown

(function() {
    'use strict';

    // Generate UUID v4
    function generateUUID() {
        return crypto.randomUUID();
    }

    // Slugify title for filename
    function slugify(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/--+/g, '-')
            .trim();
    }

    // Extract chat ID from URL
    function getChatId() {
        const match = window.location.href.match(/gemini\.google\.com\/app\/([a-zA-Z0-9]+)/);
        return match ? match[1] : 'unknown';
    }

    // Extract chat title from page
    function getChatTitle() {
        // Strategy 1: The document title is often the most reliable source
        const docTitle = document.title;
        if (docTitle && docTitle !== 'Gemini' && docTitle !== 'Google Gemini') {
            const cleanTitle = docTitle.replace(/\s*-\s*Gemini\s*$/i, '').replace(/Gemini/i, '').trim();
            if (cleanTitle) {
                return cleanTitle;
            }
        }

        // Strategy 2: Try various selectors for the title in the DOM
        const selectors = [
            'h1[role="heading"]',
            'h1',
            '[data-testid="chat-title"]',
            '.chat-title',
            '[aria-label*="chat title"]',
            'conversation-title',
            '.selected-chat-title',
            // Target the active chat in the sidebar
            '[data-testid="conversations-list-item-active"] .text-base',
            'nav [aria-current="page"] .text-base',
            'nav [aria-current="page"] span'
        ];
        
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent.trim() && el.textContent.trim() !== 'Gemini') {
                return el.textContent.trim();
            }
        }
        
        return 'Untitled Chat';
    }

    // Extract model name from UI
    function getModelName() {
        const selectors = [
            '[data-testid="model-switcher"]',
            '.model-name',
            '[aria-label*="model"]'
        ];
        
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent.trim()) {
                return el.textContent.trim();
            }
        }
        
        return '';
    }

    // Extract chat creation date
    function getCreatedDate() {
        // Strategy 1: Try to find it in meta tags or data attributes
        const metaDate = document.querySelector('meta[property="og:article:published_time"]');
        if (metaDate && metaDate.getAttribute('content')) {
            return metaDate.getAttribute('content');
        }
        
        // Strategy 2: Look for any <time> element with a datetime attribute
        const timeElements = document.querySelectorAll('time[datetime]');
        if (timeElements.length > 0) {
            // We usually want the first one (often the oldest message or chat creation time)
            return timeElements[0].getAttribute('datetime');
        }

        // Strategy 3: Try to extract from the active chat item in the sidebar
        const activeChatItem = document.querySelector('[data-testid="conversations-list-item-active"], nav [aria-current="page"]');
        if (activeChatItem) {
            // Sometimes there are tooltips or aria-labels with the date
            const elementsWithAriaLabel = activeChatItem.querySelectorAll('[aria-label]');
            for (const el of elementsWithAriaLabel) {
                const label = el.getAttribute('aria-label').toLowerCase();
                if (label.includes('created') || label.match(/\d{4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/)) {
                    // It's hard to parse "Created Jan 12, 2024", but we return ISO fallback if we can't parse it
                    // Actually, if we find a date-like label, it's better to just use current date if we can't parse it strictly.
                }
            }
        }
        
        // Fallback: use current date if we cannot determine the exact creation date
        return new Date().toISOString();
    }

    // Extract all messages from the chat
    function getMessages() {
        const messages = [];
        
        // Strategy 1: Look for explicit user-query and model-response elements (Modern Gemini)
        const userQueries = document.querySelectorAll('user-query');
        const modelResponses = document.querySelectorAll('model-response');
        
        if (userQueries.length > 0 || modelResponses.length > 0) {
            // Collect all elements and sort them by their position in the DOM
            const allElements = [...userQueries, ...modelResponses].sort((a, b) => {
                return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
            });
            
            allElements.forEach(el => {
                const isUser = el.tagName.toLowerCase() === 'user-query';
                // Try to get text from the message content or just textContent
                let content = '';
                const messageContent = el.querySelector('.message-content, [class*="content"]');
                
                if (messageContent) {
                    // Get text from paragraphs to preserve some formatting
                    const paragraphs = messageContent.querySelectorAll('p, pre, ul, ol');
                    if (paragraphs.length > 0) {
                        paragraphs.forEach(p => content += p.textContent.trim() + '\n\n');
                    } else {
                        content = messageContent.textContent.trim();
                    }
                } else {
                    content = el.textContent.trim();
                }
                
                if (content) {
                    messages.push({
                        role: isUser ? 'You' : 'Gemini',
                        content: content.trim()
                    });
                }
            });
            
            if (messages.length > 0) return messages;
        }
        
        // Strategy 2: Look for message containers (Older/Alternative Gemini UI)
        const messageContainers = document.querySelectorAll('[data-testid="message"], [data-test-id="message"], .message, [class*="message-container"]');
        
        messageContainers.forEach(container => {
            // Determine if user or Gemini message
            const isUser = container.querySelector('[data-testid*="user"], [class*="user"]') !== null || 
                           container.getAttribute('data-testid')?.includes('user') ||
                           container.classList.toString().includes('user');
            
            // Get message content
            let content = '';
            const contentElements = container.querySelectorAll('p, div[role="paragraph"], .message-content, [class*="content"]');
            
            if (contentElements.length > 0) {
                contentElements.forEach(el => {
                    // Only add if it has text and isn't already added
                    const text = el.textContent.trim();
                    if (text && !content.includes(text)) {
                        content += text + '\n\n';
                    }
                });
            } else {
                content = container.textContent.trim();
            }
            
            content = content.trim();
            
            if (content) {
                messages.push({
                    role: isUser ? 'You' : 'Gemini',
                    content: content
                });
            }
        });
        
        // Strategy 3: Fallback using role="article"
        if (messages.length === 0) {
            const conversationElements = document.querySelectorAll('[role="article"]');
            conversationElements.forEach(el => {
                const text = el.textContent.trim();
                if (text) {
                    const isUser = el.querySelector('[data-testid*="user"], [class*="user"]') !== null || 
                                   el.closest('[data-testid*="user"], [class*="user"]') !== null ||
                                   el.getAttribute('class')?.includes('user');
                    messages.push({
                        role: isUser ? 'You' : 'Gemini',
                        content: text
                    });
                }
            });
        }
        
        // Final fallback to just grabbing main text areas if nothing else works
        if (messages.length === 0) {
            const textElements = document.querySelectorAll('.text-base, .markdown');
            textElements.forEach((el, index) => {
                const text = el.textContent.trim();
                if (text) {
                    // Very rough heuristic for fallback
                    messages.push({
                        role: index % 2 === 0 ? 'You' : 'Gemini',
                        content: text
                    });
                }
            });
        }
        
        return messages;
    }

    // Count visible messages
    function getMessageCount() {
        return getMessages().length;
    }

    // Generate the Markdown file content
    function generateMarkdown(chatData) {
        let markdown = '---\n';
        markdown += `title: "${chatData.title}"\n`;
        markdown += `uuid: "${chatData.uuid}"\n`;
        markdown += `exported: ${chatData.exported}\n`;
        markdown += `created: ${chatData.created}\n`;
        markdown += `url: "https://gemini.google.com/app/${chatData.chatId}"\n`;
        
        if (chatData.model) {
            markdown += `model: "${chatData.model}"\n`;
        }
        
        markdown += `tags: ["gemini"]\n`;
        markdown += `messages: ${chatData.messageCount}\n`;
        markdown += '---\n\n';
        
        chatData.messages.forEach((msg, index) => {
            markdown += `# ${msg.role}\n\n`;
            markdown += `${msg.content}\n\n`;
            
            // Add separator between conversations
            if (index < chatData.messages.length - 1) {
                markdown += '---\n\n';
            }
        });
        
        return markdown;
    }

    // Main function to extract all chat data
    function extractChatData() {
        return {
            chatId: getChatId(),
            title: getChatTitle(),
            model: getModelName(),
            created: getCreatedDate(),
            exported: new Date().toISOString(),
            messages: getMessages(),
            messageCount: getMessageCount()
        };
    }

    // Generate filename for the chat
    function generateFilename(chatData) {
        const date = new Date().toISOString().split('T')[0];
        const title = chatData && chatData.title ? chatData.title : 'Untitled Chat';
        return `${date}-${slugify(title)}.md`;
    }

    // --- Helpers for summary generation ---

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function submitPrompt(prompt) {
        let inputArea = document.querySelector('div.ql-editor.textarea, rich-textarea [contenteditable="true"]');
        if (!inputArea) {
            inputArea = document.querySelector('[contenteditable="true"]'); // Fallback für generische Textfelder
        }
        if (!inputArea) throw new Error('Chat input area not found.');

        // Fokussieren, um native Events auszulösen
        inputArea.focus();
        
        // Eventuell vorhandenen Text markieren und überschreiben
        document.execCommand('selectAll', false, null);
        
        // Text per execCommand einfügen (simuliert eine echte Nutzereingabe und weckt UI-Frameworks auf)
        const success = document.execCommand('insertText', false, prompt);
        
        if (!success) {
            // Fallback für Browser/Situationen, die execCommand blockieren
            inputArea.textContent = prompt;
            inputArea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }

        // Aktiv darauf warten, dass der Send-Button verfügbar wird (max. ~4,5 Sekunden)
        let sendButton = null;
        let attempts = 15;
        
        while (attempts > 0 && !sendButton) {
            await sleep(300); // Kurze Pause nach dem Input und zwischen den Versuchen
            
            // Spezifischer Selektor für den neuen Gemini-Send-Button-Container, plus alte Fallbacks
            const btn = document.querySelector('.send-button-container.visible button, .send-button-container.visible, button[aria-label*="send" i], [data-testid="send-button"]');
            
            if (btn) {
                // Prüfe auf aria-disabled, echte Attribute, sowie die neuen Klassen (.disabled) auch bei Parent-Elementen
                const isDisabled = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled') || btn.closest('.disabled') !== null;
                if (!isDisabled) {
                    sendButton = btn;
                }
            }
            attempts--;
        }

        if (!sendButton) {
            throw new Error('Send button not found or remained disabled after waiting.');
        }
        
        // Den Touch-Target Span klicken, wie von dir angemerkt, andernfalls als Fallback den Button selbst
        const touchTarget = sendButton.querySelector('.mat-mdc-button-touch-target');
        if (touchTarget) {
            touchTarget.click();
        } else {
            sendButton.click();
        }
    }

    async function waitForGenerationToComplete(initialResponseCount) {
        let isGenerating = true;
        let lastTextLength = 0;
        let stableCount = 0;
        let maxWaitIterations = 120; // Max 2 Minuten
        
        // 1. Warten bis ein neues model-response auftaucht oder der Stop-Button sichtbar wird
        let newResponseAppeared = false;
        let appearAttempts = 50; // Max 10 Sekunden
        
        while (appearAttempts > 0 && !newResponseAppeared) {
            const currentCount = document.querySelectorAll('model-response').length;
            const stopBtnExists = !!document.querySelector('[aria-label*="Stop generating"], [data-testid="stop-button"], button[aria-label*="stop" i]');
            
            if (currentCount > initialResponseCount || stopBtnExists) {
                newResponseAppeared = true;
            } else if (document.querySelector('[class*="error-message"]')) {
                throw new Error('Gemini reported an error during generation.');
            } else {
                await sleep(200);
                appearAttempts--;
            }
        }
        
        // 2. Aktiv den Text-Inhalt überwachen (ohne Thoughts/Gedanken-Container)
        while (isGenerating && maxWaitIterations > 0) {
            await sleep(1000); // Jede Sekunde prüfen
            maxWaitIterations--;
            
            const stopBtnExists = !!document.querySelector('[aria-label*="Stop generating"], [data-testid="stop-button"], button[aria-label*="stop" i]');
            const modelResponses = document.querySelectorAll('model-response');
            let currentTextLength = 0;
            
            if (modelResponses.length > 0) {
                const lastResponse = modelResponses[modelResponses.length - 1];
                const contentContainer = lastResponse.querySelector('.markdown, .message-content, .response-container-content, [class*="content"]') || lastResponse;
                
                // Klonen, um Thoughts sicher zu entfernen ohne das DOM zu verändern
                const clone = contentContainer.cloneNode(true);
                const thoughts = clone.querySelectorAll('thought-container, details, [class*="thought"], [class*="thinking"]');
                thoughts.forEach(t => t.remove());
                
                currentTextLength = clone.textContent.trim().length;
            }
            
            if (stopBtnExists) {
                stableCount = 0; // Solange der Stop-Button da ist, sind wir nicht fertig
            } else {
                if (currentTextLength > 0 && currentTextLength === lastTextLength) {
                    stableCount++;
                } else {
                    stableCount = 0;
                }
            }
            
            lastTextLength = currentTextLength;
            
            // Wenn Stop-Button weg ist UND der Text sich 2 Sekunden lang nicht verändert hat
            if (!stopBtnExists && stableCount >= 2) {
                isGenerating = false;
            }
        }

        // 3. Final small delay to ensure the DOM is fully updated
        await sleep(500);
    }

    async function extractLastModelResponse() {
        const modelResponses = document.querySelectorAll('model-response');
        if (!modelResponses.length) throw new Error('No model response found on the page.');
        const lastResponse = modelResponses[modelResponses.length - 1];

        // 1. Versuch: Den nativen "Kopieren"-Button verwenden, um perfektes Markdown zu erhalten
        const copyButton = lastResponse.querySelector('[data-test-id="copy-button"], button[aria-label*="Kopieren" i], button[aria-label*="Copy" i]');
        if (copyButton) {
            copyButton.click();
            await sleep(1500); // Warten, bis das Skript der Seite die Zwischenablage befüllt hat
            
            try {
                const clipboardText = await navigator.clipboard.readText();
                if (clipboardText && clipboardText.trim().length > 0) {
                    return clipboardText;
                }
            } catch (err) {
                console.warn('Fehler beim Auslesen der Zwischenablage (evtl. fehlt Fokus oder Berechtigung). Fallback wird verwendet.', err);
            }
        }

        // 2. Fallback: Verbesserte DOM-Extraktion, falls die Zwischenablage nicht ausgelesen werden kann
        let targetEl = lastResponse.querySelector('.markdown, .message-content, .response-container-content') || lastResponse;
        
        const clone = targetEl.cloneNode(true);
        
        // Unnötige Elemente sicher entfernen (ohne aggressive Wildcards)
        const removeSelectors = [
            'thought-container', 'details', 
            '.visually-hidden', '.cdk-visually-hidden', 
            'button', 'mat-icon'
        ];
        clone.querySelectorAll(removeSelectors.join(', ')).forEach(el => el.remove());
        
        // Markdown-Formatierung direkt in die HTML-Knoten injizieren
        clone.querySelectorAll('h1, h2, h3, h4').forEach(h => {
            const level = parseInt(h.tagName.substring(1));
            h.textContent = '\n\n' + '#'.repeat(level) + ' ' + h.textContent.trim() + '\n\n';
        });
        clone.querySelectorAll('strong, b').forEach(b => b.textContent = '**' + b.textContent + '**');
        clone.querySelectorAll('em, i').forEach(i => i.textContent = '_' + i.textContent + '_');
        clone.querySelectorAll('li').forEach(li => li.textContent = '- ' + li.textContent.trim() + '\n');
        
        // Klon unsichtbar ins DOM einhängen, um saubere Zeilenumbrüche via innerText zu erhalten
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.appendChild(clone);
        document.body.appendChild(tempDiv);
        
        let content = tempDiv.innerText || clone.textContent;
        document.body.removeChild(tempDiv);
        
        // Formatierung aufräumen (mehrfache leere Zeilen reduzieren)
        content = content.replace(/\n{3,}/g, '\n\n').trim();

        // Letztes Sicherheitsnetz: Falls content durch DOM-Manipulation leer ist
        if (!content) {
            content = targetEl.textContent.trim();
        }

        if (!content) {
            throw new Error("Could not extract content from the last response.");
        }
        
        return content;
    }

    // Listen for messages from popup/background
    if (!window.GeminiChatExportListenerAdded) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'ping') {
                sendResponse({ success: true });
                return true;
            }
        
            if (request.action === 'extractChat') {
                const chatData = extractChatData();
                const markdown = generateMarkdown(chatData);
                const filename = generateFilename(chatData);
            
                sendResponse({
                    success: true,
                    data: {
                        chatData: chatData,
                        markdown: markdown,
                        filename: filename
                    }
                });
            }
        
            if (request.action === 'extractAllChats') {
                // Extract data for all visible chats in the list
                const chats = [];
                const chatListItems = document.querySelectorAll('[data-testid="chat-item"]');
            
                chatListItems.forEach((item, index) => {
                    const titleEl = item.querySelector('[data-testid="chat-title"]');
                    const idEl = item.querySelector('[data-testid="chat-id"]');
                
                    if (titleEl) {
                        chats.push({
                            title: titleEl.textContent.trim(),
                            chatId: idEl ? idEl.textContent.trim() : `chat-${index}`,
                            element: item
                        });
                    }
                });
            
                sendResponse({
                    success: true,
                    chats: chats
                });
            }

            if (request.action === 'generateSummary') {
                (async () => {
                    try {
                        // Note: Model switching is not implemented as it's highly dependent on
                        // Google's UI and can break easily. Please select the desired model manually for best results.
                        const initialCount = document.querySelectorAll('model-response').length;
                        await submitPrompt(request.prompt);
                        await waitForGenerationToComplete(initialCount);
                        const summaryContent = await extractLastModelResponse();
                        sendResponse({ success: true, summary: summaryContent });
                    } catch (e) {
                        console.error('Error generating summary:', e);
                        sendResponse({ success: false, error: e.message });
                    }
                })();
                return true; // Keep message channel open for async response
            }
        
            return true;
        });
        window.GeminiChatExportListenerAdded = true;
    }

    // Expose functions for popup to call
    window.GeminiChatExport = {
        extractChatData: extractChatData,
        generateMarkdown: generateMarkdown,
        generateFilename: generateFilename,
        getMessages: getMessages
    };
})();
