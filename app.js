/* PMP-Lernpartner – Lern-App (Version 1.1, 06.11.2026)
 * Liest die veröffentlichte Fragenbank (CSV), zeigt Fragensets, Fragen und Feedback
 * und speichert den Lernstand nur auf diesem Gerät (localStorage).
 * Läuft im Browser (PWA) und als Android-App (Capacitor); nur in der Android-App
 * plant das Handy die täglichen Erinnerungen selbst.
 */
(function () {
  'use strict';

  var CFG = window.PMP_CONFIG || {};
  var APP_VERSION = '1.1.0';
  var SPEICHER = 'pmplp.v1';
  var CSV_SPEICHER = 'pmplp.csv';
  var TAG_MS = 86400000;
  var ECO_ZIEL = { I: 0.33, II: 0.41, III: 0.26 };
  var ECO_NAME = { I: 'People', II: 'Process', III: 'Business Environment' };
  var DOMAINS = ['Governance', 'Scope', 'Schedule', 'Finance', 'Stakeholders', 'Resources', 'Risk'];
  var FOCUS = ['Initiating', 'Planning', 'Executing', 'Monitoring and Controlling', 'Closing'];

  /* ---------- Zustand ---------- */

  var S = ladeZustand();
  var fragen = [];          // nur aktive Fragen
  var alleZeilen = 0;       // Zeilen im Sheet
  var nachId = {};
  var datenStand = null;    // Zeitpunkt der geladenen CSV
  var ladeFehler = '';
  var sitzung = { id: null, phase: 'frage', antwort: null, vorher: null, quelle: 'lernen', durch: false };
  var vorrat = { stand: 0, laedt: false, bereit: null, fehler: '', meldung: '' };
  var ui = { statModus: 'domain', filter: 'alle', bestaetigen: null };

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
  function setName(key) { return key === 'alle' ? 'Alle Sets' : 'Set ' + setNummer(key); }
  function ecoDomain(q) { return String(q.eco || '').split('-')[0].trim(); }

  var IKON = {
    haken: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    zahnrad: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    pfeil: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
    links: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    ok: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>',
    lampe: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:2px;color:var(--accent-text)"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z"/></svg>',
    wieder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
    lernen: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/></svg>',
    sets: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
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

  function erinnerungsText() {
    var d = fragen.map(function (q) { return q.domain; }).filter(Boolean);
    return d.length ? 'Heute im Fokus: ' + d[Math.floor(Math.random() * d.length)] + '.' : 'Eine Frage wartet auf dich.';
  }
  function erinnerungsNachricht(id, schedule) {
    return { id: id, title: 'PMP: Zeit für eine Frage', body: erinnerungsText(), channelId: 'erinnerungen',
      schedule: schedule, extra: { ziel: '#/frage' } };
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
    if (erin.laeuft) return erin.laeuft;
    var e = S.erinnerung;
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
                return erinnerungsNachricht(ERINNERUNG_IDS[i], { on: { hour: +t[0], minute: +t[1] }, allowWhileIdle: true, isExactNotification: false });
              }) });
            })
            .then(function () { erin.geplant = e.zeiten.length; erin.fehler = ''; });
        });
      })
      .catch(function (err) { erin.fehler = String((err && err.message) || err); })
      .then(function () { erin.laeuft = null; });
    return erin.laeuft;
  }
  function testErinnerung() {
    if (!LN) return Promise.resolve();
    return erlaubnis(true).then(function (ok) {
      if (!ok) throw new Error('Benachrichtigungen sind für die App nicht erlaubt.');
      return LN.schedule({ notifications: [erinnerungsNachricht(TEST_ID, { at: new Date(Date.now() + 60000), allowWhileIdle: true, isExactNotification: false })] });
    });
  }
  if (LN) {
    LN.addListener('localNotificationActionPerformed', function (a) {
      var ziel = (a && a.notification && a.notification.extra && a.notification.extra.ziel) || '#/frage';
      if (location.hash !== ziel) location.hash = ziel;
    });
  }
  /* Export in der Android-App: Datei im Cache ablegen und über "Teilen" speichern (z. B. ins Drive). */
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

  function uebernehmeCsv(text, stand) {
    var z = parseCsv(text);
    if (!z.length) throw new Error('Leere Fragenbank');
    var kopf = z[0].map(function (h) { return String(h).trim(); });
    if (kopf.indexOf('id') < 0 || kopf.indexOf('frage') < 0) throw new Error('Unerwartetes Format der Fragenbank');
    var liste = [];
    alleZeilen = 0;
    for (var r = 1; r < z.length; r++) {
      if (z[r].join('').trim() === '') continue;
      alleZeilen++;
      var q = {};
      kopf.forEach(function (h, i) { q[h] = String(z[r][i] == null ? '' : z[r][i]).trim(); });
      if (!q.id || q.aktiv.toLowerCase() !== 'ja') continue;
      if (!q.paket) q.paket = q.id.split('-')[0];
      q.loesung = q.loesung.toUpperCase();
      liste.push(q);
    }
    fragen = liste;
    nachId = {};
    liste.forEach(function (q) { nachId[q.id] = q; });
    datenStand = stand;
    if (S.aktivesSet !== 'alle' && !setKeys().some(function (k) { return k === S.aktivesSet; })) S.aktivesSet = 'alle';
  }

  function ladeAusSpeicher() {
    try {
      var c = JSON.parse(localStorage.getItem(CSV_SPEICHER) || 'null');
      if (c && c.text) { uebernehmeCsv(c.text, c.stand); return true; }
    } catch (e) {}
    return false;
  }

  function ladeFragenbank() {
    var url = CFG.CSV_URL + (CFG.CSV_URL.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Fragenbank antwortet mit ' + r.status);
      return r.text();
    }).then(function (text) {
      var stand = Date.now();
      uebernehmeCsv(text, stand);
      ladeFehler = '';
      try { localStorage.setItem(CSV_SPEICHER, JSON.stringify({ text: text, stand: stand })); } catch (e) {}
    }).catch(function (err) {
      ladeFehler = String(err && err.message || err);
      throw err;
    });
  }

  /* ---------- Sets und Lernstand ---------- */

  function setKeys() {
    var m = {};
    fragen.forEach(function (q) { m[q.paket] = true; });
    return Object.keys(m).sort(function (a, b) { return setNummer(a) - setNummer(b); });
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

  function waehleFrage(key, ausser) {
    var pool = fragenImSet(key);
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
      '<a href="#/sets"' + p('sets') + '>' + IKON.sets + 'Sets</a>' +
      '<a href="#/statistik"' + p('statistik') + '>' + IKON.statistik + 'Statistik</a>' +
      '</div></nav>';
  }
  function kopfMitZahnrad(titelHtml) {
    return '<div class="kopf">' + titelHtml +
      '<a class="symbolknopf" href="#/einstellungen" aria-label="Einstellungen">' + IKON.zahnrad + '</a></div>';
  }
  function marke() { return '<div class="marke"><div class="logo">' + IKON.haken + '</div>PMP-Lernpartner</div>'; }
  function balken(p, schwach) {
    return '<div class="balken' + (schwach ? ' schwach' : '') + '" role="img" aria-label="' + (p == null ? 'keine Daten' : p + ' Prozent') + '"><div style="width:' + (p || 0) + '%"></div></div>';
  }
  function datenHinweis() {
    if (ladeFehler && fragen.length) return '<p class="meldung">Offline oder Fragenbank nicht erreichbar – du lernst mit dem Stand vom ' + esc(datumZeit(datenStand)) + '.</p>';
    return '';
  }

  function zeigeStart() {
    var key = S.aktivesSet, w = setWerte(key), faellig = faelligImSet(key).length;
    var h = new Date().getHours();
    var gruss = h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
    app.innerHTML = '<main class="seite mit-nav">' + kopfMitZahnrad(marke()) +
      '<div><h1 class="gross">' + gruss + (CFG.NAME ? ', ' + esc(CFG.NAME) : '') + '</h1>' +
      '<p class="unter">Eine Frage – oder ein paar mehr?</p></div>' + datenHinweis() +
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
  }

  function einordnung(q) {
    var chip = function (t, v) { return '<div class="chip"><span>' + t + '</span><span>' + esc(v) + '</span></div>'; };
    return '<div class="einordnung" aria-label="Einordnung">' + chip('Domain', q.domain) + chip('Focus Area', q.focus_area) + chip('Prozess', q.prozess) + '</div>';
  }

  function zeigeFrage() {
    var q = sitzung.id && nachId[sitzung.id];
    if (!q) {
      if (sitzung.quelle === 'lernen') { naechste(); q = nachId[sitzung.id]; }
      if (!q) { app.innerHTML = '<main class="seite"><p class="meldung">In diesem Set gibt es keine Fragen.</p><a class="knopf zweit" href="#/sets">Zu den Sets</a></main>'; return; }
    }
    if (sitzung.phase === 'feedback') return zeigeFeedback(q);
    var zaehler = heuteBeantwortet() + 1;
    var zurueck = sitzung.quelle === 'liste' ? '<a class="textknopf zurueck" href="#/set/' + esc(q.paket) + '">' + IKON.links + 'Liste</a>' : '<a class="textknopf zurueck" href="#/start">Pause</a>';
    var hinweisDurch = sitzung.durch && sitzung.quelle === 'lernen'
      ? '<p class="meldung">Alle Fragen in ' + esc(setName(S.aktivesSet)) + ' sind beantwortet – jetzt kommt Wiederholung. <a href="#/sets">Set neu beginnen, wechseln oder neue Sets übernehmen</a>.</p>' : '';
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
      html += '<div class="fuss knopfreihe"><a class="knopf zweit" href="#/start">Pause</a>' +
        '<button class="knopf" data-aktion="weiter">Weiter ' + IKON.pfeil + '</button></div>';
    }
    app.innerHTML = html + '</main>';
    var w = app.querySelector('[data-aktion="weiter"]');
    if (w) w.addEventListener('click', function () { naechste(); render(); window.scrollTo(0, 0); });
    var n = app.querySelector('[data-aktion="nochmal"]');
    if (n) n.addEventListener('click', function () { sitzung.phase = 'frage'; sitzung.antwort = null; render(); window.scrollTo(0, 0); });
  }

  function naechste() {
    var aus = sitzung.id;
    var r = waehleFrage(S.aktivesSet, aus);
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
    var html = '<main class="seite mit-nav">' + kopfMitZahnrad('<h1 class="gross">Fragensets</h1>') + datenHinweis();
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
    html += vorratHtml() + '</main>' + nav('sets');
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
    if (!CFG.API_URL) {
      html += '<p class="leise">Der Knopf „Übernehmen“ wird freigeschaltet, sobald das Skript als Web-App bereitsteht. Neue Sets bekommst du im Projekt-Chat mit „Neues Fragenpaket“.</p>';
    } else if (vorrat.laedt && vorrat.bereit == null) {
      html += '<p class="leise">Prüfe den Vorrat …</p>';
    } else if (vorrat.fehler) {
      html += '<p class="meldung fehler">' + esc(vorrat.fehler) + '</p>';
    } else if (vorrat.bereit && vorrat.bereit.length) {
      var n = vorrat.bereit.length;
      html += '<p><b>Neu bereit: ' + n + (n === 1 ? ' Set' : ' Sets') + '</b></p><p class="leise">' + vorrat.bereit.map(esc).join('<br>') + '</p>' +
        '<button class="knopf klein" data-uebernehmen' + (vorrat.laedt ? ' disabled' : '') + '>' + (vorrat.laedt ? 'Übernehme …' : 'Übernehmen') + '</button>';
    } else {
      html += '<p class="leise">Kein Vorrat. Neue Sets bekommst du im Projekt-Chat mit „Neues Fragenpaket“.</p>';
    }
    if (vorrat.meldung) html += '<p class="meldung gut">' + vorrat.meldung + '</p>';
    return html + '</section>';
  }

  function api(aktion) {
    var url = CFG.API_URL + '?schluessel=' + encodeURIComponent(CFG.API_KEY) + '&aktion=' + aktion + '&_=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.fehler || 'Unbekannter Fehler');
      return j;
    });
  }
  function pruefeVorrat() {
    if (!CFG.API_URL || vorrat.laedt || Date.now() - vorrat.stand < 60000) return;
    vorrat.laedt = true; vorrat.fehler = '';
    api('status').then(function (j) { vorrat.bereit = j.bereit || []; })
      .catch(function (e) { vorrat.fehler = 'Vorrat nicht abrufbar: ' + (e && e.message || e); })
      .then(function () { vorrat.laedt = false; vorrat.stand = Date.now(); if (aktuelleRoute().name === 'sets') render(); });
  }
  function uebernehmen() {
    vorrat.laedt = true; vorrat.meldung = ''; render();
    api('uebernehmen').then(function (j) {
      vorrat.bereit = [];
      vorrat.meldung = esc((j.berichte || []).join(' ')) + '<br>Die neuen Fragen erscheinen nach ein paar Minuten (Google aktualisiert die veröffentlichte Fragenbank verzögert). Unter Einstellungen → „Datenquelle neu laden“ kannst du nachhelfen.';
      setTimeout(function () { ladeFragenbank().then(render, function () {}); }, 60000);
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
    var html = '<main class="seite mit-nav"><div class="kopf"><a class="textknopf zurueck" href="#/sets">' + IKON.links + 'Sets</a></div>' +
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
    app.innerHTML = html + '</div></main>' + nav('sets');
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
  }

  function zeigeEinstellungen(meldung) {
    var t = S.theme;
    var html = '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="#/start">' + IKON.links + 'Zurück</a></div>' +
      '<h1 class="gross">Einstellungen</h1>' + (meldung || '') +
      '<section class="karte"><span class="ueber">Darstellung</span><div class="segment" role="group" aria-label="Farbschema">' +
      [['hell', 'Hell'], ['dunkel', 'Dunkel'], ['auto', 'Auto']].map(function (m) {
        return '<button data-theme="' + m[0] + '" aria-pressed="' + (t === m[0]) + '">' + m[1] + '</button>';
      }).join('') + '</div><p class="leise">Auto folgt der Einstellung des Handys.</p></section>' +
      '<section class="karte"><span class="ueber">Lernstand</span><p class="leise">Der Lernstand liegt nur auf diesem Gerät. Sichere ihn ab und zu als Datei.</p>' +
      '<div class="knopfreihe" style="grid-template-columns:1fr 1fr"><button class="knopf zweit klein" data-export>Exportieren</button>' +
      '<label class="knopf zweit klein" style="cursor:pointer">Importieren<input type="file" accept="application/json,.json" class="versteckt" data-import></label></div></section>' +
      '<section class="karte"><span class="ueber">Fragenbank</span><p>' + fragen.length + ' aktive Fragen in ' + setKeys().length + ' Sets</p>' +
      '<p class="leise">' + (datenStand ? 'Geladen am ' + esc(datumZeit(datenStand)) : 'Noch nicht geladen') + (ladeFehler ? ' · letzter Abruf fehlgeschlagen' : '') + '</p>' +
      '<button class="knopf zweit klein" data-neu>Datenquelle neu laden</button></section>' +
      erinnerungsKarte() +
      '<p class="leise" style="text-align:center">PMP-Lernpartner ' + APP_VERSION + '</p></main>';
    app.innerHTML = html;
    app.querySelectorAll('[data-theme]').forEach(function (el) {
      el.addEventListener('click', function () { S.theme = el.getAttribute('data-theme'); speichere(); wendeThemaAn(); render(); });
    });
    app.querySelector('[data-export]').addEventListener('click', exportiere);
    bindeErinnerungen();
    app.querySelector('[data-import]').addEventListener('change', importiere);
    app.querySelector('[data-neu]').addEventListener('click', function (e) {
      e.target.disabled = true; e.target.textContent = 'Lade …';
      ladeFragenbank().then(function () { zeigeEinstellungen('<p class="meldung gut">Fragenbank neu geladen: ' + fragen.length + ' aktive Fragen.</p>'); },
        function () { zeigeEinstellungen('<p class="meldung fehler">Laden fehlgeschlagen: ' + esc(ladeFehler) + '</p>'); });
    });
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

  function exportiere() {
    var daten = JSON.stringify({ app: 'PMP-Lernpartner', version: APP_VERSION, exportiert: new Date().toISOString(), lernstand: S }, null, 1);
    var d = new Date();
    var name = 'pmp-lernstand-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json';
    if (NATIV) {
      exportiereNativ(name, daten).catch(function (err) {
        if (/cancel/i.test(String((err && err.message) || err))) return;
        zeigeEinstellungen('<p class="meldung fehler">Export fehlgeschlagen: ' + esc((err && err.message) || err) + '</p>');
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
  function importiere(e) {
    var datei = e.target.files && e.target.files[0];
    if (!datei) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        var ls = j.lernstand || j;
        if (!ls || typeof ls.antworten !== 'object') throw new Error('Keine Lernstand-Datei');
        if (!window.confirm('Lernstand aus der Datei übernehmen? Der aktuelle Lernstand auf diesem Gerät wird ersetzt.')) return;
        S = normalisiere(ls); speichere(); wendeThemaAn(); planeErinnerungen(false);
        sitzung = { id: null, phase: 'frage', antwort: null, quelle: 'lernen', durch: false };
        zeigeEinstellungen('<p class="meldung gut">Lernstand importiert.</p>');
      } catch (err) {
        zeigeEinstellungen('<p class="meldung fehler">Import fehlgeschlagen: ' + esc(err.message || err) + '</p>');
      }
    };
    r.readAsText(datei);
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
    if (!fragen.length) {
      app.innerHTML = '<main class="seite">' + marke() +
        (ladeFehler ? '<p class="meldung fehler">Die Fragenbank ist nicht erreichbar: ' + esc(ladeFehler) + '</p><button class="knopf" data-retry>Erneut versuchen</button>'
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
    if (r.name === 'einstellungen') return zeigeEinstellungen();
    return zeigeStart();
  }

  window.addEventListener('hashchange', function () {
    var r = aktuelleRoute();
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
    if (document.visibilityState === 'visible' && datenStand && Date.now() - datenStand > 10 * 60000) {
      ladeFragenbank().then(function () { if (aktuelleRoute().name !== 'frage') render(); }, function () {});
    }
  });

  wendeThemaAn();
  var ausCache = ladeAusSpeicher();
  render();
  ladeFragenbank().then(function () {
    if (!ausCache || aktuelleRoute().name !== 'frage') render();
  }, function () { render(); }).then(function () {
    return planeErinnerungen(true);
  }).then(function () { if (aktuelleRoute().name === 'einstellungen') render(); });

  if (!NATIV && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  /* Für Tests im Browser */
  window.__pmp = { parseCsv: parseCsv, waehleFrage: waehleFrage, zustand: function () { return S; } };
})();
