# PMP-Lernpartner – Android-App

Capacitor-Hülle um die Lern-App im Hauptordner. Der Code der Lern-App wird beim Bauen nach `www/` kopiert
(`web-kopieren.js`) und in die APK gepackt. Nur in der Android-App plant das Handy die täglichen Erinnerungen
selbst (Plugin `@capacitor/local-notifications`); der Lernstand wird dort über „Teilen“ exportiert.

- **Bauen:** GitHub Actions (`.github/workflows/android.yml`) bei jeder Änderung an der Lern-App oder an diesem Ordner.
- **Herunterladen:** https://github.com/PMP-Lernpartner/pmp-lernpartner.github.io/releases/latest/download/PMP-Lernpartner.apk
- **Paketname:** `io.github.pmplernpartner` – nie ändern, sonst lässt sich die App nicht mehr aktualisieren.
- **Signatur:** Der Schlüssel liegt nicht im Repository, sondern nur in den Secrets `KEYSTORE_BASE64` und
  `KEYSTORE_PASSWORD` und als Sicherungskopie bei Sascha.
