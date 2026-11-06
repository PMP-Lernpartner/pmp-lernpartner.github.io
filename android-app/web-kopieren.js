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
// Versionsnummer der APK für den Update-Hinweis (GitHub Actions setzt VERSION_CODE = Laufnummer).
const code = parseInt(process.env.VERSION_CODE || '', 10);
if (code > 0) {
  const html = path.join(ziel, 'index.html');
  const marke = '<script src="config.js';
  const inhalt = fs.readFileSync(html, 'utf8');
  if (!inhalt.includes(marke)) throw new Error('index.html: Einfügestelle für die Versionsnummer fehlt');
  fs.writeFileSync(html, inhalt.replace(marke,
    '<script>window.PMP_BUILD={versionCode:' + code + ',versionName:"1.1.' + code + '"};</script>\n' + marke));
  console.log('Versionsnummer eingesetzt: 1.1.' + code);
} else {
  console.log('Keine VERSION_CODE gesetzt: Update-Hinweis in dieser APK aus.');
}
console.log('Lern-App nach www/ kopiert: ' + dateien.length + ' Dateien und Icons.');
