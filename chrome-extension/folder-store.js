// Persist the export directory via File System Access + IndexedDB.
// chrome.downloads cannot remember an absolute path (only the default Downloads folder).

const ExportFolder = (() => {
    const DB_NAME = 'gemini-chat-export';
    const STORE = 'handles';
    const HANDLE_KEY = 'exportDir';
    const PICKER_ID = 'gemini-chat-export';

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function waitForTx(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        });
    }

    async function saveHandle(handle) {
        const db = await openDb();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(handle, HANDLE_KEY);
        await waitForTx(tx);
        await chrome.storage.local.set({ exportFolderName: handle.name });
    }

    async function loadHandle() {
        const db = await openDb();
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(HANDLE_KEY);
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function clearHandle() {
        const db = await openDb();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(HANDLE_KEY);
        await waitForTx(tx);
        await chrome.storage.local.remove('exportFolderName');
    }

    async function ensurePermission(handle) {
        if (!handle) return false;
        const opts = { mode: 'readwrite' };
        try {
            if (typeof handle.queryPermission === 'function') {
                const current = await handle.queryPermission(opts);
                if (current === 'granted') return true;
            }
            if (typeof handle.requestPermission === 'function') {
                return (await handle.requestPermission(opts)) === 'granted';
            }
            return true;
        } catch (err) {
            console.warn('Export folder permission failed:', err);
            return false;
        }
    }

    function sanitizeFilename(name) {
        let base = String(name || 'untitled.md')
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .replace(/\s+/g, ' ')
            .trim();
        if (!base || base === '.md') base = 'untitled.md';
        if (!base.toLowerCase().endsWith('.md')) base += '.md';
        return base;
    }

    async function writeMarkdown(dirHandle, filename, text) {
        const safeName = sanitizeFilename(filename);
        const fileHandle = await dirHandle.getFileHandle(safeName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        return safeName;
    }

    async function pickDirectory(previousHandle) {
        const opts = { id: PICKER_ID, mode: 'readwrite' };
        if (previousHandle) {
            opts.startIn = previousHandle;
        } else {
            opts.startIn = 'documents';
        }
        try {
            return await window.showDirectoryPicker(opts);
        } catch (err) {
            if (err && err.name === 'AbortError') throw err;
            return await window.showDirectoryPicker({ id: PICKER_ID, mode: 'readwrite' });
        }
    }

    function openPickerWindow() {
        return chrome.windows.create({
            url: chrome.runtime.getURL('picker.html'),
            type: 'popup',
            width: 460,
            height: 300,
            focused: true
        });
    }

    async function getFolderName() {
        const stored = await chrome.storage.local.get('exportFolderName');
        return stored.exportFolderName || '';
    }

    return {
        saveHandle,
        loadHandle,
        clearHandle,
        ensurePermission,
        sanitizeFilename,
        writeMarkdown,
        pickDirectory,
        openPickerWindow,
        getFolderName
    };
})();
