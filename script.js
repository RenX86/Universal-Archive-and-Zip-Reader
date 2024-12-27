import SevenZip from './node_modules/7z-wasm/7zz.es6.js';

let sevenZip = null;

// Initialize 7z-wasm
(async () => {
    try {
        sevenZip = await SevenZip();
        console.log("7z-wasm loaded successfully!");
    } catch (error) {
        console.error("Failed to load 7z-wasm:", error);
    }
})();

const historyStack = [];
document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const dropZone = document.getElementById('dropZone');
    const archiveInput = document.getElementById('archiveInput');
    const imageContainer = document.getElementById('imageContainer');
    const fileList = document.getElementById('file-list');
    const rightPane = document.getElementById('right-pane');
    const searchBox = document.getElementById('search-box');
    const themeToggle = document.getElementById('theme-toggle');
    const errorMessage = document.getElementById('error-message');
    const loader = createLoader();

    // Theme handling
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    });

    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }

    // Drag-and-Drop Events
    dropZone.addEventListener('click', () => archiveInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFile(e.dataTransfer.files[0]);
    });

    archiveInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

    // Search functionality
    searchBox.addEventListener('input', debounce((e) => {
        const searchTerm = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.file-item, .folder');
        items.forEach(item => {
            item.style.display = item.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
        });
    }, 300));

    async function handleFile(file) {
        if (!file) {
            showError("No file selected.");
            return;
        }

        const extension = file.name.toLowerCase().split('.').pop();
        clearRightPane();
        showLoader();

        try {
            if (extension === '7z') {
                await handle7z(file);
            } else if (extension === 'zip') {
                await handleZip(file);
            } else {
                showError("Unsupported file format. Please select a .zip or .7z file.");
            }
        } catch (error) {
            console.error("Error processing archive:", error);
            showError("Failed to process archive. Please try again.");
        } finally {
            hideLoader();
        }
    }

    async function handleZip(file) {
        const zip = new JSZip();
        try {
            const content = await zip.loadAsync(file);
            rightPane.innerHTML = '';

            for (const [filename, entry] of Object.entries(content.files)) {
                if (!entry.dir) {
                    displayFileInRightPane(filename);

                    if (isImageFile(filename)) {
                        const blob = await entry.async('blob');
                        displayImage(blob, filename);
                    }
                }
            }
        } catch (error) {
            throw new Error(`Error processing ZIP: ${error.message}`);
        }
    }

    async function handle7z(file) {
        if (!sevenZip) {
            showError("7z support not initialized. Please try again later.");
            return;
        }

        const arrayBuffer = await file.arrayBuffer();
        const archiveData = new Uint8Array(arrayBuffer);
        const archiveName = 'temp.7z';

        try {
            const stream = sevenZip.FS.open(archiveName, "w+");
            sevenZip.FS.write(stream, archiveData, 0, archiveData.length);
            sevenZip.FS.close(stream);

            sevenZip.callMain(["x", archiveName, "-o/output"]);

            const outputDir = "/output";
            const files = sevenZip.FS.readdir(outputDir).filter(file => file !== '.' && file !== '..');

            rightPane.innerHTML = '';

            for (const fileName of files) {
                displayFileInRightPane(fileName);

                if (isImageFile(fileName)) {
                    const filePath = `${outputDir}/${fileName}`;
                    const fileData = sevenZip.FS.readFile(filePath);
                    const blob = new Blob([fileData], { type: getImageMimeType(fileName) });
                    displayImage(blob, fileName);
                }
            }

            cleanup(archiveName, outputDir);
        } catch (error) {
            throw new Error(`Error processing 7Z: ${error.message}`);
        }
    }

    async function selectDirectory() {
        try {
            const directoryHandle = await window.showDirectoryPicker();
            historyStack.length = 0;
            historyStack.push(directoryHandle);
            await displayFolderContents(directoryHandle);
        } catch (error) {
            console.error('Error selecting directory:', error);
            showError('Failed to select directory. Please try again.');
        }
    }

    async function displayFolderContents(folderHandle) {
        clearLeftPane();
        if (historyStack.length > 1) {
            addGoBackOption();
        }

        try {
            for await (const entry of folderHandle.values()) {
                const itemElement = document.createElement('div');
                itemElement.className = entry.kind === 'directory' ? 'folder' : 'file';
                itemElement.textContent = entry.name;

                if (entry.kind === 'directory') {
                    itemElement.onclick = async () => {
                        historyStack.push(entry);
                        await displayFolderContents(entry);
                    };
                } else if (entry.kind === 'file' && (entry.name.toLowerCase().endsWith('.zip') || entry.name.toLowerCase().endsWith('.7z'))) {
                    itemElement.onclick = async () => {
                        const file = await entry.getFile();
                        await handleFile(file);
                    };
                }

                fileList.appendChild(itemElement);
            }
        } catch (error) {
            console.error('Error displaying folder contents:', error);
            showError('Failed to display folder contents. Please try again.');
        }
    }

    function displayFile(filename) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.textContent = filename;
        fileList.appendChild(fileItem);
    }

    function displayFileInRightPane(filename) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.textContent = filename;
        rightPane.appendChild(fileItem);
    }

    function isImageFile(filename) {
        return /\.(jpe?g|png|gif|bmp|webp)$/i.test(filename);
    }

    function getImageMimeType(filename) {
        const ext = filename.toLowerCase().split('.').pop();
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'webp': 'image/webp'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    function displayImage(blob, filename) {
        const url = URL.createObjectURL(blob);
        const wrapper = document.createElement('div');
        wrapper.className = 'image-wrapper';
        wrapper.style.marginBottom = '20px'; // Add spacing for scrollable view

        const img = document.createElement('img');
        img.src = url;
        img.alt = filename;
        img.style.display = 'block';
        img.style.margin = '0 auto'; // Center image
        img.style.maxWidth = '90%';

        img.addEventListener('load', () => URL.revokeObjectURL(url));

        const name = document.createElement('div');
        name.className = 'image-name';
        name.textContent = filename;
        name.style.textAlign = 'center';
        name.style.marginTop = '10px';

        wrapper.appendChild(img);
        wrapper.appendChild(name);
        imageContainer.appendChild(wrapper);
    }

    function clearLeftPane() {
        fileList.innerHTML = '';
    }

    function clearRightPane() {
        rightPane.innerHTML = '';
        imageContainer.innerHTML = ''; // Ensure no leftover images
    }

    function createLoader() {
        let loader = document.getElementById('loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'loader';
            loader.style.display = 'none';
            loader.textContent = 'Loading...';
            document.body.appendChild(loader);
        }
        return loader;
    }

    function showLoader() {
        loader.style.display = 'block';
    }

    function hideLoader() {
        loader.style.display = 'none';
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        setTimeout(() => errorMessage.style.display = 'none', 5000);
    }

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function addGoBackOption() {
        const goBackElement = document.createElement('div');
        goBackElement.className = 'folder';
        goBackElement.textContent = '.. (Go Back)';
        goBackElement.onclick = () => {
            if (historyStack.length > 1) {
                historyStack.pop();
                displayFolderContents(historyStack[historyStack.length - 1]);
            }
        };
        fileList.appendChild(goBackElement);
    }

    // Expose selectDirectory globally for onclick usage
    window.selectDirectory = selectDirectory;
});
