document.addEventListener('DOMContentLoaded', async () => {
    const pickBtn = document.getElementById('pick');
    const statusEl = document.getElementById('status');

    function showStatus(message, isError = false) {
        statusEl.textContent = message;
        statusEl.classList.remove('hidden', 'error');
        if (isError) statusEl.classList.add('error');
    }

    const existingName = await ExportFolder.getFolderName();
    if (existingName) {
        showStatus('Currently: ' + existingName);
    }

    pickBtn.addEventListener('click', async () => {
        pickBtn.disabled = true;
        try {
            const previous = await ExportFolder.loadHandle();
            const handle = await ExportFolder.pickDirectory(previous);
            const allowed = await ExportFolder.ensurePermission(handle);
            if (!allowed) {
                throw new Error('Write permission was not granted.');
            }
            await ExportFolder.saveHandle(handle);
            showStatus('Saved: ' + handle.name);
            setTimeout(() => window.close(), 700);
        } catch (err) {
            if (err && err.name === 'AbortError') {
                showStatus('Cancelled', true);
            } else {
                console.error(err);
                showStatus(err.message || String(err), true);
            }
        } finally {
            pickBtn.disabled = false;
        }
    });
});
