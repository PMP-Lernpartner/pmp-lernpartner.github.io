/* Kopiert die Lern-App aus dem Hauptordner nach www/, damit Capacitor sie in die APK packt.
 * Der Service Worker bleibt draußen: In der Android-App liegen alle Dateien ohnehin lokal. */
const fs = require('fs');
const path = require('path');

const quelle = path.resolve(__dirname, '..');
const ziel = path.join(__dirname, 'www');
const dateien = ['index.html', 'app.css', 'app.js', 'config.js', 'manifest.webmanifest'];

fs.rmSync(ziel, { recursive: true, force: true });
fs.mkdirSync(path.join(ziel, 'icons'), { recursive: true });
dateien.forEach((d) => fs.copyFileSync(path.join(quelle, d), path.join(ziel, d)));
fs.readdirSync(path.join(quelle, 'icons')).forEach((d) =>
  fs.copyFileSync(path.join(quelle, 'icons', d), path.join(ziel, 'icons', d)));
console.log('Lern-App nach www/ kopiert: ' + dateien.length + ' Dateien und Icons.');
