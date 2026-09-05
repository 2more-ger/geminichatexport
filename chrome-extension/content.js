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

    function isVisible(el) {
        if (!(el instanceof Element)) return false;
        if (el.getClientRects().length === 0) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    function isDisabledControl(el) {
        if (!(el instanceof Element)) return true;
        if (el.hasAttribute('disabled')) return true;
        if (el.getAttribute('aria-disabled') === 'true') return true;
        if ('disabled' in el && el.disabled === true) return true;
        if (el.classList.contains('disabled')) return true;
        return false;
    }

    function findComposerInput() {
        const selectors = [
            'div.ql-editor.textarea[contenteditable="true"]',
            'div.ql-editor[contenteditable="true"]',
            'rich-textarea [contenteditable="true"]',
            '[contenteditable="true"][role="textbox"]',
            '[aria-label*="prompt" i][contenteditable="true"]',
            '[aria-label*="Eingabe" i][contenteditable="true"]'
        ];
        for (const selector of selectors) {
            const nodes = document.querySelectorAll(selector);
            for (const node of nodes) {
                if (isVisible(node)) return node;
            }
        }
        return null;
    }

    function findComposerRoot(inputArea) {
        if (!inputArea) return document;
        const tagged = inputArea.closest(
            'input-container, input-area, input-area-v2, form, .input-area, [data-test-id="input-area"]'
        );
        if (tagged) return tagged;
        let ancestor = inputArea.parentElement;
        for (let depth = 0; ancestor && depth < 12; depth++) {
            if (ancestor.querySelector('[data-test-id="send-button-container"], .send-button-container')) {
                return ancestor;
            }
            ancestor = ancestor.parentElement;
        }
        return document;
    }

    function isSendReady(container) {
        if (!(container instanceof Element)) return false;
        if (container.classList.contains('visible')) return true;
        if (container.querySelector('.has-input, .submit')) return true;
        const host = container.querySelector('gem-icon-button, .send-button');
        if (host && host.getAttribute('aria-disabled') === 'false') return true;
        return false;
    }

    function buttonFromSendContainer(container) {
        if (!container) return null;
        return container.querySelector(
            'button[aria-label*="senden" i], button[aria-label*="send" i], button[jslog^="173899"], button.mdc-icon-button, button'
        );
    }

    // Live Gemini DOM (2026):
    // <div data-test-id="send-button-container" class="send-button-container visible">
    //   <gem-icon-button class="send-button has-input submit" aria-disabled="false">
    //     <button aria-label="Nachricht senden" jslog="173899;...">
    //       <mat-icon data-mat-icon-name="arrow_upward">
    // The container is *inserted only after* Angular sees text in the composer.
    function findSendButton(inputArea) {
        const roots = [];
        const composer = findComposerRoot(inputArea);
        if (composer) roots.push(composer);
        if (composer !== document) roots.push(document);

        for (const root of roots) {
            const containers = root.querySelectorAll(
                '[data-test-id="send-button-container"], .send-button-container'
            );
            for (const container of containers) {
                if (!isSendReady(container)) continue;
                const btn = buttonFromSendContainer(container);
                if (!btn) continue;
                const host = container.querySelector('gem-icon-button, .send-button');
                if (host && host.getAttribute('aria-disabled') === 'true') continue;
                if (isDisabledControl(btn)) continue;
                if (!isVisible(btn) && !isVisible(container)) continue;
                return btn;
            }

            const labeled = root.querySelector(
                'button[aria-label="Nachricht senden"], button[aria-label="Send message"], button[aria-label="Send prompt"], button[jslog^="173899"]'
            );
            if (labeled && !isDisabledControl(labeled) && isVisible(labeled)) {
                return labeled;
            }

            const icon = root.querySelector(
                'mat-icon[data-mat-icon-name="arrow_upward"], mat-icon[fonticon="arrow_upward"]'
            );
            if (icon) {
                const btn = icon.closest('button');
                if (btn && !isDisabledControl(btn) && isVisible(btn)) return btn;
            }
        }
        return null;
    }

    function clickSendButton(sendButton) {
        // One native click. The previous pointerdown/mousedown/mouseup/click
        // cascade plus an extra button.click() made Gemini send the prompt ~6 times.
        sendButton.click();
    }

    function dispatchEnter(inputArea) {
        const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
        inputArea.dispatchEvent(new KeyboardEvent('keydown', opts));
        inputArea.dispatchEvent(new KeyboardEvent('keypress', opts));
        inputArea.dispatchEvent(new KeyboardEvent('keyup', opts));
    }

    function composerHasText(inputArea, prompt) {
        const t = (inputArea.innerText || inputArea.textContent || '').replace(/\u00a0/g, ' ').trim();
        return t.length >= Math.min(20, prompt.trim().length);
    }

    function fireComposerEvents(inputArea, prompt) {
        inputArea.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: 'insertText',
            data: prompt
        }));
        inputArea.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType: 'insertFromPaste',
            data: prompt
        }));
        inputArea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    function pasteIntoComposer(inputArea, prompt) {
        const dt = new DataTransfer();
        dt.setData('text/plain', prompt);
        let evt;
        try {
            evt = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clipboardData: dt
            });
        } catch (err) {
            evt = new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true });
            Object.defineProperty(evt, 'clipboardData', { value: dt });
        }
        return inputArea.dispatchEvent(evt);
    }

    async function fillComposer(inputArea, prompt) {
        inputArea.focus();
        await sleep(80);

        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // Long prompts: paste is what Angular/Quill actually treats as user input,
        // which is what inserts <div data-test-id="send-button-container" class="... visible">.
        pasteIntoComposer(inputArea, prompt);
        await sleep(50);

        if (!composerHasText(inputArea, prompt)) {
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, prompt);
            fireComposerEvents(inputArea, prompt);
        }

        if (!composerHasText(inputArea, prompt)) {
            inputArea.textContent = prompt;
            fireComposerEvents(inputArea, prompt);
        }
    }

    async function waitForSendButton(inputArea, timeoutMs) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            const btn = findSendButton(inputArea);
            if (btn) return btn;
            await sleep(150);
        }
        return null;
    }

    async function submitPrompt(prompt) {
        const inputArea = findComposerInput();
        if (!inputArea) throw new Error('Chat input area not found.');

        const beforeCount = document.querySelectorAll('model-response').length;
        await fillComposer(inputArea, prompt);

        let sendButton = await waitForSendButton(inputArea, 5000);
        if (!sendButton) {
            await fillComposer(inputArea, prompt);
            sendButton = await waitForSendButton(inputArea, 4000);
        }

        if (sendButton) {
            clickSendButton(sendButton);
            return;
        }

        inputArea.focus();
        dispatchEnter(inputArea);
        await sleep(800);
        const stopBtn = document.querySelector(
            '[aria-label*="Stop generating" i], [aria-label*="Stoppen" i], [aria-label*="stop" i], [data-test-id="stop-button"], [data-testid="stop-button"]'
        );
        const afterCount = document.querySelectorAll('model-response').length;
        if (!stopBtn && afterCount <= beforeCount) {
            throw new Error('Send button did not appear (data-test-id=send-button-container). Gemini only inserts it after the composer has text.');
        }
    }

    function isStreaming() {
        return !!document.querySelector(
            '[aria-label*="Stop generating" i], [aria-label*="Generierung stoppen" i], [aria-label*="Stoppen" i], [data-test-id="stop-button"], [data-testid="stop-button"]'
        );
    }

    function getLastModelResponse() {
        const responses = document.querySelectorAll('model-response');
        if (responses.length) return responses[responses.length - 1];
        const convos = document.querySelectorAll('.conversation-container');
        return convos.length ? convos[convos.length - 1] : null;
    }

    // Streaming is done when Gemini mounts the action bar at the end of the
    // last conversation-container: thumb up/down, regenerate, copy.
    function responseHasCompletionBar(responseEl) {
        if (!responseEl) return false;
        const bar = responseEl.querySelector('.buttons-container-v2, .buttons-container');
        if (!bar) return false;
        return !!bar.querySelector(
            '[data-test-id="thumb-up-button"], thumb-up-button, copy-button, [data-test-id="regenerate-button"], button[aria-label="Gute Antwort"], button[aria-label="Good response"], button[aria-label="Kopieren"], button[aria-label="Copy"]'
        );
    }

    async function waitForGenerationToComplete(initialResponseCount) {
        const appearDeadline = Date.now() + 20000;
        while (Date.now() < appearDeadline) {
            const count = document.querySelectorAll('model-response').length;
            if (count > initialResponseCount || isStreaming()) break;
            if (document.querySelector('[class*="error-message"]')) {
                throw new Error('Gemini reported an error during generation.');
            }
            await sleep(200);
        }

        // Token streaming: text length pauses are normal. Only the action bar
        // on the *new* model-response means the turn is finished.
        const doneDeadline = Date.now() + 5 * 60 * 1000;
        while (Date.now() < doneDeadline) {
            const count = document.querySelectorAll('model-response').length;
            const last = getLastModelResponse();
            const isNewTurn = count > initialResponseCount;
            const complete = isNewTurn && responseHasCompletionBar(last) && !isStreaming();

            if (complete) {
                await sleep(400);
                if (responseHasCompletionBar(getLastModelResponse()) && !isStreaming()) {
                    return;
                }
            }

            if (document.querySelector('[class*="error-message"]')) {
                throw new Error('Gemini reported an error during generation.');
            }
            await sleep(250);
        }

        throw new Error('Timed out waiting for Gemini to finish streaming (thumb/copy action bar never appeared).');
    }

    function sanitizeObsidianMarkdown(raw) {
        let text = (raw || '').replace(/^\uFEFF/, '').trim();
        if (!text) return text;

        // Gemini code-execution artifacts sit in front of the actual note.
        let stripped = true;
        while (stripped) {
            stripped = false;
            const fenced = text.match(/^```(?:python|py|text|output|console)?\s*\n[\s\S]*?```\s*/i);
            if (fenced) {
                text = text.slice(fenced[0].length).trim();
                stripped = true;
            }
        }

        // Model often wraps YAML in a fence despite the prompt forbidding it.
        const yamlFence = text.match(/^```(?:ya?ml)\s*\n([\s\S]*?)\n```\s*/i);
        if (yamlFence) {
            text = yamlFence[1].trim() + '\n' + text.slice(yamlFence[0].length);
        }

        // Gemini turns `tags:` into a heading: `## tags: [...]`
        text = text.replace(/^#{1,6}\s*(tags\s*:)/im, '$1');

        if (!text.startsWith('---')) {
            const metaStart = text.search(/^(tags|date|type|status)\s*:/m);
            if (metaStart !== -1) {
                text = text.slice(metaStart);
            }
        }

        if (/^(tags|date|type|status)\s*:/m.test(text) && !text.startsWith('---')) {
            text = '---\n' + text;
        }

        if (text.startsWith('---')) {
            const afterOpen = text.indexOf('\n');
            const rest = afterOpen === -1 ? '' : text.slice(afterOpen + 1);
            const closeIdx = rest.indexOf('\n---');
            if (closeIdx === -1) {
                const heading = rest.search(/\n#\s+/);
                if (heading !== -1) {
                    text = '---\n' + rest.slice(0, heading).trim() + '\n---\n' + rest.slice(heading + 1);
                }
            }
        }

        return text.trim() + '\n';
    }

    async function extractLastModelResponse() {
        const modelResponses = document.querySelectorAll('model-response');
        if (!modelResponses.length) throw new Error('No model response found on the page.');
        const lastResponse = modelResponses[modelResponses.length - 1];

        // 1. Versuch: Den nativen "Kopieren"-Button verwenden, um perfektes Markdown zu erhalten
        const copyButton = lastResponse.querySelector(
            '.buttons-container-v2 button[aria-label="Kopieren"], copy-button button, [data-test-id="copy-button"], button[aria-label*="Kopieren" i], button[aria-label*="Copy" i]'
        );
        if (copyButton) {
            copyButton.click();
            await sleep(1500); // Warten, bis das Skript der Seite die Zwischenablage befüllt hat
            
            try {
                const clipboardText = await navigator.clipboard.readText();
                if (clipboardText && clipboardText.trim().length > 0) {
                    return sanitizeObsidianMarkdown(clipboardText);
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
            'code-execution', '[class*="code-execution"]',
            '[data-test-id="code-execution"]', '[class*="tool-"]',
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
        
        return sanitizeObsidianMarkdown(content);
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
                if (window.__geminiExportBusy) {
                    sendResponse({ success: false, error: 'Export already running' });
                    return true;
                }
                window.__geminiExportBusy = true;
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
                    } finally {
                        window.__geminiExportBusy = false;
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
