package io.github.pmplernpartner;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
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
 * Lernstand sichern und laden über die Dateiauswahl von Android (Storage Access Framework):
 * "Speichern unter" (ACTION_CREATE_DOCUMENT) und "Öffnen" (ACTION_OPEN_DOCUMENT).
 * Sascha wählt Ordner und Namen selbst, z. B. "Downloads". Es werden keine Berechtigungen gebraucht.
 * In der Lern-App erreichbar als window.Capacitor.Plugins.Datei.
 */
@CapacitorPlugin(name = "Datei")
public class DateiPlugin extends Plugin {

    private static final long MAX_BYTES = 20L * 1024 * 1024;

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
            JSObject ret = new JSObject();
            ret.put("name", anzeigeName(uri));
            ret.put("inhalt", new String(puffer.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Öffnen fehlgeschlagen: " + e.getMessage(), e);
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
