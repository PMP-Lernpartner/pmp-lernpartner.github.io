# PMP-Lernpartner

Persönliche Lern-Web-App für die PMP-Prüfung: zeigt Fragen aus der eigenen Fragenbank (privates Google Sheet oder lokale CSV-Datei), wertet jede Antwort sofort aus und speichert den Lernstand nur auf dem eigenen Gerät.

- Läuft als installierbare Web-App (PWA) über GitHub Pages: https://pmp-lernpartner.github.io/
- Android-App (Capacitor) mit eigenen täglichen Erinnerungen: Ordner `android-app/`, gebaut über GitHub Actions; Download unter Releases
- Keine Adressen oder Schlüssel im Code: Jeder verbindet die App selbst (Einstellungen → Datenquelle), beim Google Sheet per Verbindungscode des Apps Scripts
- Keine persönlichen Daten im Repository, kein Server, keine Kosten

## Quellen und Hinweise

- **Zweck:** Private, nicht-kommerzielle Lernhilfe zur Vorbereitung auf die PMP-Prüfung; ersetzt keine offiziellen Unterlagen.
- **Keine Fragen enthalten:** Die App liefert keine Fragen mit. Die Fragenbank stellt jede Person selbst bereit oder erzeugt sie selbst (eigenes Google Sheet oder CSV-Datei) und ist für ihren Inhalt selbst verantwortlich.
- **Quellen der Inhalte:** Übersichten, Formeln und Erklärungen beruhen auf frei zugänglichen, öffentlich verfügbaren Informationen; Teile sind mit KI erstellt. Texte aus Veröffentlichungen des PMI oder aus Büchern werden nicht übernommen.
  - Prozessübersicht: eigene Darstellung nach der Struktur des PMBOK Guide 8
  - Earned Value: gängige Earned-Value-Formeln; Beispiele, Zahlen und Texte sind eigene
- **Marken:** PMI, PMP und PMBOK sind eingetragene Marken des Project Management Institute, Inc. Dieses Projekt steht in keiner Verbindung zum PMI und wird vom PMI weder unterstützt noch geprüft.
- **Keine Gewähr:** Ohne Gewähr für Richtigkeit, Vollständigkeit oder Prüfungserfolg. Maßgeblich sind die offiziellen Unterlagen des PMI.

Derselbe Text steht in der App unter Einstellungen → Rechtliches → Quellen und Hinweise.
