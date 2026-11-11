package io.github.pmplernpartner;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Lernstand sichern und laden. In der Lern-App erreichbar als window.Capacitor.Plugins.Datei.
 *
 * Seit Lern-App 1.6.0 (ab Android 10): sichern / sicherungen / lesen arbeiten direkt im Ordner
 * Download/PMP-Lernpartner über MediaStore – ohne Dialog und ohne Berechtigungen. Android zeigt
 * der App dabei nur die Dateien, die sie selbst angelegt hat.
 *
 * Rückfall und "Andere Datei wählen…": speichern / oeffnen über die Dateiauswahl von Android
 * (Storage Access Framework, ACTION_CREATE_DOCUMENT und ACTION_OPEN_DOCUMENT).
 */
@CapacitorPlugin(name = "Datei")
public class DateiPlugin extends Plugin {

    private static final long MAX_BYTES = 20L * 1024 * 1024;
    private static final String ORDNER = "Download/PMP-Lernpartner/";
    private static final String ORDNER_ANZEIGE = "Download/PMP-Lernpartner";

    /** MediaStore speichert den Ordner mit Schrägstrich am Ende; zur Sicherheit beide Schreibweisen suchen. */
    private static final String ORDNER_BEDINGUNG = MediaStore.MediaColumns.RELATIVE_PATH + " IN (?, ?)";
    private static final String[] ORDNER_WERTE = new String[] { ORDNER, "Download/PMP-Lernpartner" };

    /** sichern({ name, inhalt, mime }) → { name, ort } · vor Android 10: reject mit Code NICHT_MOEGLICH */
    @PluginMethod
    public void sichern(PluginCall call) {
        String inhalt = call.getString("inhalt");
        if (inhalt == null) {
            call.reject("Kein Inhalt zum Speichern.");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Direktes Speichern gibt es erst ab Android 10.", "NICHT_MOEGLICH");
            return;
        }
        String name = call.getString("name", "pmp-lernstand.json");
        byte[] daten = inhalt.getBytes(StandardCharsets.UTF_8);
        ContentResolver cr = getContext().getContentResolver();
        Uri sammlung = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
        try {
            // Gleicher Name am selben Tag: die eigene Datei überschreiben statt "… (1).json" anzulegen.
            Uri ziel = null;
            try (Cursor c = cr.query(sammlung, new String[] { MediaStore.MediaColumns._ID },
                    ORDNER_BEDINGUNG + " AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?",
                    new String[] { ORDNER_WERTE[0], ORDNER_WERTE[1], name }, null)) {
                if (c != null && c.moveToFirst()) ziel = ContentUris.withAppendedId(sammlung, c.getLong(0));
            }
            if (ziel != null) {
                schreibe(ziel, daten);
            } else {
                ContentValues werte = new ContentValues();
                werte.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                werte.put(MediaStore.MediaColumns.MIME_TYPE, call.getString("mime", "application/json"));
                werte.put(MediaStore.MediaColumns.RELATIVE_PATH, ORDNER);
                werte.put(MediaStore.MediaColumns.IS_PENDING, 1);
                ziel = cr.insert(sammlung, werte);
                if (ziel == null) throw new Exception("Datei lässt sich nicht anlegen.");
                try {
                    schreibe(ziel, daten);
                } catch (Exception e) {
                    cr.delete(ziel, null, null);
                    throw e;
                }
                ContentValues fertig = new ContentValues();
                fertig.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(ziel, fertig, null, null);
            }
            JSObject ret = new JSObject();
            ret.put("name", anzeigeName(ziel));
            ret.put("ort", ORDNER_ANZEIGE);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Speichern fehlgeschlagen: " + e.getMessage(), e);
        }
    }

