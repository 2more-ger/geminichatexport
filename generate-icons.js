const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'icon-option2.svg');
const outputDir = path.join(__dirname, 'chrome-extension', 'icons');

// Stelle sicher, dass das Ausgabe-Verzeichnis existiert
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const sizes = [16, 48, 128];

console.log('Generiere PNG Icons aus Option 2...');

sizes.forEach(size => {
  sharp(svgPath)
    .resize(size, size)
    .png()
    .toFile(path.join(outputDir, `icon-${size}.png`))
    .then(() => console.log(`✓ icon-${size}.png erfolgreich erstellt!`))
    .catch(err => console.error(`✗ Fehler bei icon-${size}.png:`, err));
});