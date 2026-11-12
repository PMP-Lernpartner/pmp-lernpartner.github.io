/* PMP-Lernpartner – Lern-App (Version 1.9.1, 12.11.2026)
 * Liest die Fragenbank aus der selbst verbundenen Datenquelle (eigenes Google Sheet über die
 * Skript-Schnittstelle mit persönlichem Schlüssel, oder eine lokale CSV-Datei), zeigt Fragensets, Fragen und Feedback
 * und speichert den Lernstand nur auf diesem Gerät (localStorage).
 * Läuft im Browser (PWA) und als Android-App (Capacitor); nur in der Android-App
 * plant das Handy die täglichen Erinnerungen selbst.
 */
(function () {
  'use strict';

  var CFG = window.PMP_CONFIG || {};
  var APP_VERSION = '1.9.1';
  var SPEICHER = 'pmplp.v1';
  var CSV_SPEICHER = 'pmplp.csv';
  /* Datenquelle (seit 1.8.0, Entscheidung 32): steht nur auf diesem Gerät, nie im Code.
   * { art: 'sheet', url: '…/exec', schluessel: '…', name: '…' } oder { art: 'datei', name: '…' } */
  var QUELLE_SPEICHER = 'pmplp.quelle';
  var PFLICHT = ['id', 'frage', 'a', 'b', 'c', 'd', 'loesung'];
  var SPALTEN = ['id', 'aktiv', 'domain', 'focus_area', 'prozess', 'eco', 'eco_titel', 'approach', 'konzept', 'frage', 'a', 'b', 'c', 'd',
    'loesung', 'warum', 'warum_nicht', 'referenz', 'merksatz', 'paket', 'notiz'];
  var TAG_MS = 86400000;
  var ECO_ZIEL = { I: 0.33, II: 0.41, III: 0.26 };
  var ECO_NAME = { I: 'People', II: 'Process', III: 'Business Environment' };
  var DOMAINS = ['Governance', 'Scope', 'Schedule', 'Finance', 'Stakeholders', 'Resources', 'Risk'];
  var FOCUS = ['Initiating', 'Planning', 'Executing', 'Monitoring and Controlling', 'Closing'];
  /* Die 40 Prozesse des PMBOK Guide 8 nach Performance Domain und Focus Area.
   * Eigene Darstellung nach der Struktur des PMBOK Guide 8 (Projektgrundlage Abschnitt 11). */
  var PROZESSE = {
    Governance: { Initiating: ['Initiate Project or Phase'], Planning: ['Integrate and Align Project Plans', 'Plan Sourcing Strategy'],
      Executing: ['Manage Project Execution', 'Manage Quality Assurance', 'Manage Project Knowledge'],
      'Monitoring and Controlling': ['Monitor and Control Project Performance', 'Assess and Implement Changes'], Closing: ['Close Project or Phase'] },
    Scope: { Planning: ['Plan Scope Management', 'Elicit and Analyze Requirements', 'Define Scope', 'Develop Scope Structure'],
      'Monitoring and Controlling': ['Monitor and Control Scope', 'Validate Scope'] },
    Schedule: { Planning: ['Plan Schedule Management', 'Develop Schedule'], 'Monitoring and Controlling': ['Monitor and Control Schedule'] },
    Finance: { Planning: ['Plan Financial Management', 'Estimate Costs', 'Develop Budget'],
      'Monitoring and Controlling': ['Monitor and Control Finances'] },
    Stakeholders: { Initiating: ['Identify Stakeholders'], Planning: ['Plan Stakeholder Engagement', 'Plan Communications Management'],
      Executing: ['Manage Stakeholder Engagement', 'Manage Communications'],
      'Monitoring and Controlling': ['Monitor Stakeholder Engagement', 'Monitor Communications'] },
    Resources: { Planning: ['Plan Resource Management', 'Estimate Resources'], Executing: ['Acquire Resources', 'Lead the Team'],
      'Monitoring and Controlling': ['Monitor and Control Resourcing'] },
    Risk: { Planning: ['Plan Risk Management', 'Identify Risks', 'Perform Risk Analysis', 'Plan Risk Responses'],
      Executing: ['Implement Risk Responses'], 'Monitoring and Controlling': ['Monitor Risks'] },
  };
  var PRINCIPLES = ['Adopt a holistic view', 'Focus on value', 'Embed quality', 'Be an accountable leader', 'Integrate sustainability', 'Build empowered teams'];

  /* ---------- Zustand ---------- */

  var S = ladeZustand();
  var fragen = [];          // nur aktive Fragen
  var alleZeilen = 0;       // Zeilen im Sheet
  var nachId = {};
  var datenStand = null;    // Zeitpunkt der geladenen CSV
  var ladeFehler = '';
  var sitzung = { id: null, phase: 'frage', antwort: null, vorher: null, quelle: 'lernen', durch: false };
  var vorrat = { stand: 0, laedt: false, bereit: null, fehler: '', meldung: '' };
  var ui = { statModus: 'domain', filter: 'alle', bestaetigen: null, statOffen: {}, setsVon: '#/einstellungen', uebModus: 'prozesse', evTeil: 'merkhilfe',
    rechner: { bac: '10000', plan: '40', fertig: '50', ac: '4000', zeit: '', dauer: '' } };

  function ladeZustand() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(SPEICHER) || '{}') || {}; } catch (e) { s = {}; }
    return normalisiere(s);
  }
  function normalisiere(s) {
    return {
      v: 1,
      theme: s.theme || 'auto',
      aktivesSet: s.aktivesSet || 'alle',
      antworten: s.antworten || {},
      fehler: s.fehler || {},
      reset: s.reset || {},
      zaehler: s.zaehler || 0,
      offen: s.offen || null,
      name: typeof s.name === 'string' ? s.name.slice(0, 40) : '',
      erinnerung: normErinnerung(s.erinnerung),
    };
  }
  function normErinnerung(e) {
    e = e || {};
    var zeiten = Array.isArray(e.zeiten) ? e.zeiten.filter(function (z) { return /^\d{2}:\d{2}$/.test(z); }) : [];
    return { an: e.an !== false, zeiten: zeiten.length === 3 ? zeiten : ['07:00', '12:00', '18:00'] };
  }
  function speichere() {
    try { localStorage.setItem(SPEICHER, JSON.stringify(S)); } catch (e) {}
  }

  /* ---------- Hilfen ---------- */

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tagSchluessel(ts) { var d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function datumKurz(ts) { var d = new Date(ts); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; }
  function datumZeit(ts) { var d = new Date(ts); return datumKurz(ts) + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' Uhr'; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function prozent(ok, n) { return n ? Math.round((ok / n) * 100) : null; }
  function setNummer(key) { var n = parseInt(String(key).replace(/\D/g, ''), 10); return isNaN(n) ? key : n; }
  /* Pakete ME1, ME2 … sind Probeprüfungen (Mock Exam) und heißen „Mock Exam 1“ usw. (seit 1.9.1). */
  function mockNummer(key) { var m = /^ME(\d+)$/i.exec(String(key)); return m ? parseInt(m[1], 10) : null; }
  function setName(key) {
    if (key === 'alle') return 'Alle Sets';
    var me = mockNummer(key);
    return me !== null ? 'Mock Exam ' + me : 'Set ' + setNummer(key);
  }
  function setRang(key) { var me = mockNummer(key); return me !== null ? 100000 + me : setNummer(key); }
  function ecoDomain(q) { return String(q.eco || '').split('-')[0].trim(); }

  var IKON = {
    haken: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    zahnrad: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    pfeil: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
    links: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    rechts: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    ok: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>',
    hilfe: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    lampe: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:2px;color:var(--accent-text)"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z"/></svg>',
    wieder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
    lernen: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/></svg>',
    sets: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    uebersicht: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>',
    statistik: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h18"/><path d="M6 16v-5"/><path d="M11 16V6"/><path d="M16 16v-8"/><path d="M21 16v-3"/></svg>',
  };

  /* ---------- Android-App: Erinnerungen und Export ---------- */

  var CAP = window.Capacitor;
  var NATIV = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  var PLUG = (NATIV && CAP.Plugins) || {};
  var LN = PLUG.LocalNotifications || null;
  var ERINNERUNG_IDS = [701, 702, 703];
  var TEST_ID = 799;
  var erin = { erlaubt: null, geplant: 0, fehler: '', laeuft: null };

  /* ---------- Android-App: Update-Hinweis ----------
   * Die Versionsnummer der installierten APK setzt web-kopieren.js beim Build als window.PMP_BUILD ein.
   * Die neueste Version liest die Android-App aus dem letzten GitHub-Release (Kennung android-<Nr>).
   * Geprüft wird höchstens alle 6 Stunden (GitHub erlaubt ohne Anmeldung 60 Abfragen pro Stunde) und von Hand. */
  var BUILD = window.PMP_BUILD || null;
  var RELEASE_API = 'https://api.github.com/repos/PMP-Lernpartner/pmp-lernpartner.github.io/releases/latest';
  var APK_URL = 'https://github.com/PMP-Lernpartner/pmp-lernpartner.github.io/releases/latest/download/PMP-Lernpartner.apk';
  var UPDATE_SPEICHER = 'pmplp.update';
  var upd = { neu: 0, name: '', geprueft: 0, laeuft: false, fehler: '' };
  try {
    var u0 = JSON.parse(localStorage.getItem(UPDATE_SPEICHER) || 'null');
    if (u0) { upd.neu = Number(u0.neu) || 0; upd.name = u0.name || ''; upd.geprueft = Number(u0.geprueft) || 0; }
  } catch (e) {}
  function installiert() { return NATIV && BUILD && Number(BUILD.versionCode) > 0 ? Number(BUILD.versionCode) : 0; }
  function updateDa() { return installiert() > 0 && upd.neu > installiert(); }
  function pruefeUpdate(vonHand) {
    if (!installiert() || upd.laeuft) return Promise.resolve();
    if (!vonHand && Date.now() - upd.geprueft < 6 * 3600000) return Promise.resolve();
    upd.laeuft = true; upd.fehler = '';
    return fetch(RELEASE_API, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } }).then(function (r) {
      if (!r.ok) throw new Error('GitHub antwortet mit ' + r.status);
      return r.json();
    }).then(function (j) {
      var m = /^android-(\d+)$/.exec((j && j.tag_name) || '');
      if (!m) throw new Error('Unbekannte Release-Kennung');
      upd.neu = Number(m[1]); upd.name = j.name || ('Android-App 1.1.' + m[1]); upd.geprueft = Date.now();
      try { localStorage.setItem(UPDATE_SPEICHER, JSON.stringify({ neu: upd.neu, name: upd.name, geprueft: upd.geprueft })); } catch (e) {}
    }).catch(function (e) {
      upd.fehler = String((e && e.message) || e);
    }).then(function () { upd.laeuft = false; });
  }
  function updateHinweis() {
    if (!updateDa()) return '';
    return '<section class="karte update"><span class="ueber">Neue Version verfügbar</span>' +
      '<p><b>' + esc(upd.name) + '</b> steht bereit. Installiert ist ' + esc(BUILD.versionName || ('1.1.' + installiert())) + '.</p>' +
      '<p class="leise">Die neue Version <b>über die alte installieren</b>, nicht vorher deinstallieren – sonst ist der Lernstand weg. Zur Sicherheit vorher den Lernstand sichern.</p>' +
      '<div class="knopfreihe" style="grid-template-columns:1fr 1fr"><button class="knopf zweit klein" data-update-sichern>Lernstand sichern</button>' +
      '<a class="knopf klein" href="' + APK_URL + '">Neue Version laden</a></div></section>';
  }
  function versionsKarte() {
    if (!NATIV) return '';
    if (!installiert()) return '<section class="karte"><span class="ueber">Version</span><p>Lern-App ' + APP_VERSION + '</p>' +
      '<p class="leise">Diese Android-App wurde ohne Versionsnummer gebaut; der Update-Hinweis ist aus.</p></section>';
    var status = upd.laeuft ? 'Prüfe …' : upd.fehler ? 'Prüfung fehlgeschlagen: ' + esc(upd.fehler)
      : !upd.geprueft ? 'Noch nicht geprüft.' : updateDa() ? esc(upd.name) + ' ist verfügbar.'
      : 'Aktuell – geprüft am ' + esc(datumZeit(upd.geprueft)) + '.';
    return '<section class="karte"><span class="ueber">Version</span><p>Android-App ' + esc(BUILD.versionName || ('1.1.' + installiert())) +
      ' · Lern-App ' + APP_VERSION + '</p><p class="leise">' + status + '</p>' +
      '<button class="knopf zweit klein" data-update-pruefen' + (upd.laeuft ? ' disabled' : '') + '>Nach Updates suchen</button></section>';
  }
  function bindeUpdate() {
    var s = app.querySelector('[data-update-sichern]');
    if (s) s.addEventListener('click', function () { if (dateiNativ()) location.hash = '#/export'; else exportiere(); });
  }

  /* Seit Lern-App 1.6.0: Die Erinnerung nennt die Frage, die als nächste kommt (S.offen = vorgemerkte Frage),
     und ein Tipp öffnet genau diese. Vorher stand dort eine zufällige Domain ohne Bezug zur Frage. */
  function vorgemerkteFrage() {
    if (!fragen.length) return null;
    if (S.offen && nachId[S.offen] && fragenImSet(S.aktivesSet).some(function (q) { return q.id === S.offen; })) return nachId[S.offen];
    var r = waehleFrage(S.aktivesSet, sitzung.quelle === 'lernen' ? sitzung.id : null);
    if (!r.q) return null;
    S.offen = r.q.id; speichere();
    return r.q;
  }
  function erinnerungsText(q) {
    if (!q) return 'Eine Frage wartet auf dich.';
    var teile = [q.domain, q.prozess].filter(Boolean).join(' · ');
    return (S.fehler[q.id] ? 'Wiederholung: ' : 'Nächste Frage: ') + (teile || 'PMP');
  }
  function erinnerungsNachricht(id, schedule, q) {
    return { id: id, title: 'PMP: Zeit für eine Frage', body: erinnerungsText(q), channelId: 'erinnerungen',
      schedule: schedule, extra: { ziel: '#/frage', frage: q ? q.id : '' } };
  }
  function erlaubnis(fragen) {
    return LN.checkPermissions().then(function (p) {
      if (p.display === 'granted' || !fragen) return p;
      return p.display === 'denied' ? p : LN.requestPermissions();
    }).then(function (p) { erin.erlaubt = p.display === 'granted'; return erin.erlaubt; });
  }
  /* Plant die drei täglichen Erinnerungen neu (beim Start, nach Änderungen, beim Zurückkehren in die App). */
  function planeErinnerungen(mitNachfrage) {
    if (!LN) return Promise.resolve();
    // Läuft schon eine Planung, danach noch einmal planen (z. B. nach einer Antwort steht eine neue Frage an).
    if (erin.laeuft) { erin.nochmal = true; return erin.laeuft; }
    var e = S.erinnerung;
    var q = vorgemerkteFrage();
    erin.laeuft = LN.cancel({ notifications: ERINNERUNG_IDS.map(function (id) { return { id: id }; }) })
      .catch(function () {})
      .then(function () {
        if (!e.an) { erin.geplant = 0; return; }
        return erlaubnis(mitNachfrage !== false).then(function (ok) {
          if (!ok) { erin.geplant = 0; return; }
          return LN.createChannel({ id: 'erinnerungen', name: 'Erinnerungen', description: 'Tägliche Lernerinnerungen', importance: 4, visibility: 1, vibration: true })
            .catch(function () {})
            .then(function () {
              return LN.schedule({ notifications: e.zeiten.map(function (z, i) {
                var t = z.split(':');
                return erinnerungsNachricht(ERINNERUNG_IDS[i], { on: { hour: +t[0], minute: +t[1] }, allowWhileIdle: true, isExactNotification: false }, q);
              }) });
            })
            .then(function () { erin.geplant = e.zeiten.length; erin.fehler = ''; });
        });
      })
      .catch(function (err) { erin.fehler = String((err && err.message) || err); })
      .then(function () {
        erin.laeuft = null;
        if (erin.nochmal) { erin.nochmal = false; return planeErinnerungen(false); }
      });
    return erin.laeuft;
  }
  function testErinnerung() {
    if (!LN) return Promise.resolve();
    return erlaubnis(true).then(function (ok) {
      if (!ok) throw new Error('Benachrichtigungen sind für die App nicht erlaubt.');
      return LN.schedule({ notifications: [erinnerungsNachricht(TEST_ID, { at: new Date(Date.now() + 60000), allowWhileIdle: true, isExactNotification: false }, vorgemerkteFrage())] });
    });
  }
  if (LN) {
    LN.addListener('localNotificationActionPerformed', function (a) {
      var extra = (a && a.notification && a.notification.extra) || {};
      var ziel = extra.ziel || '#/frage';
      // Genau die Frage öffnen, die in der Erinnerung stand
      if (extra.frage && nachId[extra.frage] && !(sitzung.quelle === 'lernen' && sitzung.id === extra.frage)) {
        sitzung = { id: extra.frage, phase: 'frage', antwort: null, quelle: 'lernen', durch: false };
        S.offen = extra.frage; speichere();
      }
      if (location.hash !== ziel) location.hash = ziel; else render();
    });
  }
  /* Nur noch Rückfall für Android-Apps ohne DateiPlugin (vor 1.1.8): Datei im Cache ablegen und über "Teilen" speichern. */
  function exportiereNativ(name, daten) {
    var FS = PLUG.Filesystem, SH = PLUG.Share;
    if (!FS || !SH) return Promise.reject(new Error('Export ist in dieser Version nicht verfügbar.'));
    return FS.writeFile({ path: name, data: daten, directory: 'CACHE', encoding: 'utf8' })
      .then(function (r) { return SH.share({ title: 'PMP-Lernstand', files: [r.uri], dialogTitle: 'Lernstand speichern' }); });
  }

  /* ---------- CSV ---------- */

  function parseCsv(text) {
    var zeilen = [], zeile = [], feld = '', i = 0, inQ = false;
    text = text.replace(/^﻿/, '');
    while (i < text.length) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { feld += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        feld += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { zeile.push(feld); feld = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { zeile.push(feld); zeilen.push(zeile); zeile = []; feld = ''; i++; continue; }
      feld += c; i++;
    }
    if (feld !== '' || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
    return zeilen;
  }

  /* Prüft und übernimmt eine Fragenbank als CSV-Text. Pflichtspalten: id, frage, a–d, loesung.
   * Alle übrigen Spalten sind wahlweise; fehlt "aktiv", gelten alle Fragen als aktiv.
   * Wirft einen Fehler, ohne die bisher geladenen Fragen anzutasten. */
  function pruefeCsv(text) {
    var z = parseCsv(String(text || '').replace(/^﻿/, ''));
    if (!z.length) throw new Error('Leere Fragenbank');
    var kopf = z[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var fehlt = PFLICHT.filter(function (h) { return kopf.indexOf(h) < 0; });
    if (fehlt.length) throw new Error('Spalten fehlen: ' + fehlt.join(', ') + ' (erste Zeile muss die Spaltenköpfe enthalten)');
    var mitAktiv = kopf.indexOf('aktiv') >= 0;
    var liste = [], zeilen = 0;
    for (var r = 1; r < z.length; r++) {
      if (z[r].join('').trim() === '') continue;
      zeilen++;
      var q = {};
      SPALTEN.forEach(function (h) { q[h] = ''; });
      kopf.forEach(function (h, i) { q[h] = String(z[r][i] == null ? '' : z[r][i]).trim(); });
      if (!q.id || !q.frage) continue;
      if (mitAktiv && q.aktiv.toLowerCase() !== 'ja') continue;
      if (!q.paket) q.paket = q.id.indexOf('-') > 0 ? q.id.split('-')[0] : 'P01';
      q.loesung = q.loesung.toUpperCase();
      if (!/^[ABCD]$/.test(q.loesung)) continue;
      liste.push(q);
    }
    if (!liste.length) throw new Error('Keine aktiven Fragen gefunden');
    return { liste: liste, zeilen: zeilen };
  }
  function uebernehmeCsv(text, stand) {
    var e = pruefeCsv(text);
    fragen = e.liste;
    alleZeilen = e.zeilen;
    nachId = {};
    fragen.forEach(function (q) { nachId[q.id] = q; });
    datenStand = stand;
    if (S.aktivesSet !== 'alle' && !setKeys().some(function (k) { return k === S.aktivesSet; })) S.aktivesSet = 'alle';
  }
  function merkeCsv(text, stand) {
    try { localStorage.setItem(CSV_SPEICHER, JSON.stringify({ text: text, stand: stand })); } catch (e) {}
  }
  function gemerkteCsv() {
    try { var c = JSON.parse(localStorage.getItem(CSV_SPEICHER) || 'null'); return c && c.text ? c : null; } catch (e) { return null; }
  }

  function ladeAusSpeicher() {
    var c = gemerkteCsv();
    if (!c) return false;
    try { uebernehmeCsv(c.text, c.stand); return true; } catch (e) { return false; }
  }

  /* ---------- Datenquelle (seit 1.8.0) ---------- */

  var Q = ladeQuelle();
  function ladeQuelle() {
    try {
      var q = JSON.parse(localStorage.getItem(QUELLE_SPEICHER) || 'null');
      if (q && q.art === 'sheet' && q.url && q.schluessel) return q;
      if (q && q.art === 'datei') return q;
    } catch (e) {}
    return null;
  }
  function speichereQuelle(q) {
    Q = q;
    try { if (q) localStorage.setItem(QUELLE_SPEICHER, JSON.stringify(q)); else localStorage.removeItem(QUELLE_SPEICHER); } catch (e) {}
  }
  function istSheet() { return !!(Q && Q.art === 'sheet'); }
  function quelleText() {
    if (!Q) return 'Keine Datenquelle verbunden';
    return Q.art === 'sheet' ? 'Google Sheet „' + (Q.name || 'Fragenbank') + '“' : 'Lokale Datei „' + (Q.name || 'Fragen.csv') + '“';
  }

  /* Verbindungscode aus Skript 3.0: "PMPLP1." + Base64url von {u: Adresse der Skript-Schnittstelle, k: Schlüssel}.
   * Angenommen wird auch ein ganzer Text, in dem der Code steckt (z. B. der Link aus der Mail). */
  function leseCode(text) {
    var m = /PMPLP1\.([A-Za-z0-9_-]+)/.exec(String(text || ''));
    if (!m) throw new Error('Das ist kein Verbindungscode. Er beginnt mit „PMPLP1.“ und steht im Tab „Verbindung“ deiner Fragenbank.');
    var b = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var j = null;
    try { j = JSON.parse(decodeURIComponent(escape(atob(b)))); } catch (e) { j = null; }
    if (!j || typeof j.u !== 'string' || !/^https:\/\/script\.google\.com\/.+\/exec$/.test(j.u) || typeof j.k !== 'string' || j.k.length < 16) {
      throw new Error('Der Verbindungscode ist unvollständig. Bitte den ganzen Code kopieren.');
    }
    return { art: 'sheet', url: j.u, schluessel: j.k };
  }
  function codeAusUrl(url) {
    var m = /\/verbinden\/(?:#c=)?(PMPLP1\.[A-Za-z0-9_-]+)/.exec(String(url || ''));
    return m ? m[1] : null;
  }

  /* Aufruf der Skript-Schnittstelle. In der Android-App läuft fetch über CapacitorHttp (keine CORS-Sperre). */
  function api(aktion, q) {
    q = q || Q;
    if (!q || q.art !== 'sheet') return Promise.reject(new Error('Kein Google Sheet verbunden'));
    var url = q.url + '?schluessel=' + encodeURIComponent(q.schluessel) + '&aktion=' + aktion + '&_=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Skript antwortet mit ' + r.status);
      return r.text();
    }, function () { throw new Error('Skript nicht erreichbar (offline?)'); }).then(function (t) {
      var j;
      try { j = JSON.parse(t); } catch (e) { throw new Error('Unerwartete Antwort des Skripts – ist es als Web-App mit Zugriff „Jeder“ bereitgestellt?'); }
      if (!j.ok) {
        if (j.fehler === 'Schlüssel ungültig') throw new Error('Schlüssel ungültig – bitte unter Einstellungen → Datenquelle neu verbinden.');
        throw new Error(j.fehler || 'Unbekannter Fehler');
      }
      return j;
    });
  }

  function ladeFragenbank() {
    var p;
    if (istSheet()) {
      p = api('fragen').then(function (j) {
        if (typeof j.csv !== 'string') throw new Error('Das Skript liefert keine Fragen – ist Skript 3.0 eingefügt und neu bereitgestellt?');
        if (j.name && j.name !== Q.name) { Q.name = j.name; speichereQuelle(Q); }
        var stand = Date.now();
        uebernehmeCsv(j.csv, stand);
        merkeCsv(j.csv, stand);
      });
    } else if (Q && Q.art === 'datei') {
      p = new Promise(function (ok) {
        if (!ladeAusSpeicher()) throw new Error('Die Datei ist nicht mehr gespeichert – bitte unter Einstellungen → Datenquelle neu einlesen.');
        ok();
      });
    } else {
      p = Promise.reject(new Error('Keine Datenquelle verbunden'));
    }
    return p.then(function () { ladeFehler = ''; }, function (err) {
      ladeFehler = String(err && err.message || err);
      throw err;
    });
  }

  /* Mit einem Google Sheet verbinden: Code lesen, Schlüssel prüfen, speichern, Fragen laden. */
  function verbinde(text) {
    var q;
    try { q = leseCode(text); } catch (e) { return Promise.reject(e); }
    return api('pruefen', q).then(function (j) {
      q.name = j.name || 'Fragenbank';
      speichereQuelle(q);
      vorrat.stand = 0; vorrat.bereit = null; vorrat.fehler = '';
      return ladeFragenbank();
    }).then(function () { planeErinnerungen(false); return q; });
  }
  /* Lokale CSV-Datei einlesen: erst prüfen, dann übernehmen. */
  function leseDatei(name, text) {
    var stand = Date.now();
    uebernehmeCsv(text, stand);
    merkeCsv(text, stand);
    speichereQuelle({ art: 'datei', name: name || 'Fragen.csv' });
    ladeFehler = '';
    vorrat.bereit = null; vorrat.fehler = '';
    planeErinnerungen(false);
  }
  function trenne() {
    speichereQuelle(null);
    try { localStorage.removeItem(CSV_SPEICHER); } catch (e) {}
    fragen = []; nachId = {}; alleZeilen = 0; datenStand = null; ladeFehler = '';
    vorrat.bereit = null; vorrat.fehler = ''; vorrat.meldung = '';
  }

  /* ---------- Sets und Lernstand ---------- */

  function setKeys() {
    var m = {};
    fragen.forEach(function (q) { m[q.paket] = true; });
    return Object.keys(m).sort(function (a, b) { return setRang(a) - setRang(b); });
  }
  function fragenImSet(key) {
    return key === 'alle' ? fragen.slice() : fragen.filter(function (q) { return q.paket === key; });
  }
  function resetZeit(q) { return S.reset[q.paket] || 0; }
  function antwortenVon(id) { return S.antworten[id] || []; }
  function antwortenSeitReset(q) {
    var r = resetZeit(q);
    return antwortenVon(q.id).filter(function (a) { return a.t > r; });
  }
  function letzteAntwort(q, seitReset) {
    var l = seitReset ? antwortenSeitReset(q) : antwortenVon(q.id);
    return l.length ? l[l.length - 1] : null;
  }
  function status(q) {
    var a = letzteAntwort(q, true);
    return !a ? 'offen' : a.ok ? 'richtig' : 'falsch';
  }
  function setWerte(key) {
    var liste = fragenImSet(key), w = { n: liste.length, richtig: 0, falsch: 0, offen: 0, antworten: 0, korrekt: 0 };
    liste.forEach(function (q) {
      w[status(q)]++;
      antwortenSeitReset(q).forEach(function (a) { w.antworten++; if (a.ok) w.korrekt++; });
    });
    w.quote = prozent(w.korrekt, w.antworten);
    w.beantwortet = w.n - w.offen;
    return w;
  }
  function istFaellig(id, jetzt) {
    var f = S.fehler[id];
    if (!f) return false;
    return tagSchluessel(f.t) !== tagSchluessel(jetzt) && f.t < jetzt && (S.zaehler - f.n) >= 10;
  }
  function faelligImSet(key) {
    var jetzt = Date.now();
    return fragenImSet(key).filter(function (q) { return istFaellig(q.id, jetzt); });
  }
  function heuteBeantwortet() {
    var heute = tagSchluessel(Date.now()), n = 0;
    Object.keys(S.antworten).forEach(function (id) {
      S.antworten[id].forEach(function (a) { if (tagSchluessel(a.t) === heute) n++; });
    });
    return n;
  }
  function quoteNach(feld) {
    var m = {};
    fragen.forEach(function (q) {
      var k = q[feld] || '–';
      if (!m[k]) m[k] = { n: 0, ok: 0 };
      antwortenVon(q.id).forEach(function (a) { m[k].n++; if (a.ok) m[k].ok++; });
    });
    return m;
  }

  /* ---------- Auswahl der nächsten Frage ---------- */

  function waehleFrage(key, ausser, poolVorgabe) {
    var pool = poolVorgabe || fragenImSet(key);
    if (!pool.length) return { q: null, durch: false };
    var jetzt = Date.now();
    var ohne = function (l) { var f = l.filter(function (q) { return q.id !== ausser; }); return f.length ? f : l; };

    var faellig = pool.filter(function (q) { return istFaellig(q.id, jetzt); })
      .sort(function (a, b) { return S.fehler[a.id].t - S.fehler[b.id].t; });
    if (faellig.length) return { q: ohne(faellig)[0], durch: false };

    var neu = pool.filter(function (q) { return status(q) === 'offen'; });
    if (neu.length) return { q: gewichtetNeu(pool, ohne(neu)), durch: false };

    var rest = ohne(pool.slice()).sort(function (a, b) {
      var sa = status(a) === 'richtig' ? 0 : 1, sb = status(b) === 'richtig' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return (letzteAntwort(a, true) || { t: 0 }).t - (letzteAntwort(b, true) || { t: 0 }).t;
    });
    return { q: rest[0], durch: true };
  }

  function gewichtetNeu(pool, neu) {
    var beantwortet = { I: 0, II: 0, III: 0 }, summe = 0;
    pool.forEach(function (q) {
      if (status(q) !== 'offen') { var d = ecoDomain(q); if (d in beantwortet) { beantwortet[d]++; summe++; } }
    });
    var verfuegbar = {};
    neu.forEach(function (q) { verfuegbar[ecoDomain(q)] = true; });
    var bester = null, bestWert = -Infinity;
    Object.keys(ECO_ZIEL).forEach(function (d) {
      if (!verfuegbar[d]) return;
      var wert = ECO_ZIEL[d] - (summe ? beantwortet[d] / summe : 0) + Math.random() * 0.02;
      if (wert > bestWert) { bestWert = wert; bester = d; }
    });
    var kandidaten = bester ? neu.filter(function (q) { return ecoDomain(q) === bester; }) : neu;
    var quoten = quoteNach('domain');
    var gewichte = kandidaten.map(function (q) {
      var s = quoten[q.domain];
      var quote = s && s.n ? s.ok / s.n : 0.7;
      return 1 + (1 - quote) * 2;
    });
    var ges = gewichte.reduce(function (a, b) { return a + b; }, 0), r = Math.random() * ges;
    for (var i = 0; i < kandidaten.length; i++) { r -= gewichte[i]; if (r <= 0) return kandidaten[i]; }
    return kandidaten[kandidaten.length - 1];
  }

  function antworte(q, wahl) {
    var jetzt = Date.now();
    var vorher = letzteAntwort(q, false);
    var ok = wahl === q.loesung;
    if (!S.antworten[q.id]) S.antworten[q.id] = [];
    S.antworten[q.id].push({ t: jetzt, w: wahl, ok: ok });
    S.zaehler++;
    if (!ok) {
      S.fehler[q.id] = { t: jetzt, n: S.zaehler, serie: 0 };
    } else if (S.fehler[q.id]) {
      S.fehler[q.id].serie = (S.fehler[q.id].serie || 0) + 1;
      if (S.fehler[q.id].serie >= 2) delete S.fehler[q.id];
    }
    S.offen = null;
    speichere();
    return { wahl: wahl, ok: ok, t: jetzt, vorher: vorher };
  }

  /* ---------- Darstellung ---------- */

  var app = document.getElementById('app');

  function nav(aktiv) {
    var p = function (k) { return k === aktiv ? ' aria-current="page"' : ''; };
    return '<nav class="nav" aria-label="Hauptnavigation"><div class="nav-innen">' +
      '<a href="#/start"' + p('lernen') + '>' + IKON.lernen + 'Lernen</a>' +
      '<a href="#/statistik"' + p('statistik') + '>' + IKON.statistik + 'Statistik</a>' +
      '<a href="#/uebersicht"' + p('uebersicht') + '>' + IKON.uebersicht + 'Übersicht</a>' +
      '</div></nav>';
  }
  function kopfMitZahnrad(titelHtml) {
    return '<div class="kopf">' + titelHtml + '<div class="kopf-symbole">' +
      '<a class="symbolknopf" href="#/hilfe" aria-label="Hilfe: neuen Fragenkatalog einrichten">' + IKON.hilfe + '</a>' +
      '<a class="symbolknopf" href="#/einstellungen" aria-label="Einstellungen">' + IKON.zahnrad + '</a></div></div>';
  }
  function marke() { return '<div class="marke"><div class="logo">' + IKON.haken + '</div>PMP-Lernpartner</div>'; }
  function balken(p, schwach) {
    return '<div class="balken' + (schwach ? ' schwach' : '') + '" role="img" aria-label="' + (p == null ? 'keine Daten' : p + ' Prozent') + '"><div style="width:' + (p || 0) + '%"></div></div>';
  }
  function datenHinweis() {
    if (!Q && fragen.length) return '<a class="meldung fehler" href="#/datenquelle" style="display:block;text-decoration:none">Bitte verbinde deine Datenquelle (Einstellungen → Datenquelle). Bis dahin lernst du mit dem zuletzt geladenen Stand. ›</a>';
    if (ladeFehler && fragen.length && /Schlüssel|Datei ist nicht/.test(ladeFehler)) return '<a class="meldung fehler" href="#/datenquelle" style="display:block;text-decoration:none">' + esc(ladeFehler) + ' ›</a>';
    if (ladeFehler && fragen.length) return '<p class="meldung">Offline oder Fragenbank nicht erreichbar – du lernst mit dem Stand vom ' + esc(datumZeit(datenStand)) + '.</p>';
    return '';
  }

  function zeigeStart() {
    var key = S.aktivesSet, w = setWerte(key), faellig = faelligImSet(key).length;
    var h = new Date().getHours();
    var gruss = h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
    app.innerHTML = '<main class="seite mit-nav">' + kopfMitZahnrad(marke()) +
      '<div><h1 class="gross">' + gruss + (S.name ? ', ' + esc(S.name) : '') + '</h1>' +
      '<p class="unter">Eine Frage – oder ein paar mehr?</p></div>' + datenHinweis() + updateHinweis() +
      '<section class="karte"><div class="zeile"><span class="ueber">' + esc(setName(key)) + ' · Quote</span>' +
      '<a class="textknopf" href="#/sets" style="padding:0;min-height:0">Set wechseln</a></div>' +
      '<div style="display:flex;align-items:baseline;gap:8px"><span class="zahl riesig">' + (w.quote == null ? '–' : w.quote + ' %') + '</span>' +
      '<span class="unter">' + (w.quote == null ? 'noch keine Antworten' : 'richtig') + '</span></div>' +
      balken(w.quote) + '<p class="leise">' + w.beantwortet + ' von ' + w.n + ' Fragen beantwortet</p></section>' +
      '<div class="raster2">' +
      (faellig ? '<a class="karte klein warn" href="#/statistik"><span class="zahl">' + faellig + '</span><span>' + (faellig === 1 ? 'Fehlerfrage fällig' : 'Fehlerfragen fällig') + '</span></a>'
        : '<div class="karte klein"><span class="zahl">0</span><span class="unter">Fehlerfragen fällig</span></div>') +
      '<div class="karte klein"><span class="zahl">' + w.n + '</span><span class="unter">' + (key === 'alle' ? 'Fragen in allen Sets' : 'Fragen in ' + esc(setName(key))) + '</span></div></div>' +
      '<div class="fuss"><a class="knopf gross" href="#/frage">Los ' + IKON.pfeil + '</a>' +
      '<p class="hinweis">Fällige Fehlerfragen kommen zuerst.</p></div></main>' + nav('lernen');
    bindeUpdate();
  }

  function einordnung(q) {
    var chip = function (t, v) { return '<div class="chip"><span>' + t + '</span><span>' + esc(v) + '</span></div>'; };
    var html = (q.domain ? chip('Domain', q.domain) : '') + (q.focus_area ? chip('Focus Area', q.focus_area) : '') + (q.prozess ? chip('Prozess', q.prozess) : '');
    return html ? '<div class="einordnung" aria-label="Einordnung">' + html + '</div>' : '';
  }

  function zeigeFrage() {
    var q = sitzung.id && nachId[sitzung.id];
    if (!q) {
      if (sitzung.quelle === 'lernen' || sitzung.quelle === 'fokus') { naechste(); q = nachId[sitzung.id]; }
      if (!q) { app.innerHTML = '<main class="seite"><p class="meldung">In diesem Set gibt es keine Fragen.</p><a class="knopf zweit" href="#/sets">Zu den Sets</a></main>'; return; }
    }
    if (sitzung.phase === 'feedback') return zeigeFeedback(q);
    var zaehler = heuteBeantwortet() + 1;
    var zurueck = sitzung.quelle === 'liste' ? '<a class="textknopf zurueck" href="#/set/' + esc(q.paket) + '">' + IKON.links + 'Liste</a>'
      : sitzung.quelle === 'fokus' ? '<a class="textknopf zurueck" href="#/statistik">' + IKON.links + 'Statistik</a>'
      : '<a class="textknopf zurueck" href="#/start">Pause</a>';
    var hinweisDurch = sitzung.durch && sitzung.quelle === 'lernen'
      ? '<p class="meldung">Alle Fragen in ' + esc(setName(S.aktivesSet)) + ' sind beantwortet – jetzt kommt Wiederholung. <a href="#/sets">Set neu beginnen, wechseln oder neue Sets übernehmen</a>.</p>' : '';
    if (sitzung.quelle === 'fokus') {
      hinweisDurch = '<p class="meldung fokus">Prozess üben: <b lang="en">' + esc(sitzung.fokus) + '</b> · ' + fokusFragen(sitzung.fokus).length + ' Fragen' +
        (sitzung.durch ? ' – alle beantwortet, jetzt Wiederholung.' : '') + '</p>';
    }
    app.innerHTML = '<main class="seite"><div class="kopf">' + zurueck + '<span class="leise">Heute · Frage ' + zaehler + '</span></div>' +
      hinweisDurch + einordnung(q) +
      '<p class="fragetext" lang="en">' + esc(q.frage) + '</p>' +
      '<div class="optionen" lang="en" role="group" aria-label="Antworten">' +
      ['A', 'B', 'C', 'D'].map(function (b) {
        return '<button class="option" data-wahl="' + b + '"><span class="buchstabe">' + b + '</span><span class="text">' + esc(q[b.toLowerCase()]) + '</span></button>';
      }).join('') + '</div><p class="leise" style="text-align:right">' + esc(q.id) + ' · ' + esc(setName(q.paket)) + '</p></main>';
    app.querySelectorAll('[data-wahl]').forEach(function (el) {
      el.addEventListener('click', function () {
        sitzung.antwort = antworte(q, el.getAttribute('data-wahl'));
        sitzung.phase = 'feedback';
        render();
        planeErinnerungen(false); // Erinnerung nennt jetzt die nächste Frage
        window.scrollTo(0, 0);
      });
    });
  }

  function warumNicht(q, wahl) {
    var teile = String(q.warum_nicht || '').split(/\s*·\s*(?=[A-D]:)/);
    for (var i = 0; i < teile.length; i++) {
      var m = teile[i].match(/^([A-D]):\s*([\s\S]*)$/);
      if (m && m[1] === wahl) return m[2].trim();
    }
    return '';
  }

  function zeigeFeedback(q) {
    var a = sitzung.antwort, ok = a.ok, l = q.loesung;
    var vorher = a.vorher ? '<p class="vorher">Letztes Mal: ' + (a.vorher.ok ? 'richtig' : 'falsch') + ' (' + datumKurz(a.vorher.t) + ')</p>' : '';
    var opt = function (b, klasse, marker, mk) {
      return '<div class="option ' + klasse + '"><span class="buchstabe">' + b + '</span><span class="text">' + esc(q[b.toLowerCase()]) + '</span>' +
        (marker ? '<span class="marker ' + mk + '" lang="de">' + marker + '</span>' : '') + '</div>';
    };
    var html = '<main class="seite"><div class="kopf"><span></span><span class="leise">Heute · Frage ' + heuteBeantwortet() + '</span></div>' + einordnung(q);
    if (ok) {
      html += '<div class="ergebnis ok"><div class="kreis">' + IKON.ok + '</div><div><strong>Richtig</strong><small>Deine Antwort: ' + l + '</small></div></div>' + vorher +
        '<div class="optionen" lang="en">' + opt(l, 'richtig', 'Richtig', 'ok') + '</div>' +
        '<section class="block"><h2 class="ok">Warum ' + l + '</h2><p>' + esc(q.warum) + '</p></section>';
      if (S.fehler[q.id]) html += '<p class="notiz">' + IKON.wieder + 'Noch einmal richtig, dann verlässt sie die Fehlerliste.</p>';
    } else {
      var wn = warumNicht(q, a.wahl);
      var refs = String(q.referenz || '').split(/\s+·\s+/).filter(Boolean);
      html += '<div class="ergebnis bad"><div class="kreis">' + IKON.x + '</div><div><strong>Falsch – richtig ist ' + l + '</strong><small>Deine Antwort: ' + a.wahl + '</small></div></div>' + vorher +
        '<div class="optionen" lang="en">' + opt(a.wahl, 'falsch', 'Deine Wahl', 'bad') + opt(l, 'richtig', 'Richtig', 'ok') + '</div>' +
        (wn ? '<section class="block"><h2 class="bad">Warum nicht ' + a.wahl + '</h2><p>' + esc(wn) + '</p></section>' : '') +
        '<section class="block"><h2 class="ok">Warum ' + l + '</h2><p>' + esc(q.warum) + '</p></section>' +
        (refs.length ? '<section class="block ref"><h2>Referenz</h2>' + refs.map(function (r) {
          var m = r.match(/^(PMBOK 8|ECO):\s*(.*)$/) || r.match(/^(PMBOK 8|ECO)\s+(.*)$/);
          return m ? '<p><strong>' + esc(m[1]) + ':</strong> ' + esc(m[2]) + '</p>' : '<p>' + esc(r) + '</p>';
        }).join('') + '</section>' : '') +
        (q.merksatz ? '<section class="block merksatz">' + IKON.lampe + '<div><h2>Merksatz</h2><p>' + esc(q.merksatz) + '</p></div></section>' : '') +
        '<p class="notiz">' + IKON.wieder + 'Kommt auf die Fehlerliste – frühestens morgen wieder.</p>';
    }
    if (sitzung.quelle === 'liste') {
      html += '<div class="fuss knopfreihe"><a class="knopf zweit" href="#/set/' + esc(q.paket) + '">Liste</a>' +
        '<button class="knopf" data-aktion="nochmal">Nochmal ' + IKON.wieder + '</button></div>';
    } else {
      html += '<div class="fuss knopfreihe"><a class="knopf zweit" href="' + (sitzung.quelle === 'fokus' ? '#/statistik' : '#/start') + '">' + (sitzung.quelle === 'fokus' ? 'Fertig' : 'Pause') + '</a>' +
        '<button class="knopf" data-aktion="weiter">Weiter ' + IKON.pfeil + '</button></div>';
    }
    app.innerHTML = html + '</main>';
    var w = app.querySelector('[data-aktion="weiter"]');
    if (w) w.addEventListener('click', function () { naechste(); render(); window.scrollTo(0, 0); });
    var n = app.querySelector('[data-aktion="nochmal"]');
    if (n) n.addEventListener('click', function () { sitzung.phase = 'frage'; sitzung.antwort = null; render(); window.scrollTo(0, 0); });
  }

  function fokusFragen(prozess) { return fragen.filter(function (q) { return q.prozess === prozess; }); }
  function naechste() {
    var aus = sitzung.id;
    if (sitzung.quelle === 'fokus') {
      var rf = waehleFrage(null, aus, fokusFragen(sitzung.fokus));
      sitzung = { id: rf.q ? rf.q.id : null, phase: 'frage', antwort: null, quelle: 'fokus', fokus: sitzung.fokus, durch: rf.durch };
      return;
    }
    var r = waehleFrage(S.aktivesSet, aus);
    // Eine schon vorgemerkte Frage (steht in der Erinnerung) kommt zuerst
    if (S.offen && S.offen !== aus && nachId[S.offen] && fragenImSet(S.aktivesSet).some(function (q) { return q.id === S.offen; })) {
      r = { q: nachId[S.offen], durch: r.durch };
    }
    sitzung = { id: r.q ? r.q.id : null, phase: 'frage', antwort: null, quelle: 'lernen', durch: r.durch };
    S.offen = sitzung.id;
    speichere();
  }

  function zeigeEinzelfrage(id) {
    var q = nachId[id];
    if (!q) { app.innerHTML = '<main class="seite"><p class="meldung">Frage ' + esc(id) + ' nicht gefunden.</p><a class="knopf zweit" href="#/sets">Zu den Sets</a></main>'; return; }
    if (sitzung.id !== id || sitzung.quelle !== 'liste') {
      var letzte = letzteAntwort(q, false);
      var davor = antwortenVon(id).length > 1 ? antwortenVon(id)[antwortenVon(id).length - 2] : null;
      sitzung = { id: id, quelle: 'liste', durch: false, phase: letzte ? 'feedback' : 'frage',
        antwort: letzte ? { wahl: letzte.w, ok: letzte.ok, t: letzte.t, vorher: davor } : null };
    }
    zeigeFrage();
  }

  function zeigeSets() {
    var keys = setKeys();
    var vonStart = ui.setsVon === '#/start';
    var html = '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="' + ui.setsVon + '">' + IKON.links +
      (vonStart ? 'Lernen' : 'Einstellungen') + '</a></div><h1 class="gross">Fragensets</h1>' + datenHinweis();
    keys.forEach(function (k) {
      var w = setWerte(k), aktiv = S.aktivesSet === k;
      var anteil = w.n ? Math.round((w.beantwortet / w.n) * 100) : 0;
      html += '<section class="setkarte' + (aktiv ? ' aktiv' : '') + '">' +
        '<button class="setkopf" data-aktivieren="' + esc(k) + '" aria-pressed="' + aktiv + '"><span class="setname">' + esc(setName(k)) + '</span>' +
        '<span class="abzeichen">' + (aktiv ? 'Aktiv' : 'Auswählen') + '</span></button>' +
        '<div class="werte"><span><b>' + w.n + '</b> Fragen</span><span><b>' + w.richtig + '</b> richtig</span><span><b>' + w.falsch + '</b> falsch</span><span><b>' + w.offen + '</b> offen</span></div>' +
        balken(anteil) +
        '<div class="setaktionen"><a class="textknopf" href="#/set/' + esc(k) + '">Fragen ansehen</a>' +
        '<button class="textknopf gefahr" data-reset="' + esc(k) + '">Neu beginnen</button></div>' +
        (ui.bestaetigen === k ? '<div class="bestaetigen" role="alertdialog" aria-label="Set neu beginnen">' +
          '<p>' + esc(setName(k)) + ' neu beginnen? Alle ' + w.n + ' Fragen gelten wieder als offen, die Fehlerliste des Sets wird geleert. Die Gesamtstatistik bleibt.</p>' +
          '<div class="knopfreihe"><button class="knopf zweit klein" data-abbrechen>Abbrechen</button><button class="knopf rot klein" data-ja="' + esc(k) + '">Neu beginnen</button></div></div>' : '') +
        '</section>';
    });
    var alleAktiv = S.aktivesSet === 'alle', wa = setWerte('alle');
    html += '<section class="setkarte' + (alleAktiv ? ' aktiv' : '') + '"><button class="setkopf" data-aktivieren="alle" aria-pressed="' + alleAktiv + '">' +
      '<span class="setname">Alle Sets gemischt</span><span class="abzeichen">' + (alleAktiv ? 'Aktiv' : 'Auswählen') + '</span></button>' +
      '<div class="werte"><span><b>' + wa.n + '</b> Fragen aus ' + keys.length + ' Sets</span></div></section>';
    html += vorratHtml() + '</main>';
    app.innerHTML = html;

    app.querySelectorAll('[data-aktivieren]').forEach(function (el) {
      el.addEventListener('click', function () {
        S.aktivesSet = el.getAttribute('data-aktivieren'); S.offen = null; speichere();
        sitzung = { id: null, phase: 'frage', antwort: null, quelle: 'lernen', durch: false };
        render();
      });
    });
    app.querySelectorAll('[data-reset]').forEach(function (el) {
      el.addEventListener('click', function () { ui.bestaetigen = el.getAttribute('data-reset'); render(); });
    });
    var ab = app.querySelector('[data-abbrechen]');
    if (ab) ab.addEventListener('click', function () { ui.bestaetigen = null; render(); });
    var ja = app.querySelector('[data-ja]');
    if (ja) ja.addEventListener('click', function () {
      var k = ja.getAttribute('data-ja');
      S.reset[k] = Date.now();
      fragenImSet(k).forEach(function (q) { delete S.fehler[q.id]; });
      if (sitzung.id && nachId[sitzung.id] && nachId[sitzung.id].paket === k) sitzung = { id: null, phase: 'frage', antwort: null, quelle: 'lernen', durch: false };
      S.offen = null; ui.bestaetigen = null; speichere(); render();
    });
    var ue = app.querySelector('[data-uebernehmen]');
    if (ue) ue.addEventListener('click', uebernehmen);
    pruefeVorrat();
  }

  function vorratHtml() {
    var html = '<section class="vorrat"><span class="ueber">Neue Sets</span>';
    if (!istSheet()) {
      html += '<p class="leise">' + (Q ? 'Neue Sets aus dem Ordner „pakete/neu“ gibt es nur mit einem verbundenen Google Sheet. Mit einer lokalen Datei liest du stattdessen eine neue Datei ein (Einstellungen → Datenquelle).'
        : 'Verbinde zuerst eine Datenquelle (Einstellungen → Datenquelle).') + '</p>';
    } else if (vorrat.laedt && vorrat.bereit == null) {
      html += '<p class="leise">Prüfe den Vorrat …</p>';
    } else if (vorrat.fehler) {
      html += '<p class="meldung fehler">' + esc(vorrat.fehler) + '</p>';
    } else if (vorrat.bereit && vorrat.bereit.length) {
      var n = vorrat.bereit.length;
      html += '<p><b>Neu bereit: ' + n + (n === 1 ? ' Set' : ' Sets') + '</b></p><p class="leise">' + vorrat.bereit.map(esc).join('<br>') + '</p>' +
        '<button class="knopf klein" data-uebernehmen' + (vorrat.laedt ? ' disabled' : '') + '>' + (vorrat.laedt ? 'Übernehme …' : 'Übernehmen') + '</button>';
    } else {
      html += '<p class="leise">Kein Vorrat in „pakete/neu“. Neue Sets landen dort als CSV-Datei, z. B. aus dem Projekt-Chat mit „Neues Fragenpaket“.</p>';
    }
    if (vorrat.meldung) html += '<p class="meldung gut">' + vorrat.meldung + '</p>';
    return html + '</section>';
  }

  function pruefeVorrat() {
    if (!istSheet() || vorrat.laedt || Date.now() - vorrat.stand < 60000) return;
    vorrat.laedt = true; vorrat.fehler = '';
    api('status').then(function (j) { vorrat.bereit = j.bereit || []; })
      .catch(function (e) { vorrat.fehler = 'Vorrat nicht abrufbar: ' + (e && e.message || e); })
      .then(function () {
        vorrat.laedt = false; vorrat.stand = Date.now();
        var rn = aktuelleRoute().name;
        if (rn === 'sets') render();
        else if (rn === 'einstellungen') erneuereFbKarte();
      });
  }
  function uebernehmen() {
    vorrat.laedt = true; vorrat.meldung = ''; render();
    api('uebernehmen').then(function (j) {
      vorrat.bereit = [];
      vorrat.meldung = esc((j.berichte || []).join(' '));
      return ladeFragenbank().catch(function () {});
    }).catch(function (e) {
      vorrat.fehler = 'Übernehmen fehlgeschlagen: ' + (e && e.message || e);
    }).then(function () { vorrat.laedt = false; vorrat.stand = Date.now(); render(); });
  }

  function zeigeSetliste(key) {
    var liste = fragenImSet(key);
    if (!liste.length) { location.hash = '#/sets'; return; }
    var zahl = { alle: liste.length, richtig: 0, falsch: 0, offen: 0 };
    liste.forEach(function (q) { zahl[status(q)]++; });
    var gefiltert = ui.filter === 'alle' ? liste : liste.filter(function (q) { return status(q) === ui.filter; });
    var namen = { alle: 'Alle', richtig: 'Richtig', falsch: 'Falsch', offen: 'Offen' };
    var html = '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="#/sets">' + IKON.links + 'Fragensets</a></div>' +
      '<h1 class="gross">' + esc(setName(key)) + ' · Fragen</h1>' +
      '<div class="filter" role="group" aria-label="Filter">' + Object.keys(namen).map(function (f) {
        return '<button data-filter="' + f + '" aria-pressed="' + (ui.filter === f) + '">' + namen[f] + ' ' + zahl[f] + '</button>';
      }).join('') + '</div><div class="liste">';
    gefiltert.forEach(function (q) {
      var s = status(q);
      var sym = s === 'richtig' ? '<span class="status ok" aria-label="zuletzt richtig">✓</span>' : s === 'falsch' ? '<span class="status bad" aria-label="zuletzt falsch">✗</span>' : '<span class="status" aria-label="offen">•</span>';
      html += '<a class="eintrag" href="#/f/' + esc(q.id) + '">' + sym + '<span class="mitte"><span>' + esc(q.id) + ' · ' + esc(q.domain) + ' · ' + esc(q.prozess) + '</span><span lang="en">' + esc(q.frage) + '</span></span></a>';
    });
    if (!gefiltert.length) html += '<p class="meldung">Keine Fragen in dieser Auswahl.</p>';
    app.innerHTML = html + '</div></main>';
    app.querySelectorAll('[data-filter]').forEach(function (el) {
      el.addEventListener('click', function () { ui.filter = el.getAttribute('data-filter'); render(); });
    });
  }

  function zeigeStatistik() {
    var gesamt = 0, korrekt = 0;
    Object.keys(S.antworten).forEach(function (id) {
      if (!nachId[id]) return;
      S.antworten[id].forEach(function (a) { gesamt++; if (a.ok) korrekt++; });
    });
    var quote = prozent(korrekt, gesamt);
    var fehlerIds = Object.keys(S.fehler).filter(function (id) { return nachId[id]; })
      .sort(function (a, b) { return S.fehler[a].t - S.fehler[b].t; });
    var feld = { domain: 'domain', focus: 'focus_area', prozess: 'prozess' }[ui.statModus];
    var q = quoteNach(feld);
    var reihenfolge = ui.statModus === 'domain' ? DOMAINS : ui.statModus === 'focus' ? FOCUS : Object.keys(q).sort();
    reihenfolge = reihenfolge.filter(function (k) { return q[k]; });
    if (ui.statModus === 'prozess') {
      reihenfolge.sort(function (a, b) {
        var pa = q[a].n ? q[a].ok / q[a].n : 2, pb = q[b].n ? q[b].ok / q[b].n : 2;
        return pa - pb || (a < b ? -1 : 1);
      });
    }
    var jetzt = Date.now();
    var html = '<main class="seite mit-nav">' + kopfMitZahnrad('<h1 class="gross">Statistik</h1>') +
      '<div class="raster3"><div class="karte klein"><span class="zahl">' + (quote == null ? '–' : quote + ' %') + '</span><span class="leise">Quote</span></div>' +
      '<div class="karte klein"><span class="zahl">' + gesamt + '</span><span class="leise">Antworten</span></div>' +
      '<div class="karte klein"><span class="zahl">' + fehlerIds.length + '</span><span class="leise">Fehlerliste</span></div></div>' +
      '<div class="segment" role="group" aria-label="Auswertung nach">' +
      [['domain', 'Domain'], ['focus', 'Focus Area'], ['prozess', 'Prozess']].map(function (m) {
        return '<button data-modus="' + m[0] + '" aria-pressed="' + (ui.statModus === m[0]) + '">' + m[1] + '</button>';
      }).join('') + '</div><section class="karte">';
    if (!gesamt) html += '<p class="leise">Noch keine Antworten. Die Auswertung füllt sich mit jeder Frage.</p>';
    if (ui.statModus === 'prozess') {
      html += statProzesseHtml(q, quoteNach('domain'));
      reihenfolge = [];
    }
    reihenfolge.forEach(function (k) {
      var s = q[k], p = prozent(s.ok, s.n), schwach = p != null && p < 60;
      html += '<div class="statzeile' + (schwach ? ' schwach' : '') + '"><div class="zeile"><span>' + esc(k) + '</span><span>' +
        (p == null ? '–' : p + ' % · ' + s.n) + '</span></div>' + balken(p, schwach) + '</div>';
    });
    html += '<p class="leise">Unter 60 % in Orange. Die Statistik umfasst alle Sets und bleibt beim Neubeginnen eines Sets erhalten.</p></section>' +
      '<section class="karte"><span class="ueber">Fehlerliste</span>';
    if (!fehlerIds.length) html += '<p class="leise">Leer – stark!</p>';
    html += '<div class="liste">' + fehlerIds.map(function (id) {
      var f = S.fehler[id], fq = nachId[id];
      var wann = istFaellig(id, jetzt) ? 'fällig' : (tagSchluessel(f.t) === tagSchluessel(jetzt) ? 'ab morgen' : 'nach ' + Math.max(0, 10 - (S.zaehler - f.n)) + ' weiteren Fragen');
      return '<a class="eintrag" href="#/f/' + esc(id) + '"><span class="status bad">✗</span><span class="mitte"><span>' + esc(id) + ' · ' + esc(fq.domain) + ' · ' + wann + '</span><span lang="en">' + esc(fq.frage) + '</span></span></a>';
    }).join('') + '</div></section></main>' + nav('statistik');
    app.innerHTML = html;
    app.querySelectorAll('[data-modus]').forEach(function (el) {
      el.addEventListener('click', function () { ui.statModus = el.getAttribute('data-modus'); render(); });
    });
    app.querySelectorAll('details[data-domain]').forEach(function (el) {
      el.addEventListener('toggle', function () { ui.statOffen[el.getAttribute('data-domain')] = el.open; });
    });
  }

  /* Matrix der 40 Prozesse: Zeilen = Performance Domains, Spalten = Focus Areas (Reiter Übersicht). */
  function matrixHtml() {
    var spalte = {};
    FOCUS.forEach(function (f) { spalte[f] = 0; DOMAINS.forEach(function (d) { spalte[f] += (PROZESSE[d][f] || []).length; }); });
    var html = '<div class="matrix-rahmen" tabindex="0" aria-label="Prozess-Matrix, seitlich wischen"><table class="matrix"><thead><tr><th class="ecke" scope="col">Domain<span>Focus Area →</span></th>' +
      FOCUS.map(function (f) { return '<th scope="col">' + esc(f) + '<span>' + spalte[f] + '</span></th>'; }).join('') + '</tr></thead><tbody>';
    DOMAINS.forEach(function (d) {
      var zahl = FOCUS.reduce(function (n, f) { return n + (PROZESSE[d][f] || []).length; }, 0);
      html += '<tr><th scope="row">' + esc(d) + '<span>' + zahl + '</span></th>' + FOCUS.map(function (f) {
        var liste = PROZESSE[d][f] || [];
        if (!liste.length) return '<td class="leer" aria-label="keine Prozesse">–</td>';
        return '<td>' + liste.map(function (pz) { return '<span class="m-p" lang="en">' + esc(pz) + '</span>'; }).join('') + '</td>';
      }).join('') + '</tr>';
    });
    return html + '</tbody></table></div>';
  }

  /* Statistik nach Prozess (Variante B): je Domain eine aufklappbare Karte, darin die Prozesse nach Focus Area
   * mit Quote und Zahl der Antworten; ein Tipp startet eine Übungsrunde nur mit den Fragen dieses Prozesses. */
  function statProzesseHtml(q, qDomain) {
    var html = '<p class="leise">Domain aufklappen, Prozess antippen: Du übst dann nur dessen Fragen. Grün ab 60 %, Orange darunter, grau = noch offen.</p>';
    DOMAINS.forEach(function (d) {
      var sd = qDomain[d], pd = sd ? prozent(sd.ok, sd.n) : null;
      html += '<details class="domainkarte" data-domain="' + esc(d) + '"' + (ui.statOffen[d] ? ' open' : '') + '><summary><span>' + esc(d) + '</span><span class="' +
        (pd == null ? 'offen' : pd < 60 ? 'schwach' : 'gut') + '">' + (pd == null ? 'noch offen' : 'Quote ' + pd + ' %') + '</span></summary>';
      FOCUS.forEach(function (f) {
        var liste = PROZESSE[d][f] || [];
        if (!liste.length) return;
        html += '<p class="focuslabel" lang="en">' + esc(f) + '</p>';
        liste.forEach(function (pz) {
          var s = q[pz], p = s ? prozent(s.ok, s.n) : null, anzahl = fokusFragen(pz).length;
          var klasse = p == null ? 'offen' : p < 60 ? 'schwach' : 'gut';
          var info = !anzahl ? 'keine Fragen' : p == null ? 'offen · ' + anzahl + (anzahl === 1 ? ' Frage' : ' Fragen') : p + ' % · ' + s.n;
          var inhalt = '<span lang="en">' + esc(pz) + '</span><span class="' + klasse + '">' + esc(info) + (anzahl ? ' ›' : '') + '</span>';
          html += anzahl ? '<a class="prozesszeile" href="#/fokus/' + encodeURIComponent(pz) + '" aria-label="' + esc(pz) + ' üben">' + inhalt + '</a>'
            : '<div class="prozesszeile">' + inhalt + '</div>';
        });
      });
      html += '</details>';
    });
    return html;
  }

  /* ---------- Earned Value (Reiter Übersicht, seit Lern-App 1.4.0) ----------
   * Gängige Earned-Value-Formeln (Projektgrundlage Abschnitt 11). Beispiele und Texte sind eigene. Gerechnet wird exakt (EAC = BAC × AC / EV),
   * angezeigt auf 2 Stellen (Entscheidung 27). In Langformen markiert [x] den Buchstaben der Abkürzung. */
  var EV_KZ = [
    { k: 'BAC', lang: '[B]udget [a]t [C]ompletion', de: 'Gesamtbudget des Projekts', formel: 'gegeben', art: 'geld', gruppe: 'basis' },
    { k: 'PV', lang: '[P]lanned [V]alue', de: 'Soll-Wert: Arbeit, die bis heute geplant war', formel: 'PV = BAC × geplant %', art: 'geld', gruppe: 'basis' },
    { k: 'EV', lang: '[E]arned [V]alue', de: 'Fertigwert: Arbeit, die wirklich erledigt ist', formel: 'EV = BAC × fertig %', art: 'geld', gruppe: 'basis' },
    { k: 'AC', lang: '[A]ctual [C]ost', de: 'Ist-Kosten: bisher ausgegeben', formel: 'gegeben', art: 'geld', gruppe: 'basis' },
    { k: 'CV', lang: '[C]ost [V]ariance', de: 'Kostenabweichung', formel: 'CV = EV − AC', art: 'abw', gruppe: 'abw',
      regel: 'positiv = unter Budget · 0 = im Budget · negativ = über Budget' },
    { k: 'SV', lang: '[S]chedule [V]ariance', de: 'Terminabweichung', formel: 'SV = EV − PV', art: 'abw', gruppe: 'abw',
      regel: 'positiv = voraus · 0 = im Plan · negativ = hinter Plan' },
    { k: 'CPI', lang: '[C]ost [P]erformance [I]ndex', de: 'Kosteneffizienz', formel: 'CPI = EV / AC', art: 'idx', gruppe: 'idx',
      regel: 'über 1 = unter Budget · 1 = im Budget · unter 1 = über Budget' },
    { k: 'SPI', lang: '[S]chedule [P]erformance [I]ndex', de: 'Termineffizienz', formel: 'SPI = EV / PV', art: 'idx', gruppe: 'idx',
      regel: 'über 1 = voraus · 1 = im Plan · unter 1 = hinter Plan' },
    { k: 'EAC', lang: '[E]stimate [a]t [C]ompletion', de: 'Prognose der Gesamtkosten am Ende', formel: 'EAC = BAC / CPI', art: 'geld', gruppe: 'prog',
      regel: 'Fragt die Prüfung nach dem „forecast“, ist der EAC gemeint.' },
    { k: 'ETC', lang: '[E]stimate [t]o [C]omplete', de: 'Prognose der Restkosten ab heute', formel: 'ETC = EAC − AC', art: 'geld', gruppe: 'prog',
      regel: 'So viel Geld braucht das Projekt ab heute noch.' },
    { k: 'VAC', lang: '[V]ariance [a]t [C]ompletion', de: 'Abweichung am Ende: Budget minus Prognose', formel: 'VAC = BAC − EAC', art: 'abw', gruppe: 'prog',
      regel: 'positiv = Geld bleibt übrig · negativ = Geld fehlt' },
    { k: 'TCPI', lang: '[T]o-[C]omplete [P]erformance [I]ndex', de: 'nötige Kosteneffizienz für die Restarbeit', formel: 'TCPI = (BAC − EV) / (BAC − AC)', art: 'idx', gruppe: 'prog',
      regel: 'unter 1 = leichter · 1 = genau wie geplant · über 1 = schwerer (hier ist klein gut)' },
  ];
  var EV_GRUPPEN = [['basis', 'Grundwerte'], ['abw', 'Abweichungen (Variance = minus)'], ['idx', 'Indizes (Index = geteilt)'], ['prog', 'Prognosen (Forecast)']];
  var EV_BAUSTEINE = [
    ['…V', 'Value', 'Wert in Geld', 'PV, EV'],
    ['P', 'Planned', 'geplant, Soll', 'PV'],
    ['E (Wert)', 'Earned', 'verdient, geschafft', 'EV'],
    ['AC allein', 'Actual Cost', 'tatsächlich ausgegeben', 'AC'],
    ['…AC am Ende', 'at Completion', 'am Projektende', 'BAC, EAC, VAC'],
    ['C… / S…', 'Cost / Schedule', 'Kosten / Termin', 'CV, CPI / SV, SPI'],
    ['V', 'Variance', 'Abweichung → minus', 'CV, SV, VAC'],
    ['PI', 'Performance Index', 'Kennzahl → geteilt', 'CPI, SPI, TCPI'],
    ['E (Zukunft)', 'Estimate', 'Schätzung, Prognose', 'EAC, ETC'],
    ['TC', 'To Complete', 'ab heute bis zum Ende', 'ETC, TCPI'],
  ];
  /* Vier eigene Beispiele zu vier typischen Projektlagen; Zahlen so gewählt, dass EAC glatt aufgeht. */
  var EV_SZENARIEN = [
    { nr: 1, titel: 'Voraus und unter Budget', ton: 'gut', projekt: 'Website-Relaunch', einheit: 'Wochen',
      bac: 10000, zeit: 4, dauer: 10, fertig: 50, ac: 4000,
      deutung: 'Mehr geschafft als geplant und dafür weniger ausgegeben – beide Indizes 1,25. Bleibt es so, kostet das Projekt nur 8.000 € statt 10.000 €. Für den Rest genügt eine Effizienz von 0,83 (TCPI unter 1 = leichter).' },
    { nr: 2, titel: 'Knapp hinter Plan, knapp über Budget', ton: 'schwach', projekt: 'CRM-Einführung', einheit: 'Monate',
      bac: 24000, zeit: 6, dauer: 12, fertig: 48, ac: 12000,
      deutung: 'Beide Indizes 0,96 – klingt harmlos, ergibt am Ende aber 1.000 € Mehrkosten (VAC −1.000). Für den Rest muss das Team 4 % effizienter arbeiten als geplant (TCPI 1,04).' },
    { nr: 3, titel: 'Voraus, aber über Budget', ton: 'schwach', projekt: 'Hallenbeleuchtung', einheit: 'Monate',
      bac: 8000, zeit: 5, dauer: 10, fertig: 75, ac: 7500,
      deutung: 'Weit voraus (SPI 1,50), aber zu teuer (CPI 0,80). Vom Budget sind nur noch 500 € übrig, offen ist aber Arbeit im Wert von 2.000 €. TCPI 4,00 heißt: Der Rest müsste viermal so effizient laufen wie geplant – realistisch geht das nur mit mehr Budget.' },
    { nr: 4, titel: 'Weit hinter Plan und weit über Budget', ton: 'schwach', projekt: 'Rechenzentrums-Umzug', einheit: 'Monate',
      bac: 50000, zeit: 12, dauer: 20, fertig: 30, ac: 30000,
      deutung: 'Nur halb so viel geschafft wie geplant (SPI 0,50) und das zum doppelten Preis (CPI 0,50). Die Prognose liegt bei 100.000 €, dem Doppelten des Budgets. TCPI 1,75: Der Rest müsste 75 % effizienter laufen als geplant.' },
  ];
  var trainer = { stapel: null, auf: false, richtung: 'kurz', gewusst: 0, versuche: 0 };

  function evRechne(e) {
    var bac = e.bac, pv = bac * e.plan / 100, ev = bac * e.fertig / 100, ac = e.ac;
    var r = { BAC: bac, PV: pv, EV: ev, AC: ac, CV: ev - ac, SV: ev - pv };
    r.CPI = ac > 0 ? ev / ac : null;
    r.SPI = pv > 0 ? ev / pv : null;
    r.EAC = r.CPI ? bac / r.CPI : null;
    r.ETC = r.EAC == null ? null : r.EAC - ac;
    r.VAC = r.EAC == null ? null : bac - r.EAC;
    r.TCPI = bac - ac > 0 ? (bac - ev) / (bac - ac) : null;
    return r;
  }
  function evRund(x) { return Math.round(x * 100) / 100; }
  function evZahl(x, art) {
    if (x == null || !isFinite(x)) return '–';
    var r = evRund(x);
    if (art === 'idx') return r.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var t = r.toLocaleString('de-DE', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
    return art === 'abw' && r > 0 ? '+' + t : t;
  }
  function evVgl(x, ref) { var r = evRund(x); return r > ref ? 1 : r < ref ? -1 : 0; }
  function evDeutung(k, r) {
    var v = r[k], c;
    if (v == null || !isFinite(v)) return ['', k === 'TCPI' ? 'nicht berechenbar: Budget aufgebraucht (BAC − AC ≤ 0)' : 'nicht berechenbar'];
    var drei = function (c, plus, null0, minus) { return [c > 0 ? 'gut' : c < 0 ? 'schwach' : '', c > 0 ? plus : c < 0 ? minus : null0]; };
    switch (k) {
      case 'BAC': return ['', 'Gesamtbudget'];
      case 'PV': return ['', 'Soll bis heute'];
      case 'EV': return ['', 'geschafft bis heute'];
      case 'AC': return ['', 'ausgegeben bis heute'];
      case 'CV': return drei(evVgl(v, 0), 'unter Budget', 'genau im Budget', 'über Budget');
      case 'SV': return drei(evVgl(v, 0), 'voraus', 'genau im Plan', 'hinter Plan');
      case 'CPI': c = evVgl(v, 1);
        return drei(c, 'unter Budget: je 1 € Kosten ' + evZahl(v, 'idx') + ' € Wert', 'genau im Budget', 'über Budget: je 1 € Kosten nur ' + evZahl(v, 'idx') + ' € Wert');
      case 'SPI': c = evVgl(v, 1);
        return drei(c, 'voraus: ' + evZahl(v * 100) + ' % des geplanten Fortschritts', 'genau im Plan', 'hinter Plan: nur ' + evZahl(v * 100) + ' % des geplanten Fortschritts');
      case 'EAC': return drei(-evVgl(v - r.BAC, 0), 'Prognose unter Budget', 'Prognose genau im Budget', 'Prognose über Budget');
      case 'ETC': return ['', 'noch nötig ab heute'];
      case 'VAC': return drei(evVgl(v, 0), 'bleibt am Ende übrig', 'Punktlandung', 'fehlt am Ende');
      case 'TCPI': return drei(-evVgl(v, 1), 'Rest darf weniger effizient laufen', 'Rest genau wie geplant', 'Rest muss effizienter laufen als geplant');
    }
    return ['', ''];
  }
  function evRechnung(k, e, r) {
    var z = function (x) { return evZahl(x); };
    switch (k) {
      case 'PV': return z(e.bac) + ' × ' + (e.planText || z(e.plan) + ' %');
      case 'EV': return z(e.bac) + ' × ' + z(e.fertig) + ' %';
      case 'CV': return z(r.EV) + ' − ' + z(r.AC);
      case 'SV': return z(r.EV) + ' − ' + z(r.PV);
      case 'CPI': return z(r.EV) + ' / ' + z(r.AC);
      case 'SPI': return z(r.EV) + ' / ' + z(r.PV);
      case 'EAC': return z(r.BAC) + ' / ' + evZahl(r.CPI, 'idx');
      case 'ETC': return z(r.EAC) + ' − ' + z(r.AC);
      case 'VAC': return z(r.BAC) + ' − ' + z(r.EAC);
      case 'TCPI': return '(' + z(r.BAC) + ' − ' + z(r.EV) + ') / (' + z(r.BAC) + ' − ' + z(r.AC) + ')';
    }
    return '';
  }
  function evLang(s, marke) { return esc(s).replace(/\[([^\]]+)\]/g, marke ? '<b>$1</b>' : '$1'); }

  function evErgebnisHtml(e) {
    var r = evRechne(e);
    var html = '<div class="ev-erg">' + EV_KZ.map(function (x) {
      var d = evDeutung(x.k, r), rech = evRechnung(x.k, e, r);
      return '<div class="ev-zeile"><span class="ev-abk">' + x.k + '</span><span><span class="lang" lang="en">' + evLang(x.lang, false) + '</span>' +
        '<span class="rechnung">' + esc(x.formel) + (rech ? ' = ' + esc(rech) : '') + '</span></span>' +
        '<span class="wert">' + evZahl(r[x.k], x.art) + '</span>' +
        '<span class="deutung"><span class="tag ' + d[0] + '">' + esc(d[1]) + '</span></span></div>';
    }).join('') + '</div>';
    if (r.CPI && r.EAC != null) {
      var buch = r.BAC / evRund(r.CPI);
      if (Math.abs(buch - r.EAC) >= 0.005) {
        html += '<p class="leise">Gerechnet mit dem ungerundeten CPI. Mit dem auf zwei Stellen gerundeten CPI (' + evZahl(r.CPI, 'idx') + ') ergäbe sich ein EAC von ' +
          evZahl(buch) + ' – eine reine Rundungsdifferenz.</p>';
      }
    }
    return html;
  }

  function evMerkhilfeHtml() {
    var html = '<section class="karte"><span class="ueber">Das Grundbild: PEA</span>' +
      '<div class="ev-pea"><div class="ev-kachel"><b>PV</b><span lang="en">Planned Value</span><small>Soll</small></div>' +
      '<div class="ev-kachel mitte"><b>EV</b><span lang="en">Earned Value</span><small>geschafft</small></div>' +
      '<div class="ev-kachel"><b>AC</b><span lang="en">Actual Cost</span><small>ausgegeben</small></div></div>' +
      '<div class="ev-wege"><div><b>Termin</b><span>EV mit PV vergleichen → SV, SPI</span></div>' +
      '<div><b>Kosten</b><span>EV mit AC vergleichen → CV, CPI</span></div>' +
      '<div><b>Prognose</b><span>aus dem CPI → EAC → ETC → VAC; TCPI für den Rest</span></div></div>' +
      '<p class="leise">Merkwort <b>PEA</b> (englisch „Erbse“): PV · EV · AC. Das E steht in der Mitte, weil EV in fast jeder Formel vorkommt.</p></section>';
    html += '<section class="karte"><span class="ueber">Sieben Regeln</span><ol class="ev-regeln">' +
      '<li><b>Variance</b> ist eine Differenz, also <b>minus</b>. <b>Index</b> ist ein Verhältnis, also <b>geteilt</b>.</li>' +
      '<li>Bei CV, SV, CPI und SPI steht <b>EV immer vorn</b>: EV − …, EV / …</li>' +
      '<li><b>C</b>ost vergleicht EV mit <b>AC</b>, <b>S</b>chedule vergleicht EV mit <b>PV</b>.</li>' +
      '<li>Positiv bzw. über 1 ist gut – <b>außer beim TCPI</b>: Dort ist unter 1 gut.</li>' +
      '<li>Falle: <b>AC allein</b> = Actual Cost. <b>…AC am Ende</b> (BAC, EAC, VAC) = at Completion.</li>' +
      '<li>Geplant % nicht angegeben? <b>Vergangene Zeit / Gesamtdauer</b>.</li>' +
      '<li>Prognosen bauen aufeinander auf: <b>EAC → ETC → VAC</b>.</li></ol></section>';
    html += '<section class="karte"><span class="ueber">Bausteine der Abkürzungen</span><div class="matrix-rahmen ev-rahmen"><table class="ev-tabelle"><thead><tr><th>Teil</th><th>heißt</th><th>bedeutet</th></tr></thead><tbody>' +
      EV_BAUSTEINE.map(function (b) {
        return '<tr><td><b>' + esc(b[0]) + '</b></td><td lang="en">' + esc(b[1]) + '</td><td>' + esc(b[2]) + '<span class="in">in ' + esc(b[3]) + '</span></td></tr>';
      }).join('') + '</tbody></table></div></section>';
    EV_GRUPPEN.forEach(function (g) {
      html += '<section class="karte"><span class="ueber">' + esc(g[1]) + '</span><div>' +
        EV_KZ.filter(function (x) { return x.gruppe === g[0]; }).map(function (x) {
          return '<div class="ev-kz"><div class="kopfzeile"><span class="ev-abk">' + x.k + '</span><span class="ev-lang" lang="en">' + evLang(x.lang, true) + '</span></div>' +
            '<span>' + esc(x.de) + '</span><span class="ev-formel">' + esc(x.formel === 'gegeben' ? x.k + ': gegeben' : x.formel) + '</span>' +
            (x.regel ? '<span class="leise">' + esc(x.regel) + '</span>' : '') + '</div>';
        }).join('') + '</div></section>';
    });
    return html;
  }

  function evBeispieleHtml() {
    return '<p class="leise">Vier Lagen, die in der Prüfung typisch sind. Erst selbst rechnen, dann vergleichen.</p>' +
      EV_SZENARIEN.map(function (s) {
        var e = { bac: s.bac, plan: s.zeit / s.dauer * 100, planText: s.zeit + '/' + s.dauer, fertig: s.fertig, ac: s.ac };
        return '<section class="karte"><div class="zeile"><span class="ueber">Szenario ' + s.nr + '</span><span class="tag ' + s.ton + '">' + esc(s.titel) + '</span></div>' +
          '<p><b>' + esc(s.projekt) + ':</b> Budget ' + evZahl(s.bac) + ' €, Dauer ' + s.dauer + ' ' + s.einheit + '. Heute ist das Ende von ' +
          (s.einheit === 'Wochen' ? 'Woche ' : 'Monat ') + s.zeit + '. Fertig sind ' + s.fertig + ' %, ausgegeben ' + evZahl(s.ac) + ' €.</p>' +
          '<p class="leise">Geplant % = ' + s.zeit + ' / ' + s.dauer + ' = ' + evZahl(e.plan) + ' %</p>' +
          '<details class="ev-loesung"><summary>Lösung zeigen</summary>' + evErgebnisHtml(e) +
          '<p class="ev-deutung">' + esc(s.deutung) + '</p>' +
          '<button class="knopf zweit klein" data-ev-szenario="' + s.nr + '">Im Rechner öffnen</button></details></section>';
      }).join('');
  }

  function evZahlLesen(t) {
    t = String(t == null ? '' : t).replace(/\s|€|%/g, '');
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');   // 1.500 = Tausenderpunkt
    var n = parseFloat(t);
    return isFinite(n) ? n : null;
  }
  function evRechnerWerte() {
    var w = ui.rechner, z = evZahlLesen(w.zeit), d = evZahlLesen(w.dauer);
    var e = { bac: evZahlLesen(w.bac), plan: evZahlLesen(w.plan), fertig: evZahlLesen(w.fertig), ac: evZahlLesen(w.ac) };
    if (z != null && d > 0) { e.plan = z / d * 100; e.planText = evZahl(z) + '/' + evZahl(d); }   // exakt, nicht der gerundete Feldwert
    return e;
  }
  function evRechnerErgebnis() {
    var e = evRechnerWerte();
    if (e.bac == null || e.plan == null || e.fertig == null || e.ac == null) return '<p class="leise">Bitte BAC, geplant %, fertig % und AC eintragen.</p>';
    if (e.bac <= 0) return '<p class="leise">Das Budget (BAC) muss größer als 0 sein.</p>';
    return evErgebnisHtml(e);
  }
  function evRechnerHtml() {
    var w = ui.rechner;
    var feld = function (name, label, wert, hilfe) {
      return '<label>' + label + '<input type="text" inputmode="decimal" autocomplete="off" data-ev-feld="' + name + '" value="' + esc(wert) + '"' +
        (hilfe ? ' placeholder="' + esc(hilfe) + '"' : '') + '></label>';
    };
    return '<section class="karte"><span class="ueber">Eingaben</span><div class="ev-eingabe">' +
      feld('bac', 'BAC · Budget at Completion', w.bac) + feld('ac', 'AC · Actual Cost', w.ac) +
      feld('plan', 'Geplant % (für PV)', w.plan) + feld('fertig', 'Fertig % (für EV)', w.fertig) + '</div>' +
      '<p class="leise">Geplant % nicht bekannt? Aus der Zeit berechnen:</p><div class="ev-eingabe">' +
      feld('zeit', 'Zeit vergangen', w.zeit, 'z. B. 4') + feld('dauer', 'Dauer gesamt', w.dauer, 'z. B. 10') + '</div></section>' +
      '<section class="karte"><span class="ueber">Ergebnis</span><div data-ev-ergebnis>' + evRechnerErgebnis() + '</div></section>' +
      '<p class="leise">Rechnet exakt und zeigt zwei Nachkommastellen. Werte ohne Währung; Punkt oder Komma als Dezimalzeichen.</p>';
  }

  function mische(l) {
    for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; }
    return l;
  }
  function trainerNeu() {
    trainer.stapel = mische(EV_KZ.map(function (x) { return x.k; }));
    trainer.auf = false; trainer.gewusst = 0; trainer.versuche = 0;
  }
  function evTrainerHtml() {
    if (!trainer.stapel) trainerNeu();
    var html = '<div class="segment" role="group" aria-label="Richtung"><button data-ev-richtung="kurz" aria-pressed="' + (trainer.richtung === 'kurz') + '">Abkürzung → Langform</button>' +
      '<button data-ev-richtung="lang" aria-pressed="' + (trainer.richtung === 'lang') + '">Langform → Abkürzung</button></div>';
    if (!trainer.stapel.length) {
      return html + '<section class="ev-karte"><span class="mittel">Alle 12 sitzen.</span><span class="frage">' + trainer.versuche + ' Karten aufgedeckt für 12 Abkürzungen.</span></section>' +
        '<button class="knopf" data-ev-trainer="neu">Neue Runde</button>';
    }
    var x = EV_KZ.filter(function (y) { return y.k === trainer.stapel[0]; })[0];
    var vorn = trainer.richtung === 'kurz'
      ? '<span class="gross">' + x.k + '</span><span class="frage">Wie heißt das ausgeschrieben – und was bedeutet es?</span>'
      : '<span class="mittel" lang="en">' + evLang(x.lang, false) + '</span><span class="frage">Welche Abkürzung? Und die Formel?</span>';
    var hinten = trainer.auf ? '<div class="ev-rueck"><span class="gross">' + x.k + '</span><span class="ev-lang" lang="en">' + evLang(x.lang, true) + '</span>' +
      '<span>' + esc(x.de) + '</span><span class="ev-formel">' + esc(x.formel === 'gegeben' ? x.k + ': gegeben' : x.formel) + '</span></div>' : '';
    html += '<div class="ev-fortschritt"><span>' + trainer.gewusst + ' von 12 gewusst</span><span>noch ' + trainer.stapel.length + ' Karten</span></div>' +
      '<section class="ev-karte">' + (trainer.auf ? hinten : vorn) + '</section>';
    html += trainer.auf
      ? '<div class="knopfreihe" style="grid-template-columns:1fr 1fr"><button class="knopf zweit" data-ev-trainer="nochmal">Nochmal</button><button class="knopf" data-ev-trainer="gewusst">Gewusst</button></div>'
      : '<button class="knopf" data-ev-trainer="auf">Auflösen</button>';
    return html + '<p class="leise">Erst im Kopf beantworten, dann auflösen. „Nochmal“ legt die Karte etwas weiter nach hinten. Der Trainer zählt nicht zum Lernstand.</p>';
  }

  function evHtml() {
    var teile = [['merkhilfe', 'Merkhilfe'], ['beispiele', 'Beispiele'], ['rechner', 'Rechner'], ['trainer', 'Trainer']];
    var inhalt = ui.evTeil === 'beispiele' ? evBeispieleHtml() : ui.evTeil === 'rechner' ? evRechnerHtml() : ui.evTeil === 'trainer' ? evTrainerHtml() : evMerkhilfeHtml();
    return '<div class="segment ev-teile" role="group" aria-label="Earned Value">' + teile.map(function (t) {
      return '<button data-ev-teil="' + t[0] + '" aria-pressed="' + (ui.evTeil === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</div>' + inhalt +
      '<p class="leise">Gängige Earned-Value-Formeln; Beispiele, Zahlen und Texte sind eigene. <a href="#/quellen">Quellen und Hinweise</a></p>';
  }

  function bindeEv() {
    app.querySelectorAll('[data-ev-teil]').forEach(function (el) {
      el.addEventListener('click', function () { ui.evTeil = el.getAttribute('data-ev-teil'); render(); window.scrollTo(0, 0); });
    });
    app.querySelectorAll('[data-ev-szenario]').forEach(function (el) {
      el.addEventListener('click', function () {
        var s = EV_SZENARIEN[+el.getAttribute('data-ev-szenario') - 1];
        ui.rechner = { bac: String(s.bac), plan: String(evRund(s.zeit / s.dauer * 100)), fertig: String(s.fertig), ac: String(s.ac), zeit: String(s.zeit), dauer: String(s.dauer) };
        ui.evTeil = 'rechner'; render(); window.scrollTo(0, 0);
      });
    });
    app.querySelectorAll('[data-ev-feld]').forEach(function (el) {
      el.addEventListener('input', function () {
        var name = el.getAttribute('data-ev-feld');
        ui.rechner[name] = el.value;
        if (name === 'plan') {   // geplant % von Hand: Zeitangaben gelten nicht mehr
          ui.rechner.zeit = ''; ui.rechner.dauer = '';
          app.querySelectorAll('[data-ev-feld="zeit"], [data-ev-feld="dauer"]').forEach(function (f) { f.value = ''; });
        }
        if (name === 'zeit' || name === 'dauer') {
          var z = evZahlLesen(ui.rechner.zeit), d = evZahlLesen(ui.rechner.dauer);
          if (z != null && d > 0) {
            ui.rechner.plan = String(evRund(z / d * 100)).replace('.', ',');
            var p = app.querySelector('[data-ev-feld="plan"]'); if (p) p.value = ui.rechner.plan;
          }
        }
        var erg = app.querySelector('[data-ev-ergebnis]');
        if (erg) erg.innerHTML = evRechnerErgebnis();
      });
    });
    app.querySelectorAll('[data-ev-richtung]').forEach(function (el) {
      el.addEventListener('click', function () { trainer.richtung = el.getAttribute('data-ev-richtung'); trainer.auf = false; render(); });
    });
    app.querySelectorAll('[data-ev-trainer]').forEach(function (el) {
      el.addEventListener('click', function () {
        var a = el.getAttribute('data-ev-trainer');
        if (a === 'neu') trainerNeu();
        else if (a === 'auf') { trainer.auf = true; trainer.versuche++; }
        else if (a === 'gewusst') { trainer.stapel.shift(); trainer.gewusst++; trainer.auf = false; }
        else if (a === 'nochmal') { var k = trainer.stapel.shift(); trainer.stapel.splice(Math.min(3, trainer.stapel.length), 0, k); trainer.auf = false; }
        render();
      });
    });
  }

  function zeigeUebersicht() {
    var umschalter = '<div class="segment" role="group" aria-label="Übersicht"><button data-ueb="prozesse" aria-pressed="' + (ui.uebModus !== 'ev') + '">Prozesse</button>' +
      '<button data-ueb="ev" aria-pressed="' + (ui.uebModus === 'ev') + '">Earned Value</button></div>';
    if (ui.uebModus === 'ev') {
      app.innerHTML = '<main class="seite mit-nav">' + kopfMitZahnrad('<h1 class="gross">Übersicht</h1>') + umschalter + evHtml() + '</main>' + nav('uebersicht');
      bindeUeb(); bindeEv();
      return;
    }
    zeigeProzessUebersicht(umschalter);
    bindeUeb();
  }
  function bindeUeb() {
    app.querySelectorAll('[data-ueb]').forEach(function (el) {
      el.addEventListener('click', function () { ui.uebModus = el.getAttribute('data-ueb'); render(); window.scrollTo(0, 0); });
    });
  }

  function zeigeProzessUebersicht(umschalter) {
    app.innerHTML = '<main class="seite mit-nav breit">' + kopfMitZahnrad('<h1 class="gross">Übersicht</h1>') + umschalter +
      '<p class="leise">Die 40 Prozesse des PMBOK Guide 8 nach Performance Domain (Zeilen) und Focus Area (Spalten). Seitlich wischen; quer gehalten passt mehr aufs Display.</p>' +
      matrixHtml() +
      '<section class="karte"><span class="ueber">Verteilung</span><div class="verteilung">' +
      FOCUS.map(function (f) {
        var n = DOMAINS.reduce(function (s, d) { return s + (PROZESSE[d][f] || []).length; }, 0);
        return '<div class="zeile"><span lang="en">' + esc(f) + '</span><span>' + n + '</span></div>';
      }).join('') + '<div class="zeile summe"><span>Prozesse gesamt</span><span>40</span></div></div></section>' +
      '<section class="karte"><span class="ueber">6 Principles</span><ol class="principles" lang="en">' +
      PRINCIPLES.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol></section>' +
      '<p class="leise">Eigene Darstellung nach der Struktur des PMBOK Guide 8; Focus Areas entsprechen den früheren Process Groups. <a href="#/quellen">Quellen und Hinweise</a></p>' +
      '</main>' + nav('uebersicht');
  }

  function fragenbankKarte() {
    var aktiv = S.aktivesSet === 'alle' ? 'Alle Sets gemischt' : setName(S.aktivesSet);
    var n = vorrat.bereit ? vorrat.bereit.length : 0;
    return '<section class="karte" data-fb-karte><span class="ueber">Fragenbank und Sets</span>' +
      '<a class="zeilenlink" href="#/datenquelle"><span>Datenquelle: ' + esc(quelleText()) + '</span>' + IKON.rechts + '</a>' +
      '<p>' + fragen.length + ' aktive Fragen in ' + setKeys().length + ' Sets · aktiv: <b>' + esc(aktiv) + '</b></p>' +
      (n ? '<p class="meldung gut">Neu bereit: ' + n + (n === 1 ? ' Set' : ' Sets') + ' – unter „Fragensets“ übernehmen.</p>' : '') +
      '<p class="leise">' + (datenStand ? 'Geladen am ' + esc(datumZeit(datenStand)) : 'Noch nicht geladen') + (ladeFehler ? ' · letzter Abruf fehlgeschlagen' : '') + '</p>' +
      '<div class="knopfreihe" style="grid-template-columns:1fr 1fr"><a class="knopf klein" href="#/sets">Fragensets</a>' +
      '<button class="knopf zweit klein" data-neu' + (Q ? '' : ' disabled') + '>Fragen neu laden</button></div></section>';
  }
  function bindeFb() {
    var neu = app.querySelector('[data-neu]');
    if (neu) neu.addEventListener('click', function (e) {
      e.target.disabled = true; e.target.textContent = 'Lade …';
      ladeFragenbank().then(function () { zeigeEinstellungen('<p class="meldung gut">Fragen neu geladen: ' + fragen.length + ' aktive Fragen.</p>'); },
        function () { zeigeEinstellungen('<p class="meldung fehler">Laden fehlgeschlagen: ' + esc(ladeFehler) + '</p>'); });
    });
  }
  function erneuereFbKarte() {
    var k = app.querySelector('[data-fb-karte]');
    if (k) { k.outerHTML = fragenbankKarte(); bindeFb(); }
  }
  function dateiNativ() { return NATIV && PLUG.Datei ? PLUG.Datei : null; }

  function zeigeEinstellungen(meldung) {
    var t = S.theme;
    var importKnopf = dateiNativ()
      ? '<a class="knopf zweit klein" href="#/import">Importieren</a>'
      : '<label class="knopf zweit klein" style="cursor:pointer">Importieren<input type="file" accept="application/json,.json" class="versteckt" data-import></label>';
    var html = '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="#/start">' + IKON.links + 'Zurück</a></div>' +
      '<h1 class="gross">Einstellungen</h1>' + (meldung || '') + updateHinweis() +
      fragenbankKarte() +
      '<section class="karte"><span class="ueber">Dein Name</span><input class="eingabe" type="text" maxlength="40" autocomplete="given-name" placeholder="für die Begrüßung (optional)" value="' + esc(S.name) + '" data-name></section>' +
      '<section class="karte"><span class="ueber">Lernstand</span><p class="leise">Der Lernstand liegt nur auf diesem Gerät. Sichere ihn ab und zu als Datei.' +
      (dateiNativ() ? ' Beide Seiten zeigen zuerst den Speicherort; erst dann tippst du auf „Exportieren“ bzw. wählst die Sicherung.' : '') + '</p>' +
      '<div class="knopfreihe" style="grid-template-columns:1fr 1fr">' +
      (dateiNativ() ? '<a class="knopf zweit klein" href="#/export">Exportieren</a>' : '<button class="knopf zweit klein" data-export>Exportieren</button>') +
      importKnopf + '</div></section>' +
      erinnerungsKarte() +
      '<section class="karte"><span class="ueber">Darstellung</span><div class="segment" role="group" aria-label="Farbschema">' +
      [['hell', 'Hell'], ['dunkel', 'Dunkel'], ['auto', 'Auto']].map(function (m) {
        return '<button data-theme="' + m[0] + '" aria-pressed="' + (t === m[0]) + '">' + m[1] + '</button>';
      }).join('') + '</div><p class="leise">Auto folgt der Einstellung des Handys.</p></section>' +
      versionsKarte() +
      '<section class="karte"><span class="ueber">Rechtliches</span><a class="zeilenlink" href="#/datenschutz">Datenschutzerklärung' + IKON.rechts + '</a>' +
      '<a class="zeilenlink" href="#/quellen">Quellen und Hinweise' + IKON.rechts + '</a></section>' +
      '<p class="leise" style="text-align:center">PMP-Lernpartner ' + APP_VERSION + '</p></main>';
    app.innerHTML = html;
    app.querySelectorAll('[data-theme]').forEach(function (el) {
      el.addEventListener('click', function () { S.theme = el.getAttribute('data-theme'); speichere(); wendeThemaAn(); render(); });
    });
    var ex = app.querySelector('[data-export]');
    if (ex) ex.addEventListener('click', exportiere);
    var nm = app.querySelector('[data-name]');
    if (nm) nm.addEventListener('change', function () { S.name = nm.value.trim().slice(0, 40); speichere(); });
    bindeErinnerungen();
    bindeUpdate();
    bindeFb();
    var up = app.querySelector('[data-update-pruefen]');
    if (up) up.addEventListener('click', function () {
      var p = pruefeUpdate(true); zeigeEinstellungen(meldung);
      p.then(function () { if (aktuelleRoute().name === 'einstellungen') zeigeEinstellungen(meldung); });
    });
    var imp = app.querySelector('[data-import]');
    if (imp) imp.addEventListener('change', importiere);
    pruefeVorrat();
  }

  function erinnerungsKarte() {
    if (!NATIV) {
      return '<section class="karte"><span class="ueber">Erinnerungen</span><p class="leise">Im Browser kommen keine Erinnerungen von der Lern-App. In der Android-App des PMP-Lernpartners plant das Handy sie selbst, täglich zu festen Zeiten.</p></section>';
    }
    var e = S.erinnerung;
    var status = !LN ? 'Erinnerungen sind in dieser Version nicht verfügbar.'
      : !e.an ? 'Aus.'
      : erin.erlaubt === false ? 'Benachrichtigungen sind nicht erlaubt. Erlaube sie in den Android-Einstellungen für den PMP-Lernpartner.'
      : erin.fehler ? 'Fehler: ' + erin.fehler
      : erin.geplant ? 'Eingeplant: täglich um ' + e.zeiten.join(', ') + ' Uhr.' : 'Wird eingeplant …';
    return '<section class="karte"><span class="ueber">Erinnerungen</span>' +
      '<div class="segment" role="group" aria-label="Erinnerungen"><button data-erin-an="1" aria-pressed="' + e.an + '">An</button><button data-erin-an="0" aria-pressed="' + !e.an + '">Aus</button></div>' +
      '<div class="zeiten">' + e.zeiten.map(function (z, i) {
        return '<label><span class="leise">' + ['Früh', 'Mittag', 'Abend'][i] + '</span><input type="time" data-zeit="' + i + '" value="' + esc(z) + '"' + (e.an ? '' : ' disabled') + '></label>';
      }).join('') + '</div>' +
      '<p class="leise" data-erin-status>' + esc(status) + '</p>' +
      '<button class="knopf zweit klein" data-erin-test' + (e.an ? '' : ' disabled') + '>Test-Erinnerung in 1 Minute</button></section>';
  }
  function bindeErinnerungen() {
    if (!NATIV) return;
    var neu = function (meldung) { planeErinnerungen(true).then(function () { if (aktuelleRoute().name === 'einstellungen') zeigeEinstellungen(meldung); }); };
    app.querySelectorAll('[data-erin-an]').forEach(function (el) {
      el.addEventListener('click', function () { S.erinnerung.an = el.getAttribute('data-erin-an') === '1'; speichere(); neu(); });
    });
    app.querySelectorAll('[data-zeit]').forEach(function (el) {
      el.addEventListener('change', function () {
        if (!/^\d{2}:\d{2}$/.test(el.value)) return;
        S.erinnerung.zeiten[+el.getAttribute('data-zeit')] = el.value; speichere();
        neu('<p class="meldung gut">Erinnerungszeiten gespeichert.</p>');
      });
    });
    var t = app.querySelector('[data-erin-test]');
    if (t) t.addEventListener('click', function () {
      t.disabled = true;
      testErinnerung().then(function () { zeigeEinstellungen('<p class="meldung gut">Test-Erinnerung kommt in etwa einer Minute. Du kannst die App schließen.</p>'); },
        function (err) { zeigeEinstellungen('<p class="meldung fehler">' + esc((err && err.message) || err) + '</p>'); });
    });
  }

  function abgebrochen(err) {
    return !!err && (err.code === 'ABGEBROCHEN' || /abgebrochen|cancel/i.test(String(err.message || err)));
  }
  /* Ergebnis melden: in den Einstellungen als Meldung, sonst (z. B. Update-Karte auf Start) als kurzer Hinweis. */
  function meldeErgebnis(html) {
    if (aktuelleRoute().name === 'einstellungen') { zeigeEinstellungen(html); return; }
    var alt = document.querySelector('.toast'); if (alt) alt.remove();
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.innerHTML = html;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 5000);
  }
  function exportiere() {
    var daten = exportText();
    var d = new Date();
    var name = 'pmp-lernstand-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json';
    // Android-App: eigene Export-Seite (Speicherort, dann Exportieren)
    if (dateiNativ()) { location.hash = '#/export'; return; }
    if (NATIV) {
      // ältere Android-App ohne DateiPlugin: über "Teilen"
      exportiereNativ(name, daten).catch(function (err) {
        if (abgebrochen(err)) return;
        meldeErgebnis('<p class="meldung fehler">Export fehlgeschlagen: ' + esc((err && err.message) || err) + '</p>');
      });
      return;
    }
    var blob = new Blob([daten], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  /* Export-Datei: Lernstand und (seit 1.8.0) die Datenquelle – beim Google Sheet Adresse und Schlüssel,
     bei einer lokalen Datei deren Inhalt. Damit stellt ein Import auf einem neuen Handy alles wieder her. */
  function exportText() {
    var o = { app: 'PMP-Lernpartner', version: APP_VERSION, exportiert: new Date().toISOString(), lernstand: S };
    if (istSheet()) o.quelle = { art: 'sheet', url: Q.url, schluessel: Q.schluessel, name: Q.name || '' };
    else if (Q && Q.art === 'datei') { var c = gemerkteCsv(); if (c) o.quelle = { art: 'datei', name: Q.name || '', csv: c.text }; }
    return JSON.stringify(o, null, 1);
  }
  function uebernimmLernstand(text) {
    try {
      var j = JSON.parse(text);
      var ls = j.lernstand || j;
      if (!ls || typeof ls.antworten !== 'object') throw new Error('Keine Lernstand-Datei');
      var q = j.quelle;
      var mitQuelle = q && ((q.art === 'sheet' && q.url && q.schluessel) || (q.art === 'datei' && typeof q.csv === 'string'));
      if (!window.confirm('Lernstand' + (mitQuelle ? ' und Datenquelle' : '') + ' aus der Datei übernehmen? Der aktuelle Lernstand auf diesem Gerät wird ersetzt.')) return;
      S = normalisiere(ls); speichere(); wendeThemaAn();
      sitzung = { id: null, phase: 'frage', antwort: null, quelle: 'lernen', durch: false };
      var weiter = Promise.resolve();
      if (mitQuelle && q.art === 'sheet') {
        speichereQuelle({ art: 'sheet', url: q.url, schluessel: q.schluessel, name: q.name || 'Fragenbank' });
        weiter = ladeFragenbank().catch(function () {});
      } else if (mitQuelle) {
        try { leseDatei(q.name, q.csv); } catch (e) {}
      }
      weiter.then(function () {
        planeErinnerungen(false);
        zuEinstellungen('<p class="meldung gut">Lernstand' + (mitQuelle ? ' und Datenquelle' : '') + ' importiert.</p>' +
          (ladeFehler ? '<p class="meldung fehler">Fragen laden: ' + esc(ladeFehler) + '</p>' : ''));
      });
    } catch (err) {
      zuEinstellungen('<p class="meldung fehler">Import fehlgeschlagen: ' + esc(err.message || err) + '</p>');
    }
  }
  /* Einstellungen mit Meldung zeigen – auch von der Import-Seite aus (dann erst die Adresse wechseln). */
  function zuEinstellungen(html) {
    if (aktuelleRoute().name === 'einstellungen') { zeigeEinstellungen(html); return; }
    ui.meldung = html;
    location.hash = '#/einstellungen';
  }
  function importiere(e) {
    var d = e.target.files && e.target.files[0];
    if (!d) return;
    var r = new FileReader();
    r.onload = function () { uebernimmLernstand(r.result); };
    r.readAsText(d);
  }
  /* Android-App: "Öffnen" des Systems (DateiPlugin.java) – auf der Import-Seite unter „Andere Datei wählen…“ */
  function importiereNativ() {
    dateiNativ().oeffnen().then(function (r) { uebernimmLernstand(r && r.inhalt); }, function (err) {
      if (abgebrochen(err)) return;
      zuEinstellungen('<p class="meldung fehler">Import fehlgeschlagen: ' + esc((err && err.message) || err) + '</p>');
    });
  }

  /* ---------- Export- und Import-Seite der Android-App ----------
     Seit 1.6.0 Import-Seite, seit 1.7.0 Export-Seite nach demselben Aufbau: zuerst der Speicherort
     (Standard Download/PMP-Lernpartner oder ein selbst gewählter Ordner), dann bestätigen – mit „Abbrechen“.
     Der gewählte Ordner gilt nur für dieses Gerät und steht deshalb nicht im Lernstand (Schlüssel pmplp.ordner). */
  var STANDARD_ORT = 'Download/PMP-Lernpartner';
  function gewaehlterOrdner() {
    try { var o = JSON.parse(localStorage.getItem('pmplp.ordner') || 'null'); return o && o.ordner ? o : null; } catch (e) { return null; }
  }
  function merkeOrdner(o) {
    try { if (o) localStorage.setItem('pmplp.ordner', JSON.stringify({ ordner: o.ordner, name: o.name })); else localStorage.removeItem('pmplp.ordner'); } catch (e) {}
  }
  function ordnerArg() { var o = gewaehlterOrdner(); return o ? { ordner: o.ordner } : {}; }
  function keinZugriff(err) { return !!err && err.code === 'KEIN_ZUGRIFF'; }
  function groesse(b) { return b >= 1024 * 1024 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function heutigerName() {
    var d = new Date();
    return 'pmp-lernstand-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json';
  }
  function lernstandDaten() {
    return exportText();
  }
  /* Karte „Speicherort“ – gleich auf beiden Seiten */
  function ortKarte(datei, moeglich) {
    var o = gewaehlterOrdner();
    var ort = o ? esc(o.name) : moeglich === false ? 'wird im Dialog von Android gewählt' : STANDARD_ORT;
    return '<section class="karte"><span class="ueber">Speicherort</span><p class="ortname">' + ort + '</p>' +
      '<p class="leise">' + (o ? 'Von dir gewählter Ordner.' : moeglich === false ? 'Auf diesem Handy (vor Android 10) gibt es keinen Standardordner.' : 'Standardordner im Download-Ordner deines Handys.') + '</p>' +
      (datei.ordnerWaehlen ? '<div class="knopfreihe" style="grid-template-columns:1fr"><button class="knopf zweit klein" data-ordner-waehlen>Anderen Ordner wählen …</button>' +
        (o ? '<button class="knopf zweit klein" data-ordner-standard>Standardordner verwenden</button>' : '') + '</div>' : '') + '</section>';
  }
  function bindeOrt(datei, neuZeichnen) {
    var w = app.querySelector('[data-ordner-waehlen]');
    if (w) w.addEventListener('click', function () {
      datei.ordnerWaehlen().then(function (r) { merkeOrdner(r); neuZeichnen(); }, function (err) {
        if (abgebrochen(err)) return;
        neuZeichnen('<p class="meldung fehler">Ordner lässt sich nicht verwenden: ' + esc((err && err.message) || err) + '</p>');
      });
    });
    var st = app.querySelector('[data-ordner-standard]');
    if (st) st.addEventListener('click', function () { merkeOrdner(null); neuZeichnen(); });
  }
  function seitenRahmen(titel, meldung, inhalt, knoepfe) {
    return '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="#/einstellungen">' + IKON.links + 'Einstellungen</a></div>' +
      '<h1 class="gross">' + titel + '</h1>' + (meldung || '') + inhalt +
      '<div class="knopfreihe" style="grid-template-columns:1fr">' + knoepfe + '</div></main>';
  }
  /* Sicherungen am Speicherort holen; ist der gewählte Ordner nicht mehr erreichbar, zurück auf den Standard. */
  function holeSicherungen(datei) {
    if (!datei.sicherungen) return Promise.resolve({ moeglich: false, liste: [] });
    return datei.sicherungen(ordnerArg()).catch(function (err) {
      if (!keinZugriff(err)) throw err;
      merkeOrdner(null);
      return datei.sicherungen({}).then(function (r) { r.hinweis = 'Auf den gewählten Ordner gibt es keinen Zugriff mehr – zurück auf ' + STANDARD_ORT + '.'; return r; });
    });
  }

  function zeigeExport(meldung) {
    var datei = dateiNativ();
    if (!datei) { location.hash = '#/einstellungen'; return; }
    var name = heutigerName(), info = null, moeglich = true, laeuft = false;
    var zeichne = function (m) {
      if (m !== undefined) meldung = m;
      var dateiInfo = info === null ? 'Speicherort wird geprüft …'
        : info.heute ? 'Eine Sicherung von heute liegt dort schon und wird ersetzt.'
        : info.anzahl ? 'Dort liegen ' + info.anzahl + (info.anzahl === 1 ? ' Sicherung' : ' Sicherungen') + ', die neueste vom ' + esc(datumZeit(info.neueste)) + '.'
        : 'Dort liegt noch keine Sicherung.';
      app.innerHTML = seitenRahmen('Lernstand exportieren', meldung,
        ortKarte(datei, moeglich) +
        '<section class="karte"><span class="ueber">Datei</span><p class="ortname">' + esc(name) + '</p><p class="leise">' + dateiInfo + '</p></section>',
        '<button class="knopf" data-exportieren' + (laeuft ? ' disabled' : '') + '>Exportieren</button>' +
        '<a class="knopf zweit" href="#/einstellungen" data-abbrechen>Abbrechen</a>');
      bindeOrt(datei, function (m2) { info = null; zeichne(m2 || ''); lade(); });
      app.querySelector('[data-exportieren]').addEventListener('click', exportieren);
    };
    var lade = function () {
      holeSicherungen(datei).then(function (r) {
        if (aktuelleRoute().name !== 'export') return;
        moeglich = !(r && r.moeglich === false) || !!gewaehlterOrdner();
        var liste = (r && r.liste) || [];
        info = { anzahl: liste.length, heute: liste.some(function (e) { return e.name === name; }),
          neueste: liste.reduce(function (m, e) { return Math.max(m, e.geaendert || 0); }, 0) };
        zeichne(r && r.hinweis ? '<p class="meldung">' + esc(r.hinweis) + '</p>' : undefined);
      }, function () { if (aktuelleRoute().name === 'export') { info = { anzahl: 0 }; zeichne(); } });
    };
    var exportieren = function () {
      laeuft = true; zeichne();
      var daten = lernstandDaten();
      var fertig = function (r, ort) { zuEinstellungen('<p class="meldung gut">Lernstand gespeichert' + (ort ? ' in ' + esc(ort) : '') + ': ' + esc((r && r.name) || name) + '</p>'); };
      var fehler = function (err) {
        laeuft = false;
        if (abgebrochen(err)) { zeichne(); return; }
        if (keinZugriff(err)) { merkeOrdner(null); info = null; zeichne('<p class="meldung fehler">Auf den gewählten Ordner gibt es keinen Zugriff mehr. Wähle ihn neu oder nimm den Standardordner.</p>'); lade(); return; }
        zeichne('<p class="meldung fehler">Speichern fehlgeschlagen: ' + esc((err && err.message) || err) + '</p>');
      };
      var mitDialog = function () { datei.speichern({ name: name, inhalt: daten, mime: 'application/json' }).then(function (r) { fertig(r, ''); }, fehler); };
      if (!datei.sichern) { mitDialog(); return; }
      datei.sichern(Object.assign({ name: name, inhalt: daten, mime: 'application/json' }, ordnerArg())).then(function (r) {
        fertig(r, (r && r.ort) || STANDARD_ORT);
      }, function (err) { if (err && err.code === 'NICHT_MOEGLICH') mitDialog(); else fehler(err); });
    };
    zeichne(); lade();
  }

  function zeigeImport(meldung) {
    var datei = dateiNativ();
    if (!datei) { location.hash = '#/einstellungen'; return; }
    var moeglich = true;
    var seite = function (inhalt) {
      app.innerHTML = seitenRahmen('Lernstand importieren', meldung,
        ortKarte(datei, moeglich) + inhalt,
        '<button class="knopf zweit" data-andere>Andere Datei wählen …</button>' +
        '<a class="knopf" href="#/einstellungen" data-abbrechen>Abbrechen</a>');
      bindeOrt(datei, function (m) { meldung = m || ''; laden(); });
      app.querySelector('[data-andere]').addEventListener('click', importiereNativ);
      app.querySelectorAll('[data-sicherung]').forEach(function (el) {
        el.addEventListener('click', function () {
          el.disabled = true;
          datei.lesen({ id: el.getAttribute('data-sicherung') }).then(function (r) {
            el.disabled = false; uebernimmLernstand(r && r.inhalt);
          }, function (err) {
            el.disabled = false;
            zuEinstellungen('<p class="meldung fehler">Import fehlgeschlagen: ' + esc((err && err.message) || err) + '</p>');
          });
        });
      });
    };
    var karte = function (text, listeHtml) {
      return '<section class="karte"><span class="ueber">Deine Sicherungen</span><p class="leise">' + text + '</p>' + (listeHtml || '') + '</section>';
    };
    var laden = function () {
      seite(karte('Sicherungen werden gesucht …'));
      holeSicherungen(datei).then(function (r) {
        if (aktuelleRoute().name !== 'import') return;
        if (r && r.hinweis) meldung = '<p class="meldung">' + esc(r.hinweis) + '</p>';
        var liste = ((r && r.liste) || []).slice().sort(function (a, b) { return (b.geaendert || 0) - (a.geaendert || 0); });
        moeglich = !(r && r.moeglich === false) || !!gewaehlterOrdner();
        if (!moeglich) { seite(karte('Auf diesem Handy (vor Android 10) geht der Import ohne gewählten Ordner nur über „Andere Datei wählen …“.')); return; }
        if (!liste.length) {
          seite(karte('Noch keine Sicherung an diesem Speicherort. Mit „Exportieren“ legst du eine an. ' +
            'Dateien aus der Lern-App im Browser, aus Drive oder von vor einer Neuinstallation findest du über „Andere Datei wählen …“.'));
          return;
        }
        seite(karte('Antippen übernimmt den Lernstand – vorher kommt eine Rückfrage.',
          '<div class="sicherungen">' + liste.map(function (e) {
            return '<button class="sicherung" data-sicherung="' + esc(e.id) + '"><span class="name">' + esc(e.name) + '</span>' +
              '<span class="leise">' + esc(datumZeit(e.geaendert)) + ' · ' + esc(groesse(e.groesse || 0)) + '</span></button>';
          }).join('') + '</div>'));
      }, function (err) {
        if (aktuelleRoute().name !== 'import') return;
        seite(karte('Sicherungen lassen sich nicht lesen: ' + esc((err && err.message) || err)));
      });
    };
    laden();
  }

  /* ---------- Datenschutzerklärung (seit Lern-App 1.5.0, nach dem Vorbild von Saschas Homepage) ---------- */
  function zeigeDatenschutz() {
    var ext = function (url, text) { return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>'; };
    app.innerHTML = '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="#/einstellungen">' + IKON.links + 'Einstellungen</a></div>' +
      '<article class="rechtlich">' +
      '<p class="leise">Diese private, nicht-geschäftliche Lernhilfe verzichtet bewusst auf Cookies, Tracking, Werbung und externe Schriften. Diese Erklärung ist keine Rechtsberatung.</p>' +
      '<h1 class="gross">Datenschutzerklärung</h1>' +
      '<h2>1. Verantwortlicher</h2><p>Sascha Martin<br>E-Mail: <a href="mailto:Faceman33@web.de">Faceman33@web.de</a></p>' +
      '<h2>2. Dein Lernstand bleibt auf deinem Gerät</h2>' +
      '<p>Deine Antworten, Zeitpunkte, die Fehlerliste, das aktive Fragenset, das Farbschema, deinen Namen für die Begrüßung, die Erinnerungszeiten und die Verbindung zu deiner Datenquelle (bei einem Google Sheet Adresse und persönlicher Schlüssel deines Skripts) speichert der PMP-Lernpartner nur im Speicher deines Geräts – im Browser bzw. in der Android-App. Sie werden weder an mich noch an Dritte übertragen. Die Sicherungsdatei enthält auch die Verbindung; gib sie deshalb nicht weiter. Eine Datei entsteht nur, wenn du selbst „Exportieren“ wählst: in der Android-App im Ordner „Download/PMP-Lernpartner“ deines Handys oder in einem Ordner, den du selbst auswählst, im Browser dort, wo dein Browser Downloads ablegt. Löschst du die Browserdaten oder deinstallierst du die Android-App, ist der Lernstand gelöscht.</p>' +
      '<h2>3. Hosting bei GitHub</h2>' +
      '<p>Die Lern-App im Browser wird bei ' + ext('https://pages.github.com/', 'GitHub Pages') + ' bereitgestellt, die Android-App wird über GitHub zum Herunterladen angeboten (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA; im EU-Raum vertreten durch GitHub B.V.). Beim Abruf verarbeitet GitHub technisch notwendige Daten, insbesondere die IP-Adresse, Datum und Uhrzeit, die angeforderte Datei und den verwendeten Browser (Server-Logfiles). Weitere Informationen: ' +
      ext('https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement', 'Datenschutzerklärung von GitHub') + '.</p>' +
      '<p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer sicheren und stabilen Bereitstellung). Dabei kann es zu einer Übermittlung in die USA kommen; GitHub ist nach dem EU-US Data Privacy Framework zertifiziert, das ein angemessenes Datenschutzniveau gewährleisten soll.</p>' +
      '<h2>4. Deine Fragenbank</h2>' +
      '<p>Der PMP-Lernpartner enthält selbst keine Fragen. Du verbindest ihn mit deiner eigenen Datenquelle; ich erhalte davon nichts.</p>' +
      '<p><b>Lokale Datei:</b> Liest du eine CSV-Datei ein, bleiben die Fragen nur im Speicher deines Geräts. Es wird nichts übertragen.</p>' +
      '<p><b>Eigenes Google Sheet:</b> Verbindest du ein Google Sheet, ruft der PMP-Lernpartner die Fragen über das Apps Script in deinem eigenen Google-Konto ab (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland; Muttergesellschaft Google LLC, USA). Gleiches gilt, wenn du nach neuen Sets suchst oder sie übernimmst. Übermittelt werden nur die gewünschte Aktion und dein persönlicher Schlüssel; dein Lernstand wird nicht übertragen. Google erhält dabei technisch notwendige Daten, insbesondere deine IP-Adresse, den Zeitpunkt und Angaben zu Browser bzw. Gerät. Die Verbindungs-Mail schickt dein Skript aus deinem Google-Konto an dich selbst. Weitere Informationen: ' +
      ext('https://policies.google.com/privacy', 'Datenschutzerklärung von Google') + '.</p>' +
      '<p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse, deine Fragen aktuell und korrigierbar bereitzustellen). Google LLC ist nach dem EU-US Data Privacy Framework zertifiziert.</p>' +
      '<h2>5. Prüfung auf neue Versionen (nur Android-App)</h2>' +
      '<p>Die Android-App fragt höchstens alle sechs Stunden und wenn du „Nach Updates suchen“ wählst bei GitHub (api.github.com) die Nummer der neuesten Version ab. Dabei werden keine Daten über dich oder deinen Lernstand gesendet; GitHub erhält wie bei jedem Abruf deine IP-Adresse (siehe Abschnitt 3). Eine neue Version lädst du selbst über den Browser herunter.</p>' +
      '<h2>6. Erinnerungen und Berechtigungen (nur Android-App)</h2>' +
      '<p>Die drei täglichen Erinnerungen plant dein Handy selbst als lokale Benachrichtigungen. Es gibt keinen Push-Dienst und keinen Server, der dir Nachrichten schickt.</p>' +
      '<p>Die Android-App nutzt folgende Berechtigungen: Internet (Fragen aus deinem Google Sheet laden, nach neuen Versionen suchen), Benachrichtigungen anzeigen, nach einem Neustart des Handys die Erinnerungen wieder einplanen sowie – als Teil des Benachrichtigungs-Moduls – Wecker und kurzes Aktivhalten des Geräts. Auf Kontakte, Standort, Kamera oder Mikrofon greift sie nicht zu. Dateien schreibt sie nur, wenn du „Exportieren“ wählst, und zwar in den Ordner „Download/PMP-Lernpartner“ oder in einen Ordner, den du in der Ordnerauswahl von Android freigibst; beim Importieren liest sie nur die Sicherungen an diesem Speicherort oder die Datei, die du in der Dateiauswahl von Android auswählst. Eine allgemeine Speicher-Berechtigung braucht sie dafür nicht; mit „Standardordner verwenden“ nutzt sie den gewählten Ordner nicht mehr.</p>' +
      '<h2>7. Keine Cookies, kein Tracking</h2>' +
      '<p>Der PMP-Lernpartner setzt keine Cookies und verwendet keine Analyse- oder Werbedienste. Schriften und Programmcode kommen vom eigenen Server bzw. aus der Android-App selbst. Damit der PMP-Lernpartner auch offline läuft, liegen seine Dateien und der zuletzt geladene Stand deiner Fragen im Speicher deines Geräts.</p>' +
      '<h2>8. Externe Links</h2>' +
      '<p>Links zu GitHub, Google und anderen Seiten öffnen fremde Angebote. Erst wenn du einen solchen Link antippst, verlässt du den PMP-Lernpartner; ab dann gilt die Datenschutzerklärung des jeweiligen Anbieters.</p>' +
      '<h2>9. Kontaktaufnahme</h2>' +
      '<p>Wenn du mir per E-Mail schreibst, verarbeite ich deine Angaben zur Bearbeitung deiner Anfrage (Art. 6 Abs. 1 lit. b oder f DSGVO) und lösche sie, sobald sie nicht mehr erforderlich sind und keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>' +
      '<h2>10. Deine Rechte</h2>' +
      '<p>Du hast im Rahmen der gesetzlichen Vorgaben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Zudem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), z. B. bei der für deinen Wohnort oder meinen Sitz zuständigen Landesbehörde.</p>' +
      '<h2>11. Aktualität</h2>' +
      '<p>Stand: November 2026 (Lern-App ' + APP_VERSION + '). Ich passe diese Erklärung an, wenn sich der PMP-Lernpartner oder die Rechtslage ändert.</p>' +
      '</article></main>';
  }

  /* ---------- Quellen und Hinweise (seit Lern-App 1.9.0, Entscheidung 34) ---------- */
  function zeigeQuellen() {
    var zurueck = ui.quellenVon || '#/einstellungen';
    var name = zurueck === '#/uebersicht' ? 'Übersicht' : zurueck === '#/start' ? 'Start' : 'Einstellungen';
    app.innerHTML = '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="' + zurueck + '">' + IKON.links + name + '</a></div>' +
      '<article class="rechtlich">' +
      '<h1 class="gross">Quellen und Hinweise</h1>' +
      '<h2>Zweck</h2>' +
      '<p>Der PMP-Lernpartner ist eine private, nicht-kommerzielle Lernhilfe zur Vorbereitung auf die PMP-Prüfung. Er ersetzt keine offiziellen Unterlagen.</p>' +
      '<h2>Keine Fragen enthalten</h2>' +
      '<p>Der PMP-Lernpartner liefert keine Fragen mit. Die Fragenbank stellt jede Person selbst bereit oder erzeugt sie selbst – als eigenes Google Sheet oder als CSV-Datei – und ist für ihren Inhalt selbst verantwortlich.</p>' +
      '<h2>Quellen der Inhalte</h2>' +
      '<p>Übersichten, Formeln und Erklärungen in der App beruhen auf frei zugänglichen, öffentlich verfügbaren Informationen; Teile sind mit KI erstellt. Texte aus Veröffentlichungen des PMI oder aus Büchern werden nicht übernommen.</p>' +
      '<ul><li><b>Prozessübersicht:</b> Eigene Darstellung nach der Struktur des PMBOK Guide 8.</li>' +
      '<li><b>Earned Value:</b> Gängige Earned-Value-Formeln; Beispiele, Zahlen und Texte sind eigene.</li></ul>' +
      '<h2>Marken</h2>' +
      '<p>PMI, PMP und PMBOK sind eingetragene Marken des Project Management Institute, Inc. Der PMP-Lernpartner steht in keiner Verbindung zum PMI und wird vom PMI weder unterstützt noch geprüft.</p>' +
      '<h2>Keine Gewähr</h2>' +
      '<p>Die Inhalte sind sorgfältig erstellt, aber ohne Gewähr für Richtigkeit, Vollständigkeit oder Prüfungserfolg. Maßgeblich sind die offiziellen Unterlagen des PMI.</p>' +
      '<h2>Fehler gefunden?</h2>' +
      '<p>Hinweise gern per E-Mail an <a href="mailto:Faceman33@web.de">Faceman33@web.de</a>.</p>' +
      '<p class="leise">Stand: November 2026 (Lern-App ' + APP_VERSION + ').</p>' +
      '</article></main>';
  }

  /* ---------- Hilfe: neuen Fragenkatalog einrichten (seit 1.8.0) ---------- */

  function zeigeHilfe() {
    var tab = ui.hilfeTab === 'datei' ? 'datei' : 'sheet';
    var zurueck = ui.hilfeVon || '#/start';
    var spalten = '<section class="karte"><span class="ueber">Spalten der Fragenbank</span>' +
      '<p class="leise">Die erste Zeile enthält die Spaltenköpfe (klein geschrieben). Die Reihenfolge ist egal.</p>' +
      '<table class="hilfe-tabelle"><thead><tr><th>Spalte</th><th>Inhalt</th></tr></thead><tbody>' +
      [['id', 'Pflicht. Eindeutig und dauerhaft, z. B. P01-001. Nie ändern – der Lernstand hängt daran.'],
       ['frage', 'Pflicht. Fragetext.'],
       ['a, b, c, d', 'Pflicht. Die vier Antworten.'],
       ['loesung', 'Pflicht. Buchstabe der richtigen Antwort: A, B, C oder D.'],
       ['aktiv', 'Wahlweise. „ja“ oder „nein“ zum Abschalten einzelner Fragen. Fehlt die Spalte, sind alle aktiv.'],
       ['paket', 'Wahlweise. Fragenset, z. B. P01 = „Set 1“, ME1 = „Mock Exam 1“. Fehlt sie, zählt der Teil der ID vor dem Bindestrich.'],
       ['domain, focus_area, prozess', 'Wahlweise. Einordnung über der Frage und Grundlage der Statistik.'],
       ['warum, warum_nicht', 'Wahlweise. Erklärung der richtigen bzw. der falschen Antworten.'],
       ['referenz, merksatz', 'Wahlweise. Erscheinen bei falscher Antwort.']
      ].map(function (z) { return '<tr><td>' + z[0].split(', ').map(function (n) { return '<code>' + esc(n) + '</code>'; }).join('<br>') + '</td><td>' + esc(z[1]) + '</td></tr>'; }).join('') +
      '</tbody></table></section>';
    var sheet =
      '<section class="karte"><span class="ueber">Was du brauchst</span>' +
      '<p>Ein Google-Konto, einmal einen PC (oder Chrome am Handy mit „Desktopversion“) und den <b>Kopier-Link der Vorlage</b> von der Person, die dir den PMP-Lernpartner gegeben hat.</p>' +
      '<p class="leise">Vorteil: Du pflegst die Fragen bequem im Google Sheet, Korrekturen sind sofort in der App. Nur du kommst mit deinem persönlichen Schlüssel an die Fragen.</p></section>' +
      '<section class="karte"><span class="ueber">1 · Vorlage kopieren</span><ol class="schritte">' +
      '<li>Kopier-Link öffnen und „Kopie erstellen“ tippen. Die Fragenbank liegt dann in deinem Google Drive, das Skript ist mitkopiert.</li>' +
      '<li>Optional umbenennen, z. B. „Meine Fragenbank“.</li></ol></section>' +
      '<section class="karte"><span class="ueber">2 · Skript einrichten (einmal, am PC)</span><ol class="schritte">' +
      '<li>In deiner Kopie: <b>Erweiterungen → Apps Script</b>.</li>' +
      '<li>Oben die Funktion <b>einrichten</b> wählen und <b>Ausführen</b> tippen.</li>' +
      '<li>Zugriff erlauben. Erscheint „Google hat diese App nicht überprüft“: <b>Erweitert</b> → <b>Weiter zu …</b> → <b>Zulassen</b>. Das Skript läuft nur in deinem Konto.</li>' +
      '<li><b>Bereitstellen → Neue Bereitstellung</b>, Typ <b>Web-App</b>. Ausführen als: <b>Ich</b>. Zugriff: <b>Jeder</b>. → Bereitstellen.</li>' +
      '<li>Die angezeigte <b>Web-App-URL</b> (endet auf /exec) kopieren und im Sheet im Tab <b>„Verbindung“</b> in Zelle <b>B9</b> einfügen. In B7 erscheint dann dein Verbindungscode.</li></ol>' +
      '<p class="leise">„Zugriff: Jeder“ ist nötig, damit die App das Skript erreicht. Ohne deinen Schlüssel liefert es nichts.</p></section>' +
      '<section class="karte"><span class="ueber">3 · Fragen eintragen</span>' +
      '<p>Im Tab <b>„Fragen“</b> eine Frage pro Zeile, Spalten siehe unten. Korrigieren kannst du jederzeit, auch in der Sheets-App am Handy.</p></section>' +
      '<section class="karte"><span class="ueber">4 · App verbinden (am Handy)</span><ol class="schritte">' +
      '<li>In der Sheets-App deine Fragenbank öffnen, unten zum Tab <b>„Verbindung“</b>.</li>' +
      '<li>Kästchen <b>„Verbindungs-Mail senden“</b> anhaken. Du bekommst eine Mail an dein Google-Konto.</li>' +
      '<li>In der Mail auf <b>„PMP-Lernpartner verbinden“</b> tippen – fertig. Öffnet sich der Browser: dort „In der Android-App verbinden“ tippen.</li></ol>' +
      '<p class="leise">Ohne Mail: Code aus B7 kopieren → hier Einstellungen → Datenquelle → einfügen → „Verbinden“.</p>' +
      '<a class="knopf klein" href="#/datenquelle">Zur Datenquelle</a></section>' +
      '<section class="karte"><span class="ueber">Gut zu wissen</span><ul class="schritte">' +
      '<li><b>Neuer Schlüssel:</b> Kästchen „Neuen Schlüssel erzeugen“ anhaken. Der alte gilt sofort nicht mehr; danach die App neu verbinden.</li>' +
      '<li><b>Neue Fragensets:</b> CSV-Dateien mit denselben Spalten in den Ordner <b>pakete/neu</b> neben deiner Fragenbank legen, dann in der App Einstellungen → Fragensets → „Übernehmen“.</li>' +
      '<li><b>Neues Handy:</b> Die Lernstand-Sicherung enthält die Verbindung. Importieren genügt. Gib die Sicherung deshalb nicht weiter.</li></ul></section>';
    var datei =
      '<section class="karte"><span class="ueber">Was du brauchst</span>' +
      '<p>Eine CSV-Datei mit deinen Fragen auf dem Handy. Kein Google-Konto, kein Skript.</p>' +
      '<p class="leise">Die Fragen bleiben nur auf diesem Gerät. Für neue oder korrigierte Fragen liest du die Datei neu ein. „Neue Sets übernehmen“ gibt es hier nicht.</p></section>' +
      '<section class="karte"><span class="ueber">1 · Datei erstellen</span><ol class="schritte">' +
      '<li>Tabelle in Excel, Google Sheets oder LibreOffice anlegen: erste Zeile die Spaltenköpfe, darunter eine Frage pro Zeile (Spalten siehe unten).</li>' +
      '<li>Als <b>CSV (UTF-8, durch Komma getrennt)</b> speichern. In Google Sheets: Datei → Herunterladen → CSV. In Excel: „CSV UTF-8 (durch Trennzeichen getrennt)“.</li></ol>' +
      '<p class="leise">Kleinstes Beispiel:</p>' +
      '<pre class="code-beispiel">id,frage,a,b,c,d,loesung\nP01-001,What should the PM do first?,Escalate,Analyze the impact,Ignore it,Close the project,B</pre></section>' +
      '<section class="karte"><span class="ueber">2 · Aufs Handy bringen</span>' +
      '<p>Die Datei z. B. per Mail, Google Drive oder USB in den Download-Ordner des Handys legen.</p></section>' +
      '<section class="karte"><span class="ueber">3 · In der App einlesen</span><ol class="schritte">' +
      '<li>Einstellungen → <b>Datenquelle</b> → <b>„CSV-Datei wählen“</b>.</li>' +
      '<li>Datei auswählen. Die App prüft sie und meldet „… aktive Fragen“ oder, was fehlt.</li></ol>' +
      '<a class="knopf klein" href="#/datenquelle">Zur Datenquelle</a></section>' +
      '<section class="karte"><span class="ueber">Gut zu wissen</span><ul class="schritte">' +
      '<li><b>Fragen ändern:</b> Datei bearbeiten und erneut einlesen. Behalte die IDs bei, dann bleibt dein Lernstand erhalten.</li>' +
      '<li><b>Sets:</b> Mit der Spalte <code>paket</code> (P01, P02 …) teilst du die Fragen in Fragensets auf.</li>' +
      '<li><b>Neues Handy:</b> Die Lernstand-Sicherung enthält auch die Fragen aus der Datei.</li></ul></section>';
    app.innerHTML = '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="' + esc(zurueck) + '">' + IKON.links + 'Zurück</a></div>' +
      '<h1 class="gross">Neuen Fragenkatalog einrichten</h1>' +
      '<p class="unter">Der PMP-Lernpartner lernt mit deiner eigenen Fragenbank. Wähle, wo sie liegen soll.</p>' +
      '<div class="segment" role="group" aria-label="Art der Fragenbank"><button data-hilfe-tab="sheet" aria-pressed="' + (tab === 'sheet') + '">Google Sheet</button>' +
      '<button data-hilfe-tab="datei" aria-pressed="' + (tab === 'datei') + '">Lokale Datei</button></div>' +
      (tab === 'sheet' ? sheet : datei) + spalten + '</main>';
    app.querySelectorAll('[data-hilfe-tab]').forEach(function (el) {
      el.addEventListener('click', function () { ui.hilfeTab = el.getAttribute('data-hilfe-tab'); zeigeHilfe(); window.scrollTo(0, 0); });
    });
  }

  /* ---------- Datenquelle (seit 1.8.0) ---------- */

  function zeigeDatenquelle(meldung) {
    var status;
    if (!Q) status = '<p><b>Keine Datenquelle verbunden.</b></p><p class="leise">Verbinde dein eigenes Google Sheet oder lies eine CSV-Datei ein.' +
      (fragen.length ? ' Bis dahin lernst du mit dem zuletzt geladenen Stand (' + fragen.length + ' Fragen).' : '') + '</p>';
    else status = '<p><b>' + esc(quelleText()) + '</b></p><p class="leise">' + fragen.length + ' aktive Fragen' +
      (datenStand ? ' · geladen am ' + esc(datumZeit(datenStand)) : '') + '</p>' +
      (ladeFehler ? '<p class="meldung fehler">' + esc(ladeFehler) + '</p>' : '');
    app.innerHTML = '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="#/einstellungen">' + IKON.links + 'Einstellungen</a></div>' +
      '<div class="zeile" style="align-items:center"><h1 class="gross">Datenquelle</h1><a class="symbolknopf" href="#/hilfe" aria-label="Anleitung: Fragenkatalog einrichten">' + IKON.hilfe + '</a></div>' + (meldung || '') +
      '<section class="karte"><span class="ueber">Status</span>' + status + '</section>' +
      '<section class="karte"><span class="ueber">Google Sheet verbinden</span>' +
      '<ol class="schritte">' +
      '<li>Öffne deine Fragenbank in Google Sheets und wechsle unten zum Tab „Verbindung“.</li>' +
      '<li>Hake „Verbindungs-Mail senden“ an und tippe am Handy in der Mail auf „PMP-Lernpartner verbinden“ – fertig. <span class="leise">Oder kopiere den Verbindungscode (beginnt mit „PMPLP1.“).</span></li>' +
      '<li>Code hier einfügen und „Verbinden“ tippen.</li></ol>' +
      '<a class="knopf zweit klein" href="https://docs.google.com/spreadsheets/" target="_blank" rel="noopener noreferrer">Google Sheets öffnen</a>' +
      '<textarea class="eingabe" rows="3" placeholder="PMPLP1.…" autocomplete="off" autocapitalize="off" spellcheck="false" data-code></textarea>' +
      '<div class="knopfreihe" style="grid-template-columns:1fr 1fr">' +
      (navigator.clipboard && navigator.clipboard.readText ? '<button class="knopf zweit klein" data-einfuegen>Einfügen</button>' : '<span></span>') +
      '<button class="knopf klein" data-verbinden>Verbinden</button></div>' +
      '<p class="leise">Der Code enthält deinen persönlichen Schlüssel. Er bleibt nur auf diesem Gerät und in deiner Lernstand-Sicherung. Gib ihn nicht weiter.</p></section>' +
      '<section class="karte"><span class="ueber">Lokale Datei</span>' +
      '<p class="leise">CSV-Datei (UTF-8, Komma getrennt) mit Spaltenköpfen in der ersten Zeile. Pflicht: id, frage, a, b, c, d, loesung (A–D). Wahlweise: aktiv, domain, focus_area, prozess, warum, warum_nicht, referenz, merksatz, paket. Die Fragen bleiben nur auf diesem Gerät; für neue Fragen liest du eine neue Datei ein.</p>' +
      '<label class="knopf zweit klein" style="cursor:pointer">CSV-Datei wählen<input type="file" accept=".csv,text/csv,text/comma-separated-values,text/plain" class="versteckt" data-csv></label></section>' +
      (Q ? '<section class="karte"><span class="ueber">Trennen</span><p class="leise">Entfernt die Verbindung und die geladenen Fragen von diesem Gerät. Dein Lernstand bleibt erhalten.</p>' +
        '<button class="knopf zweit klein" data-trennen>Trennen</button></section>' : '') +
      '</main>';
    var feld = app.querySelector('[data-code]');
    var ein = app.querySelector('[data-einfuegen]');
    if (ein) ein.addEventListener('click', function () {
      navigator.clipboard.readText().then(function (t) { feld.value = String(t || '').trim(); },
        function () { zeigeDatenquelle('<p class="meldung fehler">Einfügen nicht erlaubt. Halte das Feld gedrückt und wähle „Einfügen“.</p>'); });
    });
    var vb = app.querySelector('[data-verbinden]');
    if (vb) vb.addEventListener('click', function () {
      vb.disabled = true; vb.textContent = 'Verbinde …';
      starteVerbindung(feld.value);
    });
    var csv = app.querySelector('[data-csv]');
    if (csv) csv.addEventListener('change', function () {
      var d = csv.files && csv.files[0];
      if (!d) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          leseDatei(d.name, String(r.result || ''));
          zeigeDatenquelle('<p class="meldung gut">Datei „' + esc(d.name) + '“ eingelesen: ' + fragen.length + ' aktive Fragen.</p>');
        } catch (err) {
          zeigeDatenquelle('<p class="meldung fehler">Datei nicht übernommen: ' + esc(err.message || err) + '</p>');
        }
      };
      r.onerror = function () { zeigeDatenquelle('<p class="meldung fehler">Datei konnte nicht gelesen werden.</p>'); };
      r.readAsText(d, 'UTF-8');
    });
    var tr = app.querySelector('[data-trennen]');
    if (tr) tr.addEventListener('click', function () {
      if (!window.confirm('Datenquelle trennen? Die geladenen Fragen werden von diesem Gerät entfernt, dein Lernstand bleibt.')) return;
      trenne();
      zeigeDatenquelle('<p class="meldung gut">Getrennt.</p>');
    });
  }
  function starteVerbindung(text) {
    return verbinde(text).then(function () {
      zurDatenquelle('<p class="meldung gut">Verbunden mit ' + esc(quelleText()) + ' · ' + fragen.length + ' aktive Fragen.</p>');
    }, function (err) {
      zurDatenquelle('<p class="meldung fehler">Verbinden fehlgeschlagen: ' + esc((err && err.message) || err) + '</p>');
    });
  }
  function zurDatenquelle(html) {
    if (aktuelleRoute().name === 'datenquelle') { zeigeDatenquelle(html); return; }
    ui.meldung = html;
    location.replace('#/datenquelle');
  }
  /* #/verbinden/<Code>: aus dem Mail-Link (Browser) oder aus der Android-App (App Links) */
  function zeigeVerbinden(code) {
    app.innerHTML = '<main class="seite">' + marke() + '<p class="leise">Verbinde mit deiner Fragenbank …</p></main>';
    if (ui.verbindet === code) return;
    ui.verbindet = code;
    starteVerbindung(code).then(function () { ui.verbindet = null; });
  }
  function zeigeWillkommen() {
    app.innerHTML = '<main class="seite">' + marke() +
      '<div><h1 class="gross">Willkommen</h1><p class="unter">Der PMP-Lernpartner lernt mit deinen eigenen Fragen.</p></div>' +
      '<section class="karte"><p>Verbinde zuerst deine Datenquelle: dein Google Sheet mit dem PMP-Lernpartner-Skript oder eine CSV-Datei mit Fragen.</p>' +
      '<a class="knopf" href="#/datenquelle">Datenquelle verbinden</a>' +
      '<a class="knopf zweit" href="#/hilfe">' + IKON.hilfe + ' Anleitung: Fragenkatalog einrichten</a></section>' +
      '<p class="leise" style="text-align:center"><a href="#/datenschutz">Datenschutzerklärung</a> · <a href="#/quellen">Quellen und Hinweise</a></p></main>';
  }

  function wendeThemaAn() {
    var el = document.documentElement;
    if (S.theme === 'hell' || S.theme === 'dunkel') el.dataset.theme = S.theme; else delete el.dataset.theme;
    var dunkel = S.theme === 'dunkel' || (S.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.setAttribute('content', dunkel ? '#0F1217' : '#F4F5F7');
      if (S.theme !== 'auto') m.removeAttribute('media');
    });
  }

  /* ---------- Steuerung ---------- */

  function aktuelleRoute() {
    var h = (location.hash || '#/start').slice(2).split('/');
    return { name: h[0] || 'start', arg: h[1] ? decodeURIComponent(h[1]) : '' };
  }

  function render() {
    var r0 = aktuelleRoute();
    if (r0.name === 'datenquelle') { var m0 = ui.meldung; ui.meldung = null; return zeigeDatenquelle(m0); }
    if (r0.name === 'verbinden') return zeigeVerbinden(r0.arg);
    if (r0.name === 'datenschutz') return zeigeDatenschutz();
    if (r0.name === 'quellen') return zeigeQuellen();
    if (r0.name === 'hilfe') return zeigeHilfe();
    if (!fragen.length && !Q) {
      if (r0.name === 'einstellungen') { var m1 = ui.meldung; ui.meldung = null; return zeigeEinstellungen(m1); }
      return zeigeWillkommen();
    }
    if (!fragen.length) {
      app.innerHTML = '<main class="seite">' + marke() +
        (ladeFehler ? '<p class="meldung fehler">Die Fragenbank ist nicht erreichbar: ' + esc(ladeFehler) + '</p><button class="knopf" data-retry>Erneut versuchen</button>' +
          '<a class="knopf zweit" href="#/datenquelle">Datenquelle</a>'
          : '<p class="leise">Fragenbank wird geladen …</p>') + '</main>';
      var b = app.querySelector('[data-retry]');
      if (b) b.addEventListener('click', function () { ladeFehler = ''; render(); ladeFragenbank().then(render, render); });
      return;
    }
    var r = aktuelleRoute();
    if (r.name !== 'sets') ui.bestaetigen = null;
    if (r.name === 'frage') {
      if (sitzung.quelle !== 'lernen') sitzung = { id: null, phase: 'frage', antwort: null, quelle: 'lernen', durch: false };
      if (!sitzung.id && S.offen && nachId[S.offen]) sitzung.id = S.offen;
      return zeigeFrage();
    }
    if (r.name === 'f') return zeigeEinzelfrage(r.arg);
    if (r.name === 'sets') return zeigeSets();
    if (r.name === 'set') return zeigeSetliste(r.arg);
    if (r.name === 'statistik') return zeigeStatistik();
    if (r.name === 'uebersicht') return zeigeUebersicht();
    if (r.name === 'fokus') {
      if (sitzung.quelle !== 'fokus' || sitzung.fokus !== r.arg) sitzung = { id: null, phase: 'frage', antwort: null, quelle: 'fokus', fokus: r.arg, durch: false };
      return zeigeFrage();
    }
    if (r.name === 'einstellungen') { var m = ui.meldung; ui.meldung = null; return zeigeEinstellungen(m); }
    if (r.name === 'import') return zeigeImport();
    if (r.name === 'export') return zeigeExport();
    if (r.name === 'datenschutz') return zeigeDatenschutz();
    return zeigeStart();
  }

  var letzteRoute = aktuelleRoute().name;
  window.addEventListener('hashchange', function () {
    var r = aktuelleRoute();
    // Fragensets: "Zurück" führt dorthin, woher man kam (Start oder Einstellungen)
    if (r.name === 'sets' && letzteRoute !== 'set' && letzteRoute !== 'f') ui.setsVon = letzteRoute === 'start' ? '#/start' : '#/einstellungen';
    if (r.name === 'quellen' && letzteRoute !== 'quellen') ui.quellenVon = letzteRoute === 'uebersicht' ? '#/uebersicht' : (letzteRoute === 'start' && !fragen.length) ? '#/start' : '#/einstellungen';
    if (r.name === 'hilfe' && letzteRoute !== 'hilfe') ui.hilfeVon = ['statistik', 'uebersicht', 'einstellungen', 'datenquelle'].indexOf(letzteRoute) >= 0 ? '#/' + letzteRoute : '#/start';
    letzteRoute = r.name;
    var toast = document.querySelector('.toast'); if (toast) toast.remove();
    if (r.name === 'frage' && sitzung.quelle === 'lernen' && sitzung.phase === 'feedback') naechste();
    render();
    window.scrollTo(0, 0);
  });
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', wendeThemaAn);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') planeErinnerungen(false);
    if (document.visibilityState === 'visible') pruefeUpdate(false).then(function () {
      var n = aktuelleRoute().name; if (updateDa() && (n === 'start' || n === 'einstellungen')) render();
    });
    if (document.visibilityState === 'visible' && datenStand && Date.now() - datenStand > 10 * 60000) {
      ladeFragenbank().then(function () { if (aktuelleRoute().name !== 'frage') render(); }, function () {});
    }
  });

  /* Verbindungs-Link aus der Mail öffnet die Android-App (App Links, seit 1.8.0) */
  var APP = PLUG.App || null;
  if (APP) {
    var oeffneLink = function (url) { var c = codeAusUrl(url); if (c) location.hash = '#/verbinden/' + c; };
    try { APP.addListener('appUrlOpen', function (e) { oeffneLink(e && e.url); }); } catch (e) {}
    try { APP.getLaunchUrl().then(function (r) { oeffneLink(r && r.url); }, function () {}); } catch (e) {}
  }

  wendeThemaAn();
  var ausCache = ladeAusSpeicher();
  render();
  ladeFragenbank().then(function () {
    if (!ausCache || aktuelleRoute().name !== 'frage') render();
  }, function () { render(); }).then(function () {
    return planeErinnerungen(true);
  }).then(function () { if (aktuelleRoute().name === 'einstellungen') render(); })
    .then(function () { return pruefeUpdate(false); })
    .then(function () { var n = aktuelleRoute().name; if (n === 'start' || n === 'einstellungen') render(); });

  if (!NATIV && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  /* Für Tests im Browser */
  window.__pmp = { parseCsv: parseCsv, waehleFrage: waehleFrage, zustand: function () { return S; }, leseCode: leseCode, codeAusUrl: codeAusUrl,
    quelle: function () { return Q; }, exportText: function () { return exportText(); }, fragenZahl: function () { return fragen.length; },
    evRechne: evRechne, evZahl: evZahl, evDeutung: evDeutung, EV_KZ: EV_KZ, EV_SZENARIEN: EV_SZENARIEN };
})();