    /** sicherungen() → { moeglich, ort, liste: [{ id, name, groesse, geaendert }] } – neueste zuerst */
    @PluginMethod
    public void sicherungen(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ort", ORDNER_ANZEIGE);
        JSArray liste = new JSArray();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            ret.put("moeglich", false);
            ret.put("liste", liste);
            call.resolve(ret);
            return;
        }
        String[] spalten = new String[] {
            MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED
        };
        try (Cursor c = getContext().getContentResolver().query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, spalten,
                ORDNER_BEDINGUNG, ORDNER_WERTE,
                MediaStore.MediaColumns.DATE_MODIFIED + " DESC")) {
            while (c != null && c.moveToNext()) {
                String name = c.getString(1);
                if (name == null || !name.toLowerCase().endsWith(".json")) continue;
                JSObject e = new JSObject();
                e.put("id", String.valueOf(c.getLong(0)));
                e.put("name", name);
                e.put("groesse", c.getLong(2));
                e.put("geaendert", c.getLong(3) * 1000L);
                liste.put(e);
            }
            ret.put("moeglich", true);
            ret.put("liste", liste);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Sicherungen lassen sich nicht lesen: " + e.getMessage(), e);
        }
    }

    /** lesen({ id }) → { name, inhalt } – eine Datei aus sicherungen() */
    @PluginMethod
    public void lesen(PluginCall call) {
        String id = call.getString("id");
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Direktes Lesen gibt es erst ab Android 10.", "NICHT_MOEGLICH");
            return;
        }
        if (id == null) {
            call.reject("Keine Sicherung gewählt.");
            return;
        }
        try {
            Uri uri = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, Long.parseLong(id));
            JSObject ret = new JSObject();
            ret.put("name", anzeigeName(uri));
            ret.put("inhalt", liesText(uri));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Öffnen fehlgeschlagen: " + e.getMessage(), e);
        }
    }

    /** speichern({ name, inhalt, mime }) → { name } · Abbruch: reject mit Code ABGEBROCHEN */
    @PluginMethod
    public void speichern(PluginCall call) {
        if (call.getString("inhalt") == null) {
            call.reject("Kein Inhalt zum Speichern.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/json"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "pmp-lernstand.json"));
        startActivityForResult(call, intent, "speichernErgebnis");
    }

    @ActivityCallback
    private void speichernErgebnis(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = gewaehlt(result);
        if (uri == null) {
            call.reject("Abgebrochen", "ABGEBROCHEN");
            return;
        }
        byte[] daten = call.getString("inhalt", "").getBytes(StandardCharsets.UTF_8);
        try {
            schreibe(uri, daten);
            JSObject ret = new JSObject();
            ret.put("name", anzeigeName(uri));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Speichern fehlgeschlagen: " + e.getMessage(), e);
        }
    }

    /** oeffnen() → { name, inhalt } · Abbruch: reject mit Code ABGEBROCHEN */
    @PluginMethod
    public void oeffnen(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // Alle Dateien zeigen: Manche Ordner melden .json als application/octet-stream. Geprüft wird in der Lern-App.
        intent.setType("*/*");
        startActivityForResult(call, intent, "oeffnenErgebnis");
    }

    @ActivityCallback
    private void oeffnenErgebnis(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = gewaehlt(result);
        if (uri == null) {
            call.reject("Abgebrochen", "ABGEBROCHEN");
            return;
        }
        try {
            JSObject ret = new JSObject();
            ret.put("name", anzeigeName(uri));
            ret.put("inhalt", liesText(uri));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Öffnen fehlgeschlagen: " + e.getMessage(), e);
        }
    }

    private String liesText(Uri uri) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        try (InputStream in = cr.openInputStream(uri)) {
            if (in == null) throw new Exception("Datei lässt sich nicht lesen.");
            ByteArrayOutputStream puffer = new ByteArrayOutputStream();
            byte[] block = new byte[8192];
            long summe = 0;
            int n;
            while ((n = in.read(block)) != -1) {
                summe += n;
                if (summe > MAX_BYTES) throw new Exception("Datei ist zu groß für einen Lernstand.");
                puffer.write(block, 0, n);
            }
            return new String(puffer.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private Uri gewaehlt(ActivityResult result) {
        if (result == null || result.getResultCode() != Activity.RESULT_OK) return null;
        Intent data = result.getData();
        return data == null ? null : data.getData();
    }

    /** Erst "wt" (überschreiben), sonst "w" – nicht jeder Speicheranbieter kennt "wt". */
    private void schreibe(Uri uri, byte[] daten) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        OutputStream out;
        try {
            out = cr.openOutputStream(uri, "wt");
        } catch (Exception e) {
            out = cr.openOutputStream(uri, "w");
        }
        if (out == null) throw new Exception("Datei lässt sich nicht schreiben.");
        try (OutputStream o = out) {
            o.write(daten);
            o.flush();
        }
    }

    private String anzeigeName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String name = c.getString(0);
                if (name != null) return name;
            }
        } catch (Exception ignored) {
            // Name ist nur für die Meldung; ohne ihn geht es auch.
        }
        String letzter = uri.getLastPathSegment();
        return letzter != null ? letzter : "Datei";
    }
}
