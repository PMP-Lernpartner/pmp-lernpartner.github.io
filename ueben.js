/* PMP-Lernpartner – Übungsbereich „Üben“ (seit Lern-App 1.14.0, Entscheidung 40)
 * Netzplan (Critical Path Method, Zählweise ab Tag 1) und Earned Value (Rechenblatt mit 12 Kennzahlen).
 * Aufgaben und Lösungen stehen in der eigenen Fragenbank (Spalte daten, erste Zeile CPM bzw. EVM); im Code stehen keine Aufgaben.
 * Der Fortschritt je Aufgabe liegt im Lernstand unter ueben (offen · angefangen · gelöst) und zählt nicht zur Quote der Fragen. */
(function () {
  'use strict';

  /* Lernstand-Teil normalisieren (wird von app.js beim Laden und Importieren aufgerufen) */
  function normUeben(u) {
    u = u && typeof u === 'object' ? u : {};
    var e = u.einst || {}, a = u.aufgaben && typeof u.aufgaben === 'object' ? u.aufgaben : {};
    var auf = {};
    Object.keys(a).forEach(function (id) {
      var x = a[id];
      if (!x || typeof x !== 'object') return;
      auf[id] = { status: x.status === 'geloest' ? 'geloest' : 'angefangen', t: Number(x.t) || 0, stand: x.stand && typeof x.stand === 'object' ? x.stand : null };
    });
    return { einst: { sofort: e.sofort === true, formel: e.formel === true, gegeben: e.gegeben === true }, aufgaben: auf };
  }

  function PMPUeben(ctx) {
    var esc = ctx.esc, IKON = ctx.IKON;
    var app = ctx.app;
    var U = function () { var s = ctx.zustand(); if (!s.ueben) s.ueben = normUeben(null); return s.ueben; };

    /* ---------- Hilfen ---------- */
    function zeilen(t) { return String(t || '').split(/\r?\n/).map(function (z) { return z.trim(); }).filter(Boolean); }
    function teile(z) { return z.split('|').map(function (t) { return t.trim(); }); }
    function art(q) { var k = zeilen(q.daten)[0] || ''; return /^CPM/i.test(k) ? 'cpm' : /^EVM/i.test(k) ? 'ev' : null; }
    function herkunft(q) {
      var n = String(q.notiz || '').split('|')[0].trim();
      if (/^Buch\b/i.test(n)) return { typ: 'buch', text: n.replace(/^Buch\s*·?\s*/i, '') };
      if (/Vertiefung/i.test(n)) return { typ: 'vertiefung', text: '' };
      return { typ: 'eigene', text: '' };
    }
    function abzeichen(q) {
      var h = herkunft(q);
      if (h.typ === 'buch') return '<span class="ue-abz buch">Buch</span>' + (h.text ? '<span class="ue-fund">' + esc(h.text) + '</span>' : '');
      return '<span class="ue-abz eigen">Eigene Übung' + (h.typ === 'vertiefung' ? ' · Vertiefung' : '') + '</span>';
    }
    function titel(q) { return q.konzept || q.id; }
    function r2(x) { return x == null || !isFinite(x) ? null : Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }
    function zahlDe(x) {
      if (x == null || !isFinite(x)) return '–';
      var r = r2(x);
      return r.toLocaleString('de-DE', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
    }
    function eintrag(id) { return U().aufgaben[id] || null; }
    function statusVon(id) { var e = eintrag(id); return !e ? 'offen' : e.status; }
    var STATUS_TEXT = { offen: 'offen', angefangen: 'angefangen', geloest: 'gelöst' };
    function merkeStand(id, stand, geloest) {
      var u = U(), e = u.aufgaben[id] || (u.aufgaben[id] = { status: 'angefangen', t: 0, stand: null });
      e.stand = stand; e.t = Date.now();
      if (geloest) e.status = 'geloest';
      ctx.speichere();
    }

    /* ---------- (i)-Karten ---------- */
    var INFO = {
      dauer: ['Dauer', 'Steht über dem Kasten, wie im Buch. Start und Finish haben Dauer 0 und keine Werte.', '', 'Beispiel: Über dem Kasten B steht 3 – B dauert 3 Tage.'],
      buchstabe: ['Aktivität', 'Der Buchstabe aus der Tabelle steht in der Mitte des Kastens. Jede Aktivität kommt genau einmal vor.', '', ''],
      es: ['ES – Early Start (frühester Anfang)', 'ES = größter EF der Vorgänger + 1 · erste Aktivität: ES = 1',
        'Vorwärts (Forward Pass) nimmst du dort, wo mehrere Pfeile zusammenkommen, den größten Wert.', 'D folgt auf B (EF 5) und C (EF 6): ES von D = 6 + 1 = 7.'],
      ef: ['EF – Early Finish (frühestes Ende)', 'EF = ES + Dauer − 1', 'Minus 1, weil der Starttag schon mitzählt.', 'ES 7, Dauer 2 → EF = 7 + 2 − 1 = 8.'],
      lf: ['LF – Late Finish (spätestes Ende)', 'LF = kleinster LS der Nachfolger − 1 · letzte Aktivität: LF = Projektende',
        'Rückwärts (Backward Pass) nimmst du dort, wo sich der Weg verzweigt, den kleinsten Wert.', 'F hat die Nachfolger G (LS 15) und H (LS 18): LF von F = 15 − 1 = 14.'],
      ls: ['LS – Late Start (spätester Anfang)', 'LS = LF − Dauer + 1', 'Plus 1, weil der Endtag schon mitzählt.', 'LF 9, Dauer 3 → LS = 9 − 3 + 1 = 7.'],
      zaehlweise: ['Zählweise ab Tag 1', 'Eine Aktivität mit Dauer 1 beginnt und endet am selben Tag. Darum EF = ES + Dauer − 1, und der Nachfolger beginnt am Tag danach (+ 1). Rückwärts genauso: LS = LF − Dauer + 1, der Vorgänger endet am Tag davor (− 1).', '', ''],
      krit: ['Kritischer Pfad', 'Der längste Pfad durch das Netz. Seine Länge ist die kürzeste mögliche Projektdauer. Alle Aktivitäten darauf haben Float 0.', 'Längster Pfad = kürzeste Projektdauer.', ''],
      pfade: ['Pfade', 'Jeder Weg von Start bis Finish ist ein Pfad. Länge = Summe der Dauern auf dem Weg. Der längste Pfad ist der kritische.', 'Schreibweise: A-B-C-E 12; A-B-D-E 11', ''],
      float: ['Float (Slack, Total Float)', 'Float = LS − ES = LF − EF', 'So viele Tage kann sich die Aktivität verschieben, ohne dass sich das Projektende verschiebt. Float 0 = kritisch. Slack und Float sind dasselbe.', 'ES 3, LS 4 → Float 1.'],
      ff: ['Free Float', 'Free Float = kleinster ES der Nachfolger − EF − 1 · vor Finish: Projektende − EF',
        'So viele Tage kann sich die Aktivität verschieben, ohne den frühesten Start (ES) eines Nachfolgers zu verschieben. Free Float ist nie größer als der Float.', 'B endet an Tag 5 (EF), der früheste Nachfolger beginnt an Tag 6: Free Float = 6 − 5 − 1 = 0. Nachgerechnet, nicht im Buch.'],
    };
    function infoWennHtml() {
      return '<p>Eine Aktivität wird <b>x Tage länger</b>:</p><table class="ue-tab"><thead><tr><th>Fall</th><th>Projektende</th></tr></thead><tbody>' +
        '<tr><td>x ≤ Float</td><td>bleibt gleich – die Verlängerung frisst nur Puffer</td></tr>' +
        '<tr><td>x > Float</td><td>verschiebt sich um x − Float</td></tr>' +
        '<tr><td>auf dem kritischen Pfad (Float 0)</td><td>verschiebt sich um die vollen x</td></tr></tbody></table>' +
        '<p><b>Neuer kritischer Pfad</b> = längster Pfad, nachdem x auf alle Pfade durch die Aktivität aufgeschlagen wurde.</p>' +
        '<p>x ≤ Free Float → kein Nachfolger verschiebt sich.</p>' +
        '<p class="leise"><b>Typische Fallen:</b> volle Verlängerung aufschlagen, obwohl Float da ist · vergessen, dass der kritische Pfad wechseln kann · Free Float (verschiebt sich ein Nachfolger?) mit Float (verschiebt sich das Ende?) verwechseln.</p>';
    }
    function zeigeInfo(schluessel) {
      var html;
      if (schluessel === 'wenn') html = '<h2>Was wäre, wenn</h2>' + infoWennHtml();
      else if (/^ev:/.test(schluessel)) {
        var k = schluessel.slice(3), x = ctx.EV_KZ.filter(function (y) { return y.k === k; })[0];
        if (!x) return;
        html = '<h2>' + esc(x.k) + ' – <span lang="en">' + esc(x.lang.replace(/[\[\]]/g, '')) + '</span></h2><p>' + esc(x.de) + '</p>' +
          '<p class="ev-formel">' + esc(x.formel === 'gegeben' ? x.k + ': gegeben' : x.formel) + '</p>' + (x.regel ? '<p class="leise">' + esc(x.regel) + '</p>' : '') +
          (k === 'PV' ? '<p class="leise">Geplant % nicht angegeben? Vergangene Zeit / Gesamtdauer.</p>' : '');
      } else {
        var i = INFO[schluessel]; if (!i) return;
        html = '<h2>' + esc(i[0]) + '</h2><p class="ev-formel">' + esc(i[1]) + '</p>' + (i[2] ? '<p>' + esc(i[2]) + '</p>' : '') + (i[3] ? '<p class="leise">' + esc(i[3]) + '</p>' : '');
      }
      schliesseInfo();
      var d = document.createElement('div');
      d.className = 'ue-info-hg'; d.setAttribute('data-info-hg', '');
      d.innerHTML = '<div class="ue-info" role="dialog" aria-modal="true">' + html + '<button class="knopf klein" data-info-zu>Schließen</button></div>';
      document.body.appendChild(d);
      d.addEventListener('click', function (ev) { if (ev.target === d || ev.target.hasAttribute('data-info-zu')) schliesseInfo(); });
      var zu = d.querySelector('[data-info-zu]'); if (zu) zu.focus();
    }
    function schliesseInfo() { var d = document.querySelector('[data-info-hg]'); if (d) d.remove(); }
    function iKnopf(schluessel, label) {
      return '<button class="ue-i" data-info="' + esc(schluessel) + '" aria-label="Erklärung: ' + esc(label || schluessel) + '">i</button>';
    }
    function bindeInfo(wurzel) {
      wurzel.querySelectorAll('[data-info]').forEach(function (el) {
        if (el.hasAttribute('data-info-gebunden')) return;
        el.setAttribute('data-info-gebunden', '');
        el.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); zeigeInfo(el.getAttribute('data-info')); });
      });
    }

    /* ======================= Netzplan ======================= */

    function parseCpm(q) {
      var akt = {}, namen = [], loes = {}, fragen = [], fehler = '';
      zeilen(q.daten).slice(1).forEach(function (z) {
        var t = teile(z); if (t.length < 3) return;
        var n = t[0].toUpperCase();
        var p = !t[1] || /^start$/i.test(t[1]) ? [] : t[1].split(/[,;\s]+/).filter(Boolean).map(function (x) { return x.toUpperCase(); });
        akt[n] = { p: p, d: parseInt(t[2], 10) }; namen.push(n);
      });
      namen.forEach(function (n) {
        if (!(akt[n].d >= 0)) fehler = 'Dauer von ' + n + ' fehlt';
        akt[n].p.forEach(function (p) { if (!akt[p]) fehler = 'Vorgänger ' + p + ' von ' + n + ' fehlt'; });
      });
      zeilen(q.loesung).forEach(function (z) {
        if (z[0] === '?' || z[0] === '+') {
          var f = teile(z.slice(1));
          fragen.push({ zusatz: z[0] === '+', text: f[0] || '', typ: (f[1] || '').toLowerCase(), args: f.slice(2) });
          return;
        }
        var t = teile(z);
        if (t.length >= 5 && akt[t[0].toUpperCase()]) loes[t[0].toUpperCase()] = { es: +t[1], ef: +t[2], ls: +t[3], lf: +t[4] };
      });
      var r = fehler ? null : rechneNetz(akt);
      if (!fehler && !r) fehler = 'Das Netz enthält einen Kreis';
      return { akt: akt, namen: namen, loes: loes, fragen: fragen, r: r, fehler: fehler };
    }

    /* akt: { id: { p: [ids], d: Zahl } } – Zählweise ab Tag 1. Gibt null bei einem Kreis zurück. */
    function rechneNetz(akt) {
      var ids = Object.keys(akt), nach = {}, ein = {};
      ids.forEach(function (i) { nach[i] = []; ein[i] = 0; });
      ids.forEach(function (i) { akt[i].p.forEach(function (p) { if (nach[p]) { nach[p].push(i); ein[i]++; } }); });
      var warte = ids.filter(function (i) { return ein[i] === 0; }), reihe = [];
      while (warte.length) {
        var i = warte.shift(); reihe.push(i);
        nach[i].forEach(function (j) { if (--ein[j] === 0) warte.push(j); });
      }
      if (reihe.length !== ids.length || !ids.length) return null;
      var es = {}, ef = {}, ls = {}, lf = {}, ff = {}, tf = {};
      var vor = function (i) { return akt[i].p.filter(function (p) { return akt[p]; }); };
      reihe.forEach(function (i) {
        var v = vor(i);
        es[i] = v.length ? Math.max.apply(null, v.map(function (x) { return ef[x]; })) + 1 : 1;
        ef[i] = es[i] + akt[i].d - 1;
      });
      var ende = Math.max.apply(null, reihe.map(function (i) { return ef[i]; }));
      reihe.slice().reverse().forEach(function (i) {
        var s = nach[i];
        lf[i] = s.length ? Math.min.apply(null, s.map(function (x) { return ls[x]; })) - 1 : ende;
        ls[i] = lf[i] - akt[i].d + 1;
      });
      reihe.forEach(function (i) {
        var s = nach[i];
        ff[i] = s.length ? Math.min.apply(null, s.map(function (x) { return es[x]; })) - ef[i] - 1 : ende - ef[i];
        tf[i] = ls[i] - es[i];
      });
      var pfade = [];
      var lauf = function (i, weg) {
        if (pfade.length > 500) return;
        if (!nach[i].length) { pfade.push(weg); return; }
        nach[i].forEach(function (j) { lauf(j, weg.concat([j])); });
      };
      reihe.forEach(function (i) { if (!vor(i).length) lauf(i, [i]); });
      pfade = pfade.map(function (w) { return { ids: w, laenge: w.reduce(function (s, x) { return s + akt[x].d; }, 0) }; });
      var max = Math.max.apply(null, pfade.map(function (p) { return p.laenge; }));
      return { es: es, ef: ef, ls: ls, lf: lf, ff: ff, tf: tf, ende: ende, reihe: reihe, nach: nach, pfade: pfade,
        krit: pfade.filter(function (p) { return p.laenge === max; }) };
    }
    function pfadText(ids, nameVon) { return ids.map(nameVon || function (x) { return x; }).join('-'); }
    function aktMitDauer(akt, n, d) { var a = {}; Object.keys(akt).forEach(function (k) { a[k] = { p: akt[k].p, d: k === n ? d : akt[k].d }; }); return a; }

    /* Auto-Anordnung für „Netz vorgeben“: Ebene = längste Vorgängerkette, je Ebene mittig gestapelt. */
    function anordnung(akt, reihe) {
      var ebene = {}, gruppen = [];
      reihe.forEach(function (i) {
        ebene[i] = akt[i].p.length ? Math.max.apply(null, akt[i].p.map(function (p) { return ebene[p]; })) + 1 : 0;
        (gruppen[ebene[i]] = gruppen[ebene[i]] || []).push(i);
      });
      var maxN = Math.max.apply(null, gruppen.map(function (g) { return g.length; }));
      var maxR = Math.max(4, 2 * (maxN - 1)), mitte = maxR / 2, zeile = {}, pos = {};
      gruppen.forEach(function (g, e) {
        g.sort(function (a, b) {
          var m = function (x) { var p = akt[x].p; return p.length ? p.reduce(function (s, y) { return s + zeile[y]; }, 0) / p.length : mitte; };
          return m(a) - m(b) || (a < b ? -1 : 1);
        });
        g.forEach(function (i, k) { zeile[i] = mitte - (g.length - 1) + 2 * k; pos[i] = [2 + 2 * e, zeile[i]]; });
      });
      return { pos: pos, maxC: 2 * gruppen.length + 4, maxR: maxR, mitte: mitte, finishC: 2 * gruppen.length + 2 };
    }

    var HW = 54, HH = 64, OY = 12;
    var ed = null;   // Zustand der geöffneten Netzplan-Aufgabe

    function neuerEditor(q) {
      var a = parseCpm(q);
      var lay = a.r ? anordnung(a.akt, a.r.reihe) : { pos: {}, maxC: 12, maxR: 4, mitte: 2, finishC: 12 };
      var e = { id: q.id, q: q, a: a, lay: lay, nodes: null, edges: null, nid: 1, hist: [], fut: [], last: null, mode: 'edit', armed: null,
        antw: {}, wenn: {}, marken: {}, geprueft: false, probe: null, variante: null, alles: false, explorer: { akt: '', dauer: '' } };
      var st = eintrag(q.id) && eintrag(q.id).stand;
      if (st && st.nodes && st.edges) {
        e.nodes = st.nodes; e.edges = st.edges; e.nid = st.nid || 1; e.antw = st.antw || {}; e.wenn = st.wenn || {};
      } else leeresNetz(e);
      e.last = snap(e);
      return e;
    }
    function leeresNetz(e) {
      e.nodes = { S: { id: 'S', c: 0, r: e.lay.mitte, fix: 'Start' }, Z: { id: 'Z', c: e.lay.finishC, r: e.lay.mitte, fix: 'Finish' } };
      e.edges = []; e.armed = null;
    }
    function snap(e) { return JSON.stringify({ nodes: e.nodes, edges: e.edges, nid: e.nid }); }
    function sichere() {
      merkeStand(ed.id, { nodes: ed.nodes, edges: ed.edges, nid: ed.nid, antw: ed.antw, wenn: ed.wenn }, false);
    }
    function merke() {
      var s = snap(ed); if (s === ed.last) return;
      if (ed.last !== null) ed.hist.push(ed.last);
      if (ed.hist.length > 300) ed.hist.shift();
      ed.fut = []; ed.last = s; knoepfe(); sichere();
    }
    function ladeSnap(s) {
      var o = JSON.parse(s); ed.nodes = o.nodes; ed.edges = o.edges; ed.nid = o.nid; ed.armed = null;
      zeichne(); leereMarken(); if (U().einst.sofort) pruefeNetz(); knoepfe(); sichere();
    }
    function zurueck() { if (!ed.hist.length) return info('Nichts zum Zurücknehmen.'); ed.fut.push(ed.last); ed.last = ed.hist.pop(); ladeSnap(ed.last); }
    function vor() { if (!ed.fut.length) return info('Nichts zum Wiederholen.'); ed.hist.push(ed.last); ed.last = ed.fut.pop(); ladeSnap(ed.last); }
    function knoepfe() {
      var u = app.querySelector('[data-np="zurueck"]'), v = app.querySelector('[data-np="vor"]');
      if (u) u.classList.toggle('leer', !ed.hist.length);
      if (v) v.classList.toggle('leer', !ed.fut.length);
    }
    function $(sel) { return app.querySelector(sel); }
    function info(t, ton) { var m = $('[data-np-meldungen]'); if (m) m.innerHTML = '<li class="' + (ton || 'hinweis') + '">' + esc(t) + '</li>'; }

    function aktive() { return Object.keys(ed.nodes).map(function (k) { return ed.nodes[k]; }).filter(function (n) { return !n.fix; }); }
    function nm(id) { var n = ed.nodes[id]; return n ? (n.fix || (n.letter || '').trim() || '?') : '?'; }
    function pos(n) { return { x: n.c * HW + 11, y: n.r * HH + OY }; }
    function ankerAus(n) { var p = pos(n); return n.fix ? { x: p.x + 78, y: p.y + 74 } : { x: p.x + 86, y: p.y + 74 }; }
    function ankerEin(n) { var p = pos(n); return n.fix ? { x: p.x + 8, y: p.y + 74 } : { x: p.x, y: p.y + 74 }; }
    function rasterMasse() {
      var maxC = ed.lay.maxC, maxR = ed.lay.maxR;
      Object.keys(ed.nodes).forEach(function (k) { maxC = Math.max(maxC, ed.nodes[k].c); maxR = Math.max(maxR, ed.nodes[k].r); });
      return { maxC: maxC, maxR: maxR };
    }
    function zeichne() {
      var g = $('[data-np-raster]'); if (!g) return;
      var m = rasterMasse();
      g.style.width = ((m.maxC + 2) * HW + 108) + 'px'; g.style.height = ((m.maxR + 2) * HH + OY + 128) + 'px';   // zwei Reihen und Spalten Platz zum Erweitern
      g.querySelectorAll('.np-knoten,.np-fix').forEach(function (e) { e.remove(); });
      var probe = ed.probe, ro = !!probe;
      Object.keys(ed.nodes).forEach(function (k) {
        var n = ed.nodes[k], p = pos(n), el = document.createElement('div');
        if (n.fix) {
          el.className = 'np-fix'; el.textContent = n.fix; el.style.left = (p.x + 8) + 'px'; el.style.top = (p.y + 59) + 'px';
        } else {
          var w = function (f) {
            if (probe && probe.werte[k]) return probe.werte[k][f];
            return n[f] == null ? '' : n[f];
          };
          var kl = function (f) { return probe && probe.alt[k] && String(probe.alt[k][f]) !== String(w(f)) ? ' geaendert' : ''; };
          var feld = function (f, cls, label, extra) {
            return '<input class="' + cls + kl(f) + '" data-f="' + f + '" ' + (extra || 'inputmode="numeric"') + ' enterkeyhint="next" autocomplete="off" aria-label="' + label + ' ' + esc(nm(k)) + '" value="' + esc(w(f)) + '"' + (ro ? ' readonly' : '') +
              (probe && kl(f) ? ' title="vorher ' + esc(probe.alt[k][f]) + '"' : '') + '>';
          };
          el.className = 'np-knoten';
          el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
          el.innerHTML = feld('dur', 'np-dauer', 'Dauer') +
            '<div class="np-kasten"><div class="np-reihe">' + feld('es', 'np-v', 'ES') + feld('ef', 'np-v', 'EF') + '</div>' +
            feld('letter', 'np-buchst', 'Buchstabe', 'maxlength="3" autocapitalize="characters"') +
            '<div class="np-reihe">' + feld('ls', 'np-v', 'LS') + feld('lf', 'np-v', 'LF') + '</div></div>';
          if (probe && probe.krit[k]) el.classList.add('krit');
        }
        el.setAttribute('data-id', k);
        if (ed.armed === k) el.classList.add('scharf');
        g.appendChild(el);
      });
      zeichnePfeile();
      if (!probe) markiere();
    }
    /* Prüfmarken und kritischen Pfad an die vorhandenen Kästen anbringen, ohne sie neu zu zeichnen (Fokus bleibt beim Tippen) */
    function markiere() {
      app.querySelectorAll('.np-knoten').forEach(function (k) {
        var id = k.getAttribute('data-id');
        k.classList.toggle('krit', !!(ed.alles && ed.kritIds && ed.kritIds[id]));
        k.querySelectorAll('input[data-f]').forEach(function (i) {
          i.classList.remove('ok', 'bad');
          var m = ed.marken[id + ':' + i.getAttribute('data-f')]; if (m) i.classList.add(m);
        });
      });
    }
    function zeichnePfeile() {
      var svg = $('svg.np-pfeile'); if (!svg) return;
      var s = '<defs><marker id="np-spitze" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>';
      ed.edges.forEach(function (e) {
        var a = ed.nodes[e[0]], b = ed.nodes[e[1]]; if (!a || !b) return;
        var o = ankerAus(a), i = ankerEin(b);
        var d = i.x > o.x + 16 ? 'M' + o.x + ' ' + o.y + ' H' + (i.x - 12) + ' V' + i.y + ' H' + (i.x - 1) : 'M' + o.x + ' ' + o.y + ' L' + (i.x - 1) + ' ' + i.y;
        s += '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#np-spitze)"/>';
      });
      svg.innerHTML = s;
    }
    function zelle(ev) {
      var g = $('[data-np-raster]'), b = g.getBoundingClientRect(), m = rasterMasse();
      var c = Math.round((ev.clientX - b.left - 54) / HW), r = Math.round((ev.clientY - b.top - OY - 74) / HH);
      return { c: Math.max(0, Math.min(m.maxC + 2, c)), r: Math.max(0, Math.min(m.maxR + 2, r)) };
    }
    function frei(c, r, ohne) {
      return !Object.keys(ed.nodes).some(function (k) { var n = ed.nodes[k]; return k !== ohne && Math.abs(n.c - c) < 2 && Math.abs(n.r - r) < 2; });
    }
    function naechsterBuchstabe() {
      var da = {}; aktive().forEach(function (n) { da[(n.letter || '').trim()] = true; });
      var kand = ed.a.namen.filter(function (x) { return !da[x]; })[0];
      if (kand) return kand;
      for (var i = 0; i < 26; i++) { var b = String.fromCharCode(65 + i); if (!da[b]) return b; }
      return '';
    }

    /* Benutzer-Netz → Aktivitäten nach Kasten-ID */
    function vorgaengerIds(id) { return ed.edges.filter(function (e) { return e[1] === id && ed.nodes[e[0]] && !ed.nodes[e[0]].fix; }).map(function (e) { return e[0]; }); }
    function nachfolgerIds(id) { return ed.edges.filter(function (e) { return e[0] === id && ed.nodes[e[1]] && !ed.nodes[e[1]].fix; }).map(function (e) { return e[1]; }); }
    function eigenesNetz(dauerAnders) {
      var akt = {};
      var ok = aktive().every(function (n) {
        var d = dauerAnders && dauerAnders.id === n.id ? dauerAnders.d : parseInt(n.dur, 10);
        if (!(d >= 0)) return false;
        akt[n.id] = { p: vorgaengerIds(n.id), d: d }; return true;
      });
      return ok ? akt : null;
    }
    function reihenfolge() {
      var akt = eigenesNetz(), r = akt ? rechneNetz(akt) : null;
      var o = r ? r.reihe : aktive().sort(function (a, b) { return a.c - b.c || a.r - b.r; }).map(function (n) { return n.id; });
      var l = [];
      o.forEach(function (i) { l.push([i, 'es'], [i, 'ef']); });
      o.slice().reverse().forEach(function (i) { l.push([i, 'lf'], [i, 'ls']); });
      return l;
    }
    function fokus(id, f) {
      var e = $('.np-knoten[data-id="' + id + '"] [data-f="' + f + '"]');
      if (e) { e.focus(); if (e.select) e.select(); }
    }

    /* ----- Formel beim Tippen (eigene Werte, nie die Lösung) ----- */
    function formelText(id, f) {
      var n = ed.nodes[id], name = nm(id);
      var w = function (v) { return v === undefined || v === '' || v === null ? '?' : v; };
      var vor = vorgaengerIds(id), nach = nachfolgerIds(id);
      if (f === 'es') return vor.length ? 'ES von ' + name + ' = größter EF der Vorgänger + 1 = max(' + vor.map(function (x) { return nm(x) + ' ' + w(ed.nodes[x].ef); }).join(', ') + ') + 1'
        : 'ES von ' + name + ' = 1 (erste Aktivität nach Start)';
      if (f === 'ef') return 'EF von ' + name + ' = ES + Dauer − 1 = ' + w(n.es) + ' + ' + w(n.dur) + ' − 1';
      if (f === 'lf') {
        if (nach.length) return 'LF von ' + name + ' = kleinster LS der Nachfolger − 1 = min(' + nach.map(function (x) { return nm(x) + ' ' + w(ed.nodes[x].ls); }).join(', ') + ') − 1';
        var efs = aktive().map(function (x) { return parseInt(x.ef, 10); }).filter(function (x) { return x > 0; });
        return 'LF von ' + name + ' = Projektende = größter EF' + (efs.length ? ' deiner Kästen (' + Math.max.apply(null, efs) + ')' : '');
      }
      if (f === 'ls') return 'LS von ' + name + ' = LF − Dauer + 1 = ' + w(n.lf) + ' − ' + w(n.dur) + ' + 1';
      if (f === 'dur') return 'Dauer von ' + name + ': aus der Tabelle der Aufgabe';
      return '';
    }
    function zeigeFormel(t) {
      var z = $('[data-np-formel]'); if (!z) return;
      if (!t) { z.hidden = true; return; }
      z.textContent = t; z.hidden = false;
    }

    /* ----- Prüfen ----- */
    function leereMarken() {
      ed.marken = {}; ed.alles = false; ed.kritIds = null;
      app.querySelectorAll('.np-knoten input').forEach(function (i) { i.classList.remove('ok', 'bad'); });
      app.querySelectorAll('.np-knoten').forEach(function (k) { k.classList.remove('krit'); });
      var m = $('[data-np-meldungen]'); if (m) m.innerHTML = '';
      var st = $('[data-np-status]'); if (st) st.innerHTML = statusPills(null);
      var fl = $('[data-np-float]'); if (fl) fl.hidden = true;
      var wk = $('[data-np-wenn-karte]'); if (wk) wk.hidden = true;
      app.querySelectorAll('[data-frage-mark]').forEach(function (e) { e.textContent = ''; e.className = 'ue-mark'; });
    }
    function statusPills(s) {
      if (!s) return '<span class="ue-pill">Netz –</span><span class="ue-pill">Forward –</span><span class="ue-pill">Backward –</span><span class="ue-pill">Fragen –</span>';
      var p = function (ok, t) { return '<span class="ue-pill ' + (ok === true ? 'ok' : ok === false ? 'bad' : '') + '">' + t + '</span>'; };
      return p(s.netz, 'Netz ' + (s.netz ? '✓' : '✗')) +
        p(s.fw && s.fw[0] === s.fw[1] ? true : null, 'Forward ' + (s.fw ? s.fw[0] + '/' + s.fw[1] : '–')) +
        p(s.bw && s.bw[0] === s.bw[1] ? true : null, 'Backward ' + (s.bw ? s.bw[0] + '/' + s.bw[1] : '–')) +
        p(s.fr[0] === s.fr[1] ? true : null, 'Fragen ' + s.fr[0] + '/' + s.fr[1]);
    }
    var FELDER = ['es', 'ef', 'ls', 'lf'];
    function pruefeNetz() {
      var A = ed.a, msg = [], akt = aktive(), g = $('[data-np-raster]');
      ed.marken = {};
      app.querySelectorAll('.np-knoten').forEach(function (k) { k.classList.remove('krit'); });
      var buchst = {};
      akt.forEach(function (n) {
        var l = (n.letter || '').trim().toUpperCase();
        if (!l) msg.push('Ein Kasten hat noch keinen Buchstaben.');
        else (buchst[l] = buchst[l] || []).push(n.id);
      });
      Object.keys(buchst).forEach(function (l) {
        if (buchst[l].length > 1) msg.push('Buchstabe ' + l + ' kommt ' + buchst[l].length + '-mal vor.');
        if (!A.akt[l]) msg.push('Aktivität ' + l + ' gibt es in der Aufgabe nicht.');
      });
      A.namen.forEach(function (k) { if (!buchst[k]) msg.push('Aktivität ' + k + ' fehlt noch.'); });
      var dauerOk = true;
      akt.forEach(function (n) {
        var de = g.querySelector('.np-knoten[data-id="' + n.id + '"] .np-dauer');
        if (de) de.classList.remove('ok', 'bad');
        if (n.dur === undefined || n.dur === '') { dauerOk = false; msg.push('Dauer fehlt bei ' + nm(n.id) + '.'); return; }
        var l = (n.letter || '').trim().toUpperCase();
        if (A.akt[l]) {
          var gut = +n.dur === A.akt[l].d;
          ed.marken[n.id + ':dur'] = gut ? 'ok' : 'bad';
          if (!gut) msg.push('Dauer von ' + l + ' passt nicht zur Tabelle.');
        }
      });
      // Pfeile vergleichen (über die Buchstaben)
      var meine = {}, soll = {};
      var nk = function (id) { var n = ed.nodes[id]; return n.fix ? n.fix : nm(id).toUpperCase(); };
      ed.edges.forEach(function (e) { if (ed.nodes[e[0]] && ed.nodes[e[1]]) meine[nk(e[0]) + '>' + nk(e[1])] = true; });
      var hatNach = {};
      A.namen.forEach(function (k) {
        if (!A.akt[k].p.length) soll['Start>' + k] = true;
        A.akt[k].p.forEach(function (p) { soll[p + '>' + k] = true; hatNach[p] = true; });
      });
      A.namen.forEach(function (k) { if (!hatNach[k]) soll[k + '>Finish'] = true; });
      Object.keys(soll).forEach(function (e) { if (!meine[e]) msg.push('Pfeil fehlt: ' + e.replace('>', ' → ')); });
      Object.keys(meine).forEach(function (e) { if (!soll[e]) msg.push('Pfeil zu viel: ' + e.replace('>', ' → ')); });
      var netzOk = msg.length === 0;
      var eigen = dauerOk ? eigenesNetz() : null, R = eigen ? rechneNetz(eigen) : null;
      if (dauerOk && eigen && !R) msg.push('Das Netz enthält einen Kreis.');
      var fw = null, bw = null;
      if (R) {
        fw = [0, 0]; bw = [0, 0];
        akt.forEach(function (n) {
          var l = (n.letter || '').trim().toUpperCase();
          FELDER.forEach(function (f) {
            var vorw = f === 'es' || f === 'ef', z = vorw ? fw : bw;
            z[1]++;
            if (n[f] === undefined || n[f] === '') return;
            var soll = netzOk && A.loes[l] ? A.loes[l][f] : R[f][n.id];
            var gut = +n[f] === soll;
            ed.marken[n.id + ':' + f] = gut ? 'ok' : 'bad';
            if (gut) z[0]++;
          });
        });
      }
      if (!netzOk && R) msg.push('Deine Werte sind gegen dein eigenes Netz geprüft (Folgefehler zählen nicht doppelt).');
      var werteOk = netzOk && R && fw[0] === fw[1] && bw[0] === bw[1];
      var fr = pruefeFragen();
      ed.alles = !!(werteOk && fr[0] === fr[1]);
      ed.kritIds = null;
      if (ed.alles) {
        ed.kritIds = {}; R.reihe.forEach(function (i) { if (R.tf[i] === 0) ed.kritIds[i] = true; });
        msg.unshift('ALLES');
      } else if (werteOk && fr[0] < fr[1]) msg.push('Netz und Werte stimmen. Jetzt fehlen noch Fragen unten.');
      ed.geprueft = true;
      if (ed.probe) zeichne(); else markiere();
      $('[data-np-status]').innerHTML = statusPills({ netz: netzOk, fw: fw, bw: bw, fr: fr });
      $('[data-np-meldungen]').innerHTML = msg.map(function (m) {
        return m === 'ALLES' ? '<li class="gut">Alles richtig. Rot umrandet: kritischer Pfad (Float 0).</li>' : '<li>' + esc(m) + '</li>';
      }).join('');
      zeigeFloat(ed.alles ? R : null);
      var wk = $('[data-np-wenn-karte]'); if (wk) { wk.hidden = !ed.alles; if (ed.alles) zeichneExplorer(); }
      if (ed.alles && statusVon(ed.id) !== 'geloest') { merkeStand(ed.id, { nodes: ed.nodes, edges: ed.edges, nid: ed.nid, antw: ed.antw, wenn: ed.wenn }, true); }
      return ed.alles;
    }
    function zeigeFloat(R) {
      var k = $('[data-np-float]'); if (!k) return;
      if (!R) { k.hidden = true; return; }
      var ids = R.reihe.slice().sort(function (a, b) { return nm(a) < nm(b) ? -1 : 1; });
      k.querySelector('tbody').innerHTML = ids.map(function (i) {
        return '<tr' + (R.tf[i] === 0 ? ' class="krit"' : '') + '><td>' + esc(nm(i)) + '</td><td class="z">' + R.tf[i] + '</td><td class="z">' + R.ff[i] + '</td></tr>';
      }).join('');
      k.hidden = false;
    }

    /* ----- Fragen zur Aufgabe ----- */
    function buchstabenFolge(t) { return (String(t || '').toUpperCase().replace(/START|FINISH/g, '').match(/[A-Z]/g) || []).join(''); }
    function pfadeLesen(t) {
      var m, re = /([A-Za-z](?:\s*[-–>]\s*[A-Za-z])*)\s*[:=(]?\s*(\d+)/g, l = [];
      while ((m = re.exec(String(t || '')))) l.push(buchstabenFolge(m[1]) + ' ' + m[2]);
      return l.sort();
    }
    function sollFrage(f) {
      var R = ed.a.r;
      if (f.typ === 'pfad') return buchstabenFolge(f.args[0]);
      if (f.typ === 'zahl') return String(parseInt(f.args[0], 10));
      if (f.typ === 'float') return String(R.tf[f.args[0].toUpperCase()]);
      if (f.typ === 'ff') return String(R.ff[f.args[0].toUpperCase()]);
      if (f.typ === 'pfade') return pfadeLesen(f.args[0]).join(';');
      return null;
    }
    function frageRichtig(i) {
      var f = ed.a.fragen[i];
      if (f.typ === 'wenn') return !!(ed.wenn[i] && ed.wenn[i].schritt > 4);
      var a = ed.antw[i];
      if (a === undefined || String(a).trim() === '') return null;
      if (f.typ === 'pfad') return buchstabenFolge(a) === sollFrage(f);
      if (f.typ === 'pfade') return pfadeLesen(a).join(';') === sollFrage(f);
      return String(parseInt(a, 10)) === sollFrage(f);
    }
    function pruefeFragen() {
      var n = 0, ok = 0;
      ed.a.fragen.forEach(function (f, i) {
        n++;
        var r = frageRichtig(i), m = app.querySelector('[data-frage-mark="' + i + '"]');
        if (r) ok++;
        if (m && f.typ !== 'wenn') { m.textContent = r === null ? '' : r ? '✓' : '✗'; m.className = 'ue-mark' + (r === null ? '' : r ? ' ok' : ' bad'); }
      });
      return [ok, n];
    }
    function fragenHtml() {
      var A = ed.a, haupt = [], zus = [];
      A.fragen.forEach(function (f, i) { (f.zusatz ? zus : haupt).push(i); });
      var zeile = function (i) {
        var f = A.fragen[i];
        if (f.typ === 'wenn') return wennHtml(i, f);
        var ph = f.typ === 'pfad' ? 'z. B. A-C-…' : f.typ === 'pfade' ? 'A-B-C 9; A-D 7' : '';
        var im = f.typ === 'pfad' || f.typ === 'pfade' ? 'text' : 'numeric';
        var ik = f.typ === 'float' ? iKnopf('float', 'Float') : f.typ === 'ff' ? iKnopf('ff', 'Free Float') : f.typ === 'pfad' ? iKnopf('krit', 'Kritischer Pfad') : f.typ === 'pfade' ? iKnopf('pfade', 'Pfade') : '';
        return '<div class="ue-frage"><span class="txt">' + esc(f.text) + ' ' + ik + '</span>' +
          '<input class="eingabe" data-frage="' + i + '" inputmode="' + im + '" autocomplete="off" autocapitalize="characters" placeholder="' + esc(ph) + '" value="' + esc(ed.antw[i] || '') + '">' +
          '<span class="ue-mark" data-frage-mark="' + i + '" aria-live="polite"></span></div>';
      };
      var html = '<section class="karte"><span class="ueber">Fragen zur Aufgabe</span>' + haupt.map(zeile).join('') + '</section>';
      if (zus.length) html += '<section class="karte"><span class="ueber">Zusatzfragen: Float und Free Float</span>' + zus.map(zeile).join('') +
        '<p class="leise">Float = Slack. Free Float nennt das Buch nur als Begriff; die Werte hier sind nachgerechnet.</p></section>';
      return html;
    }

    /* ----- „Was wäre, wenn“: geführte Frage in vier Schritten ----- */
    function wennDaten(f) {
      var akt = ed.a.akt, n = String(f.args[0] || '').toUpperCase(), neu = parseInt(f.args[1], 10), R = ed.a.r;
      if (!akt[n] || !(neu >= 0)) return null;
      var x = neu - akt[n].d, fl = R.tf[n];
      var R2 = rechneNetz(aktMitDauer(akt, n, neu));
      var fall = fl === 0 ? 'krit' : x <= fl ? 'innen' : 'ueber';
      return { n: n, alt: akt[n].d, neu: neu, x: x, float: fl, fall: fall, ende: R.ende, neuEnde: R2.ende,
        krit: R2.krit.map(function (p) { return p.ids.join('-'); }), pfade: R.pfade.map(function (p) { return p.ids.join('-'); }).sort() };
    }
    var FAELLE = [['innen', 'x ≤ Float: Ende bleibt'], ['ueber', 'x > Float: Ende + (x − Float)'], ['krit', 'auf dem kritischen Pfad: Ende + x']];
    function wennHtml(i, f, variante) {
      var d = variante || wennDaten(f); if (!d) return '';
      var s = (variante ? ed.variante.st : ed.wenn[i]) || { schritt: 1 };
      var key = variante ? 'v' : String(i);
      var kopf = variante ? '<b>Variante:</b> ' + esc(d.n) + ' dauert ' + d.neu + ' statt ' + d.alt + ' Tage' : esc(f.text);
      var h = '<div class="ue-wenn" data-wenn="' + key + '"><div class="ue-wenn-kopf"><span>' + kopf + ' ' + iKnopf('wenn', 'Was wäre, wenn') + '</span>' +
        '<span class="ue-mark' + (s.schritt > 4 ? ' ok' : '') + '">' + (s.schritt > 4 ? '✓' : '') + '</span></div>' +
        '<p class="leise">' + esc(d.n) + ' dauert ' + d.neu + ' statt ' + d.alt + ' Tage, also x = ' + Math.abs(d.x) + ' Tage ' + (d.x >= 0 ? 'mehr' : 'weniger') + '. Rechne mit dem Netz vor der Änderung.</p>';
      var fertig = function (n) { return s.schritt > n; };
      h += '<label class="ue-schritt' + (fertig(1) ? ' fertig' : '') + '">1 · Float von ' + esc(d.n) + ' (vor der Änderung)' +
        '<input class="eingabe" data-wenn-feld="float" inputmode="numeric" autocomplete="off" value="' + esc(s.float || '') + '"' + (fertig(1) ? ' readonly' : '') + '></label>';
      if (s.schritt >= 2) h += '<div class="ue-schritt' + (fertig(2) ? ' fertig' : '') + '"><span>2 · Welcher Fall?</span><div class="ue-wahl">' +
        FAELLE.map(function (fa) { return '<button data-wenn-fall="' + fa[0] + '" aria-pressed="' + (s.fall === fa[0]) + '"' + (fertig(2) ? ' disabled' : '') + '>' + esc(fa[1]) + '</button>'; }).join('') + '</div></div>';
      if (s.schritt >= 3) h += '<label class="ue-schritt' + (fertig(3) ? ' fertig' : '') + '">3 · Neues Projektende (Tag)' +
        '<input class="eingabe" data-wenn-feld="ende" inputmode="numeric" autocomplete="off" value="' + esc(s.ende || '') + '"' + (fertig(3) ? ' readonly' : '') + '></label>';
      if (s.schritt >= 4) h += '<div class="ue-schritt' + (fertig(4) ? ' fertig' : '') + '"><span>4 · Neuer kritischer Pfad</span><div class="ue-wahl">' +
        d.pfade.map(function (p) { return '<button data-wenn-pfad="' + p + '" aria-pressed="' + (s.pfad === p) + '"' + (fertig(4) ? ' disabled' : '') + '>' + esc(p) + '</button>'; }).join('') + '</div></div>';
      if (s.schritt <= 4) h += '<div class="ue-wenn-knoepfe"><button class="knopf klein" data-wenn-pruefen>Schritt prüfen</button><button class="knopf zweit klein" data-wenn-tipp>Tipp' + (s.tipp ? ' ' + Math.min(3, s.tipp + 1) : '') + '</button></div>';
      if (s.meld) h += '<p class="ue-wenn-meld' + (s.meldOk ? ' gut' : '') + '">' + esc(s.meld) + '</p>';
      if (s.tipp >= 1 && s.schritt <= 4) h += '<div class="ue-tipp"><b>Tipp 1:</b> Liegt ' + esc(d.n) + ' auf dem kritischen Pfad? Schau auf den Float: LS − ES.</div>';
      if (s.tipp >= 2 || s.schritt > 4) h += '<div class="ue-tipp">' + (s.schritt > 4 ? '' : '<b>Tipp 2:</b> ') + pfadBalken(d) + '</div>';
      if (s.tipp >= 3 || s.schritt > 4) h += '<div class="ue-tipp">' + (s.schritt > 4 ? '<b>Rechnung:</b> ' : '<b>Tipp 3:</b> ') + esc(wennRechnung(d)) + '</div>';
      if (s.schritt > 4) h += '<button class="knopf zweit klein" data-wenn-probe>Probe im Netz</button>';
      return h + '</div>';
    }
    function wennRechnung(d) {
      var t = 'Float von ' + d.n + ' = ' + d.float + '. ';
      if (d.fall === 'krit') t += d.n + ' liegt auf dem kritischen Pfad → neues Ende = ' + d.ende + ' + ' + d.x + ' = ' + d.neuEnde + '.';
      else if (d.fall === 'innen') t += 'x = ' + d.x + ' ≤ Float ' + d.float + ' → die Verlängerung frisst nur Puffer, das Ende bleibt bei ' + d.ende + '.';
      else t += 'x = ' + d.x + ' > Float ' + d.float + ' → neues Ende = ' + d.ende + ' + (' + d.x + ' − ' + d.float + ') = ' + d.neuEnde + '.';
      return t + ' Neuer kritischer Pfad: ' + d.krit.join(' und ') + ' (längster Pfad nach dem Aufschlag).';
    }
    function pfadBalken(d) {
      var akt = ed.a.akt, R = ed.a.r;
      var liste = R.pfade.map(function (p) {
        var durch = p.ids.indexOf(d.n) >= 0;
        return { name: p.ids.join('-'), alt: p.laenge, neu: p.laenge + (durch ? d.x : 0), durch: durch };
      }).sort(function (a, b) { return b.neu - a.neu || (a.name < b.name ? -1 : 1); });
      var max = Math.max(d.ende, Math.max.apply(null, liste.map(function (p) { return p.neu; }))), pct = function (v) { return (v / max * 100).toFixed(2) + '%'; };
      var laengsterDurch = Math.max.apply(null, liste.filter(function (p) { return p.durch; }).map(function (p) { return p.alt; }));
      var h = '<div class="ue-balken" aria-label="Pfadbalken">';
      liste.forEach(function (p) {
        var gruen = p.durch && p.alt === laengsterDurch && d.ende > p.alt ? '<span class="puffer" style="left:' + pct(p.alt) + ';width:' + pct(d.ende - p.alt) + '"></span>' : '';
        var plus = p.durch && d.x > 0 ? '<span class="plus" style="left:' + pct(p.alt) + ';width:' + pct(d.x) + '"></span>' : '';
        h += '<div class="b-zeile' + (p.durch ? ' durch' : '') + '"><span class="b-name">' + esc(p.name) + '</span><span class="b-spur">' +
          '<span class="basis" style="width:' + pct(p.alt) + '"></span>' + gruen + plus + '<span class="ende" style="left:' + pct(d.ende) + '"></span></span>' +
          '<span class="b-wert">' + p.alt + (p.durch && d.x ? ' → ' + p.neu : '') + '</span></div>';
      });
      return h + '</div><p class="leise">Gestrichelt: altes Projektende (' + d.ende + '). Grün: Float von ' + esc(d.n) + '. Orange: Aufschlag x auf alle Pfade durch ' + esc(d.n) + '.</p>';
    }
    function wennSchritt(key) {
      var vari = key === 'v', f = vari ? null : ed.a.fragen[+key], d = vari ? ed.variante.d : wennDaten(f);
      var s = vari ? ed.variante.st : (ed.wenn[key] = ed.wenn[key] || { schritt: 1 });
      var box = app.querySelector('[data-wenn="' + key + '"]');
      var wert = function (n) { var e = box.querySelector('[data-wenn-feld="' + n + '"]'); return e ? e.value.trim() : ''; };
      s.meldOk = false;
      if (s.schritt === 1) {
        s.float = wert('float');
        if (s.float === '') s.meld = 'Trag zuerst den Float ein.';
        else if (+s.float === d.float) { s.schritt = 2; s.meld = 'Richtig: Float ' + d.float + '.'; s.meldOk = true; }
        else s.meld = 'Noch nicht. Float = LS − ES derselben Aktivität im Netz vor der Änderung.';
      } else if (s.schritt === 2) {
        if (!s.fall) s.meld = 'Tippe einen Fall an.';
        else if (s.fall === d.fall) { s.schritt = 3; s.meld = 'Richtig.'; s.meldOk = true; }
        else s.meld = d.fall === 'krit' ? 'Schau noch einmal auf den Float: Ist er 0?' : 'Vergleiche x = ' + d.x + ' mit dem Float ' + d.float + '.';
      } else if (s.schritt === 3) {
        s.ende = wert('ende');
        if (s.ende === '') s.meld = 'Trag das neue Projektende ein.';
        else if (+s.ende === d.neuEnde) { s.schritt = 4; s.meld = 'Richtig: Ende an Tag ' + d.neuEnde + '.'; s.meldOk = true; }
        else if (+s.ende === d.ende + d.x && d.fall !== 'krit') s.meld = 'Falle: Du hast die volle Verlängerung aufgeschlagen. Zuerst frisst sie den Float.';
        else s.meld = d.fall === 'innen' ? 'Die Verlängerung bleibt im Puffer – was passiert dann mit dem Ende?' : 'Rechne: altes Ende ' + d.ende + ' + ' + (d.fall === 'krit' ? 'x' : '(x − Float)') + '.';
      } else if (s.schritt === 4) {
        if (!s.pfad) s.meld = 'Tippe den neuen kritischen Pfad an.';
        else if (d.krit.indexOf(s.pfad) >= 0) { s.schritt = 5; s.meld = d.krit.length > 1 ? 'Richtig. Es gibt jetzt mehrere kritische Pfade: ' + d.krit.join(', ') + '.' : 'Richtig.'; s.meldOk = true; }
        else s.meld = 'Schlag x auf alle Pfade durch ' + d.n + ' auf; der längste ist der neue kritische Pfad. Der kritische Pfad kann wechseln!';
      }
      if (!vari) sichere();
      erneuereWenn(key);
      if (!vari && U().einst.sofort) pruefeNetz();
      else if (!vari) { var st = $('[data-np-status]'); if (st && ed.geprueft) pruefeNetz(); }
    }
    function erneuereWenn(key) {
      var box = app.querySelector('[data-wenn="' + key + '"]'); if (!box) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = key === 'v' ? wennHtml(null, null, ed.variante.d) : wennHtml(+key, ed.a.fragen[+key]);
      var neu = tmp.firstChild; box.parentNode.replaceChild(neu, box); bindeWenn(neu);
    }
    function bindeWenn(box) {
      var key = box.getAttribute('data-wenn');
      var s = function () { return key === 'v' ? ed.variante.st : (ed.wenn[key] = ed.wenn[key] || { schritt: 1 }); };
      bindeInfo(box);
      box.querySelectorAll('[data-wenn-fall]').forEach(function (b) { b.addEventListener('click', function () { s().fall = b.getAttribute('data-wenn-fall'); box.querySelectorAll('[data-wenn-fall]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }); });
      box.querySelectorAll('[data-wenn-pfad]').forEach(function (b) { b.addEventListener('click', function () { s().pfad = b.getAttribute('data-wenn-pfad'); box.querySelectorAll('[data-wenn-pfad]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }); });
      box.querySelectorAll('[data-wenn-feld]').forEach(function (inp) {
        inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); wennSchritt(key); } });
      });
      var p = box.querySelector('[data-wenn-pruefen]'); if (p) p.addEventListener('click', function () { wennSchritt(key); });
      var t = box.querySelector('[data-wenn-tipp]'); if (t) t.addEventListener('click', function () { var x = s(); x.tipp = Math.min(3, (x.tipp || 0) + 1); if (key !== 'v') sichere(); erneuereWenn(key); });
      var pr = box.querySelector('[data-wenn-probe]'); if (pr) pr.addEventListener('click', function () {
        var d = key === 'v' ? ed.variante.d : wennDaten(ed.a.fragen[+key]); starteProbe(d.n, d.neu);
      });
    }

    /* ----- Probe im Netz: Dauer im Kasten wirklich ändern, Raster rechnet neu ----- */
    function starteProbe(buchstabe, neu) {
      var id = aktive().filter(function (n) { return (n.letter || '').trim().toUpperCase() === buchstabe; })[0];
      var vorher = eigenesNetz(), Ra = vorher ? rechneNetz(vorher) : null;
      if (!id || !Ra) { info('Für die Probe muss dein Netz vollständig sein (alle Kästen mit Buchstabe und Dauer, ohne Kreis).'); return; }
      var Rn = rechneNetz(eigenesNetz({ id: id.id, d: neu }));
      var werte = {}, alt = {}, krit = {}, geaendert = [];
      Ra.reihe.forEach(function (i) {
        alt[i] = { dur: vorher[i].d, es: Ra.es[i], ef: Ra.ef[i], ls: Ra.ls[i], lf: Ra.lf[i], letter: nm(i) };
        werte[i] = { dur: i === id.id ? neu : vorher[i].d, es: Rn.es[i], ef: Rn.ef[i], ls: Rn.ls[i], lf: Rn.lf[i], letter: nm(i) };
        if (Rn.tf[i] === 0) krit[i] = true;
        ['dur', 'es', 'ef', 'ls', 'lf'].forEach(function (f) { if (alt[i][f] !== werte[i][f]) geaendert.push(nm(i) + ' ' + (f === 'dur' ? 'Dauer' : f.toUpperCase()) + ' ' + alt[i][f] + ' → ' + werte[i][f]); });
      });
      ed.probe = { werte: werte, alt: alt, krit: krit };
      zeichne();
      var b = $('[data-np-probe]');
      b.innerHTML = '<p><b>Probe:</b> ' + esc(buchstabe) + ' dauert ' + neu + ' statt ' + alt[id.id].dur + ' Tage. Projektende ' + Rn.ende + ' (vorher ' + Ra.ende + '). Kritischer Pfad: ' +
        esc(Rn.krit.map(function (p) { return pfadText(p.ids, nm); }).join(' und ')) + '.</p>' +
        '<p class="leise">Geändert: ' + esc(geaendert.join(' · ') || 'nichts') + '</p><button class="knopf zweit klein" data-probe-ende>Probe beenden</button>';
      b.hidden = false;
      b.querySelector('[data-probe-ende]').addEventListener('click', beendeProbe);
      var raster = $('.np-blatt'); if (raster && raster.scrollIntoView) raster.scrollIntoView({ block: 'center' });
    }
    function beendeProbe() {
      ed.probe = null; var b = $('[data-np-probe]'); if (b) { b.hidden = true; b.innerHTML = ''; }
      zeichne();
    }

    /* ----- Was wäre, wenn: freie Erkundung nach „Alles richtig“, dazu „Variante üben“ ----- */
    function zeichneExplorer() {
      var k = $('[data-np-explorer]'); if (!k) return;
      var A = ed.a, x = ed.explorer;
      if (!x.akt) { x.akt = A.namen[0]; x.dauer = String(A.akt[A.namen[0]].d + 2); }
      var d = parseInt(x.dauer, 10), html = '<div class="ue-wahl" role="group" aria-label="Aktivität">' + A.namen.map(function (n) {
        return '<button data-ex-akt="' + n + '" aria-pressed="' + (x.akt === n) + '">' + n + '</button>';
      }).join('') + '</div><label class="ue-ex-dauer">Neue Dauer von ' + esc(x.akt) + ' (bisher ' + A.akt[x.akt].d + ')<input class="eingabe" data-ex-dauer inputmode="numeric" value="' + esc(x.dauer) + '"></label>';
      if (d >= 0) {
        var R2 = rechneNetz(aktMitDauer(A.akt, x.akt, d));
        var dd = { n: x.akt, alt: A.akt[x.akt].d, neu: d, x: d - A.akt[x.akt].d, float: A.r.tf[x.akt], ende: A.r.ende, neuEnde: R2.ende };
        html += '<p><b>Neues Projektende: ' + R2.ende + '</b> (vorher ' + A.r.ende + ') · kritischer Pfad ' + esc(R2.krit.map(function (p) { return p.ids.join('-'); }).join(' und ')) + '</p>' +
          pfadBalken(dd) + '<button class="knopf zweit klein" data-ex-probe>Im Netz zeigen</button>';
      }
      k.innerHTML = html;
      k.querySelectorAll('[data-ex-akt]').forEach(function (b) { b.addEventListener('click', function () { x.akt = b.getAttribute('data-ex-akt'); x.dauer = String(A.akt[x.akt].d + 2); zeichneExplorer(); }); });
      var inp = k.querySelector('[data-ex-dauer]');
      inp.addEventListener('change', function () { x.dauer = inp.value.replace(/\D/g, ''); zeichneExplorer(); });
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); x.dauer = inp.value.replace(/\D/g, ''); zeichneExplorer(); } });
      var pr = k.querySelector('[data-ex-probe]'); if (pr) pr.addEventListener('click', function () { starteProbe(x.akt, parseInt(x.dauer, 10)); });
    }
    function neueVariante() {
      var A = ed.a, best = null;
      for (var v = 0; v < 40; v++) {
        var n = A.namen[Math.floor(Math.random() * A.namen.length)], fl = A.r.tf[n];
        var x = fl > 0 && Math.random() < 0.5 ? 1 + Math.floor(Math.random() * fl) : 1 + Math.floor(Math.random() * 4);
        var d = wennDaten({ args: [n, String(A.akt[n].d + x)] });
        if (!d) continue;
        best = d;
        if (d.krit.length === 1 && (!ed.variante || ed.variante.d.n !== n || ed.variante.d.neu !== d.neu)) break;
      }
      ed.variante = { d: best, st: { schritt: 1 } };
      var k = $('[data-np-variante]');
      k.innerHTML = wennHtml(null, null, best) + '<button class="knopf zweit klein" data-variante-neu>Neue Variante</button>';
      bindeWenn(k.querySelector('[data-wenn]'));
      k.querySelector('[data-variante-neu]').addEventListener('click', neueVariante);
    }

    function zeigeNetz(q) {
      var nichtGleich = !ed || ed.id !== q.id || ed.q !== q;
      if (nichtGleich) ed = neuerEditor(q);
      var A = ed.a, einst = U().einst;
      if (A.fehler) { app.innerHTML = '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="#/ueben">' + IKON.links + 'Üben</a></div><p class="meldung fehler">Diese Aufgabe ist fehlerhaft: ' + esc(A.fehler) + '. Bitte die Spalte daten prüfen.</p></main>'; return; }
      var html = '<main class="seite breit ue-seite"><div class="kopf"><a class="textknopf zurueck" href="#/ueben">' + IKON.links + 'Üben</a><span class="ue-status ' + statusVon(q.id) + '">' + STATUS_TEXT[statusVon(q.id)] + '</span></div>' +
        '<div class="ue-kopf">' + abzeichen(q) + '</div><h1 class="gross">Netzplan · ' + esc(titel(q)) + '</h1>' +
        (herkunft(q).typ === 'vertiefung' ? '<p class="leise">Ausblick, darf schwerer sein.</p>' : '') +
        '<p class="ue-quer">Tipp: Handy quer halten – dann passt das Netz besser auf den Bildschirm. Hochkant lässt sich das Raster seitlich wischen.</p>' +
        '<details class="karte ue-aufgabe"' + (statusVon(q.id) === 'offen' ? ' open' : '') + '><summary>Aufgabe</summary><div class="fragetext" lang="en">' + ctx.fragetextHtml(q.frage) + '</div>' +
        '<p class="leise">Zählweise wie im Buch: erster Tag = 1. ' + iKnopf('zaehlweise', 'Zählweise') + '</p></details>' +
        '<div class="np-legende"><div class="np-muster" aria-label="Musterkasten">' +
        '<button class="np-m dauer" data-info="dauer">Dauer <i>i</i></button>' +
        '<div class="np-m-kasten"><button class="np-m es" data-info="es">ES <i>i</i></button><button class="np-m ef" data-info="ef">EF <i>i</i></button>' +
        '<button class="np-m bst" data-info="buchstabe">A <i>i</i></button>' +
        '<button class="np-m ls" data-info="ls">LS <i>i</i></button><button class="np-m lf" data-info="lf">LF <i>i</i></button></div></div>' +
        '<p class="leise">Musterkasten: Tippe auf ein Feld für Formel, Merksatz und Beispiel.</p></div>' +
        '<div class="np-blatt"><div class="np-raster" data-np-raster><svg class="np-pfeile" aria-hidden="true"></svg></div></div>' +
        '<div class="ue-probe" data-np-probe hidden></div>' +
        '<div class="ue-pills" data-np-status>' + statusPills(null) + '</div>' +
        '<div class="np-werkzeuge">' +
        '<button data-np="zurueck" aria-label="Zurück">↶ Zurück</button><button data-np="vor" aria-label="Vor">Vor ↷</button>' +
        '<button data-np="pfeil">Pfeil</button><button data-np="move">Verschieben</button><button data-np="weg">Löschen</button>' +
        '<button data-np="pruefen" class="pri">Prüfen</button><button data-np="netz">Netz vorgeben</button><button data-np="neu">Neu beginnen</button></div>' +
        '<div class="ue-schalter"><label><input type="checkbox" data-einst="sofort"' + (einst.sofort ? ' checked' : '') + '> Sofort prüfen</label>' +
        '<label><input type="checkbox" data-einst="formel"' + (einst.formel ? ' checked' : '') + '> Formel beim Tippen</label></div>' +
        '<p class="leise" data-np-modus></p><ul class="ue-meldungen" data-np-meldungen></ul>' +
        fragenHtml() +
        '<section class="karte" data-np-float hidden><span class="ueber">Float und Free Float aller Aktivitäten</span>' +
        '<table class="ue-tab"><thead><tr><th>Aktivität</th><th class="z">Float = LS − ES ' + iKnopf('float', 'Float') + '</th><th class="z">Free Float ' + iKnopf('ff', 'Free Float') + '</th></tr></thead><tbody></tbody></table>' +
        '<p class="leise">Free Float nachgerechnet, nicht im Buch.</p></section>' +
        '<section class="karte" data-np-wenn-karte hidden><div class="zeile"><span class="ueber">Was wäre, wenn …</span>' + iKnopf('wenn', 'Was wäre, wenn') + '</div>' +
        '<p class="leise">Ändere die Dauer einer Aktivität: Die Lern-App zeigt neues Projektende, kritischen Pfad und alle Pfade.</p>' +
        '<div data-np-explorer></div><div data-np-variante><button class="knopf klein" data-variante-start>Variante üben</button></div>' +
        '<p class="leise">„Variante üben“ wählt im selben Netz eine Aktivität und eine neue Dauer – gerechnet wird nur auf diesem Netz.</p></section>' +
        (q.warum ? '<details class="karte"><summary>Hinweise zur Lösung</summary><p>' + esc(q.warum) + '</p></details>' : '') +
        '<div class="ue-formelzeile" data-np-formel hidden></div></main>';
      app.innerHTML = html;
      zeichne(); knoepfe(); setzeModus(ed.mode, true);
      bindeNetz();
      if (ed.geprueft) pruefeNetz();
    }

    var MODUS_TEXT = {
      edit: 'Einen Punkt im Raster antippen = neuer Kasten mit dem Mittelpunkt dort (auch Zwischenpunkte). Zahlen direkt im Kasten eintippen; „Weiter“ auf der Tastatur springt erst durch den Forward Pass, dann durch den Backward Pass.',
      pfeil: 'Pfeil: erst den Kasten antippen, von dem der Pfeil ausgeht, dann das Ziel. Dasselbe Paar noch einmal = Pfeil weg.',
      weg: 'Löschen: Kasten antippen. Start und Finish bleiben.',
      move: 'Verschieben: Kasten (auch Start oder Finish) antippen, dann den Punkt, an den er soll.',
    };
    function setzeModus(m, still) {
      ed.mode = still ? m : (ed.mode === m ? 'edit' : m);
      ed.armed = null;
      ['pfeil', 'weg', 'move'].forEach(function (x) { var b = $('[data-np="' + x + '"]'); if (b) b.classList.toggle('an', ed.mode === x); });
      var g = $('[data-np-raster]'); if (g) g.className = 'np-raster modus-' + ed.mode;
      var t = $('[data-np-modus]'); if (t) t.textContent = MODUS_TEXT[ed.mode];
      zeichne();
    }
    function bindeNetz() {
      var g = $('[data-np-raster]');
      bindeInfo(app);
      g.addEventListener('click', function (ev) {
        if (ed.probe) return;
        var el = ev.target.closest('.np-knoten,.np-fix');
        if (el) {
          var id = el.getAttribute('data-id'), n = ed.nodes[id];
          if (ed.mode === 'pfeil') {
            if (!ed.armed) { if (n.fix === 'Finish') return info('Finish hat keine Nachfolger.'); ed.armed = id; zeichne(); return; }
            if (ed.armed === id) { ed.armed = null; zeichne(); return; }
            if (n.fix === 'Start') return info('Start hat keine Vorgänger.');
            var k = -1; ed.edges.forEach(function (e, i) { if (e[0] === ed.armed && e[1] === id) k = i; });
            if (k >= 0) ed.edges.splice(k, 1); else ed.edges.push([ed.armed, id]);
            ed.armed = null; zeichne(); merke(); if (U().einst.sofort) pruefeNetz(); return;
          }
          if (ed.mode === 'move') { ed.armed = ed.armed === id ? null : id; zeichne(); return; }
          if (ed.mode === 'weg' && !n.fix) {
            delete ed.nodes[id]; ed.edges = ed.edges.filter(function (e) { return e[0] !== id && e[1] !== id; });
            zeichne(); merke(); return;
          }
          return;
        }
        var z = zelle(ev);
        if (ed.mode === 'move') {
          if (!ed.armed) return;
          if (!frei(z.c, z.r, ed.armed)) return info('Dort ist kein Platz – zu nah an einem anderen Kasten.');
          ed.nodes[ed.armed].c = z.c; ed.nodes[ed.armed].r = z.r; ed.armed = null; zeichne(); merke(); return;
        }
        if (ed.mode !== 'edit') return;
        if (!frei(z.c, z.r)) return;
        var nid = 'n' + (ed.nid++);
        ed.nodes[nid] = { id: nid, c: z.c, r: z.r, letter: naechsterBuchstabe() };
        zeichne(); merke();
        fokus(nid, 'dur');
      });
      g.addEventListener('input', function (ev) {
        var t = ev.target, k = t.closest('.np-knoten'); if (!k || ed.probe) return;
        var id = k.getAttribute('data-id'), f = t.getAttribute('data-f');
        if (f === 'letter') t.value = t.value.toUpperCase().replace(/[^A-Z]/g, '');
        else t.value = t.value.replace(/[^0-9]/g, '');
        ed.nodes[id][f] = t.value;
        t.classList.remove('ok', 'bad'); delete ed.marken[id + ':' + f];
        if (U().einst.formel) zeigeFormel(formelText(id, f));
        if (U().einst.sofort) pruefeNetz();
      });
      g.addEventListener('change', function () { if (!ed.probe) merke(); });
      g.addEventListener('focusin', function (ev) {
        var t = ev.target, k = t.closest && t.closest('.np-knoten');
        if (!k || !U().einst.formel || ed.probe) return;
        zeigeFormel(formelText(k.getAttribute('data-id'), t.getAttribute('data-f')));
      });
      g.addEventListener('focusout', function () { setTimeout(function () { if (!document.activeElement || !document.activeElement.closest || !document.activeElement.closest('.np-knoten')) zeigeFormel(''); }, 50); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        var t = ev.target, k = t.closest('.np-knoten'); if (!k) return;
        var id = k.getAttribute('data-id'), f = t.getAttribute('data-f');
        if (f === 'dur') return fokus(id, 'letter');
        if (f === 'letter') { t.blur(); return; }
        var l = reihenfolge(), i = -1;
        l.forEach(function (x, j) { if (x[0] === id && x[1] === f) i = j; });
        if (i >= 0 && i < l.length - 1) fokus(l[i + 1][0], l[i + 1][1]); else t.blur();
      });
      app.querySelectorAll('[data-np]').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = b.getAttribute('data-np');
          if (ed.probe && a !== 'pruefen') beendeProbe();
          if (a === 'zurueck') zurueck();
          else if (a === 'vor') vor();
          else if (a === 'pfeil' || a === 'move' || a === 'weg') setzeModus(a);
          else if (a === 'pruefen') { if (ed.probe) beendeProbe(); pruefeNetz(); }
          else if (a === 'netz') netzVorgeben();
          else if (a === 'neu') {
            if (!window.confirm('Neu beginnen? Netz, Werte und Antworten dieser Aufgabe werden geleert („Zurück“ holt das Netz wieder).')) return;
            leeresNetz(ed); ed.antw = {}; ed.wenn = {}; ed.geprueft = false; ed.variante = null;
            merke(); sichere(); zeigeNetz(ed.q);
          }
        });
      });
      app.querySelectorAll('[data-einst]').forEach(function (c) {
        c.addEventListener('change', function () {
          U().einst[c.getAttribute('data-einst')] = c.checked; ctx.speichere();
          if (c.getAttribute('data-einst') === 'sofort' && c.checked) pruefeNetz();
          if (!c.checked) zeigeFormel('');
        });
      });
      app.querySelectorAll('[data-frage]').forEach(function (inp) {
        inp.addEventListener('input', function () {
          var i = inp.getAttribute('data-frage'); ed.antw[i] = inp.value;
          var m = app.querySelector('[data-frage-mark="' + i + '"]'); if (m) { m.textContent = ''; m.className = 'ue-mark'; }
          sichere();
          if (U().einst.sofort) pruefeNetz();
        });
        inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } });
      });
      app.querySelectorAll('[data-wenn]').forEach(bindeWenn);
      var vs = $('[data-variante-start]'); if (vs) vs.addEventListener('click', neueVariante);
    }
    function netzVorgeben() {
      var A = ed.a, map = { Start: 'S', Finish: 'Z' };
      leeresNetz(ed);
      A.r.reihe.forEach(function (k) {
        var id = 'n' + (ed.nid++);
        ed.nodes[id] = { id: id, c: ed.lay.pos[k][0], r: ed.lay.pos[k][1], letter: k, dur: String(A.akt[k].d) }; map[k] = id;
      });
      var hatNach = {};
      A.namen.forEach(function (k) {
        if (!A.akt[k].p.length) ed.edges.push(['S', map[k]]);
        A.akt[k].p.forEach(function (p) { ed.edges.push([map[p], map[k]]); hatNach[p] = true; });
      });
      A.namen.forEach(function (k) { if (!hatNach[k]) ed.edges.push([map[k], 'Z']); });
      ed.armed = null; ed.geprueft = false;
      zeichne(); leereMarken(); merke();
      info('Netz vorgegeben – jetzt nur noch rechnen.', 'leise');
    }

    document.addEventListener('keydown', function (ev) {
      if (!ed || !(ev.ctrlKey || ev.metaKey) || (ev.target && ev.target.tagName === 'INPUT')) return;
      if (!$('[data-np-raster]')) return;
      var k = ev.key.toLowerCase();
      if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); zurueck(); }
      else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); vor(); }
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') schliesseInfo(); });

    /* ======================= Earned Value ======================= */

    var KZ = ['BAC', 'PV', 'EV', 'AC', 'CV', 'SV', 'CPI', 'SPI', 'EAC', 'ETC', 'VAC', 'TCPI'];
    var GRUPPEN = [['PEA – Grundwerte', ['BAC', 'PV', 'EV', 'AC']], ['Abweichungen (Variance = minus)', ['CV', 'SV']],
      ['Indizes (Index = geteilt)', ['CPI', 'SPI']], ['Prognosen (Forecast)', ['EAC', 'ETC', 'VAC', 'TCPI']]];
    var SCHLUESSEL = { 'bac': 'BAC', 'pv': 'PV', 'ev': 'EV', 'ac': 'AC', 'cv': 'CV', 'sv': 'SV', 'cpi': 'CPI', 'spi': 'SPI', 'eac': 'EAC', 'etc': 'ETC', 'vac': 'VAC', 'tcpi': 'TCPI',
      'dauer': 'dauer', 'zeitpunkt': 'zeit', 'zeit': 'zeit', 'geplant %': 'plan', 'geplant': 'plan', 'fertig %': 'fertig', 'fertig': 'fertig' };
    function zahlLesen(t) { var n = parseFloat(String(t).replace(',', '.')); return isFinite(n) ? n : null; }
    function parseEv(q) {
      var geg = {}, buch = {};
      zeilen(q.daten).slice(1).forEach(function (z) {
        var t = teile(z), k = SCHLUESSEL[String(t[0] || '').toLowerCase()];
        if (k && t.length >= 2 && zahlLesen(t[1]) != null) geg[k] = zahlLesen(t[1]);
      });
      zeilen(q.loesung).forEach(function (z) {
        var t = teile(z), k = SCHLUESSEL[String(t[0] || '').toLowerCase()];
        if (k && KZ.indexOf(k) >= 0 && zahlLesen(t[1]) != null) buch[k] = { w: zahlLesen(t[1]), hinweis: t[2] || '' };
      });
      return { geg: geg, buch: buch, exakt: evLoese(geg), mitBuch: herkunft(q).typ === 'buch' };
    }
    /* Löst die Formeln in beide Richtungen, bis nichts Neues mehr folgt (z. B. AC = EV / CPI in der Vertiefung). */
    function evLoese(geg) {
      var v = {}; Object.keys(geg).forEach(function (k) { v[k] = geg[k]; });
      var da = function () { for (var i = 0; i < arguments.length; i++) if (v[arguments[i]] == null) return false; return true; };
      var setze = function (k, x) { if (v[k] == null && isFinite(x)) { v[k] = x; return true; } return false; };
      for (var runde = 0; runde < 20; runde++) {
        var neu = false;
        if (da('dauer', 'zeit') && v.dauer > 0) neu = setze('plan', v.zeit / v.dauer * 100) || neu;
        if (da('BAC', 'plan')) neu = setze('PV', v.BAC * v.plan / 100) || neu;
        if (da('BAC', 'fertig')) neu = setze('EV', v.BAC * v.fertig / 100) || neu;
        if (da('EV', 'CPI') && v.CPI) neu = setze('AC', v.EV / v.CPI) || neu;
        if (da('EV', 'SPI') && v.SPI) neu = setze('PV', v.EV / v.SPI) || neu;
        if (da('EV', 'AC')) { neu = setze('CV', v.EV - v.AC) || neu; if (v.AC) neu = setze('CPI', v.EV / v.AC) || neu; }
        if (da('EV', 'PV')) { neu = setze('SV', v.EV - v.PV) || neu; if (v.PV) neu = setze('SPI', v.EV / v.PV) || neu; }
        if (da('BAC', 'CPI') && v.CPI) neu = setze('EAC', v.BAC / v.CPI) || neu;
        if (da('EAC', 'AC')) neu = setze('ETC', v.EAC - v.AC) || neu;
        if (da('BAC', 'EAC')) neu = setze('VAC', v.BAC - v.EAC) || neu;
        if (da('BAC', 'EV', 'AC') && v.BAC !== v.AC) neu = setze('TCPI', (v.BAC - v.EV) / (v.BAC - v.AC)) || neu;
        if (!neu) break;
      }
      return v;
    }
    /* Formeln je Kennzahl – für Folgefehler mit Saschas eigenen Vorwerten und für „Formel beim Tippen“ */
    var EVF = {
      PV: [{ t: 'PV = BAC × Zeit / Dauer', geht: function (v) { return v.zeit != null && v.dauer; }, f: function (v) { return v.BAC * v.zeit / v.dauer; }, z: ['BAC', 'zeit', 'dauer'] },
        { t: 'PV = BAC × geplant %', geht: function (v) { return v.plan != null && v.zeit == null; }, f: function (v) { return v.BAC * v.plan / 100; }, z: ['BAC', 'plan'] },
        { t: 'PV = EV / SPI', geht: function (v) { return v.plan == null && v.zeit == null; }, f: function (v) { return v.EV / v.SPI; }, z: ['EV', 'SPI'] }],
      EV: [{ t: 'EV = BAC × fertig %', geht: function (v) { return v.fertig != null; }, f: function (v) { return v.BAC * v.fertig / 100; }, z: ['BAC', 'fertig'] }],
      AC: [{ t: 'AC = EV / CPI', geht: function () { return true; }, f: function (v) { return v.EV / v.CPI; }, z: ['EV', 'CPI'] }],
      CV: [{ t: 'CV = EV − AC', f: function (v) { return v.EV - v.AC; }, z: ['EV', 'AC'] }],
      SV: [{ t: 'SV = EV − PV', f: function (v) { return v.EV - v.PV; }, z: ['EV', 'PV'] }],
      CPI: [{ t: 'CPI = EV / AC', f: function (v) { return v.EV / v.AC; }, z: ['EV', 'AC'] }],
      SPI: [{ t: 'SPI = EV / PV', f: function (v) { return v.EV / v.PV; }, z: ['EV', 'PV'] }],
      EAC: [{ t: 'EAC = BAC / CPI', f: function (v) { return v.BAC / v.CPI; }, z: ['BAC', 'CPI'] }],
      ETC: [{ t: 'ETC = EAC − AC', f: function (v) { return v.EAC - v.AC; }, z: ['EAC', 'AC'] }],
      VAC: [{ t: 'VAC = BAC − EAC', f: function (v) { return v.BAC - v.EAC; }, z: ['BAC', 'EAC'] }],
      TCPI: [{ t: 'TCPI = (BAC − EV) / (BAC − AC)', f: function (v) { return (v.BAC - v.EV) / (v.BAC - v.AC); }, z: ['BAC', 'EV', 'BAC', 'AC'] }],
    };
    var MINUS = { CV: 1, SV: 1, ETC: 1, VAC: 1 };
    var evEd = null;
    function evNeu(q) {
      var p = parseEv(q), st = eintrag(q.id) && eintrag(q.id).stand;
      return { id: q.id, q: q, p: p, werte: (st && st.werte) || {}, ergebnis: null, letztes: null, rech: { ausdruck: '', erg: null, verlauf: (st && st.verlauf) || [] } };
    }
    function ezl(t) { return ctx.evZahlLesen(String(t == null ? '' : t).replace(/[−–]/g, '-')); }
    /* Gegebene Werte (z. B. BAC, AC) stehen nur mit Häkchen „Gegebene Werte eintragen“ vorbelegt und gesperrt im Blatt (seit 1.14.1);
     * sonst ist das Blatt leer und sie werden wie jede Kennzahl eingetragen und geprüft. */
    function evIstGegeben(k) { return evEd.p.geg[k] != null && KZ.indexOf(k) >= 0; }
    function evGegeben(k) { return U().einst.gegeben === true && evIstGegeben(k); }
    function eigeneWerte() {
      var v = {}, ex = evEd.p.exakt;
      ['dauer', 'zeit', 'plan', 'fertig'].forEach(function (k) { if (ex[k] != null) v[k] = ex[k]; });
      KZ.forEach(function (k) {
        var e = evGegeben(k) ? evEd.p.geg[k] : ezl(evEd.werte[k]);
        v[k] = e != null ? e : ex[k];
      });
      return v;
    }
    function evBewerte(k) {
      if (evGegeben(k)) return { art: 'gegeben' };
      var roh = evEd.werte[k], w = ezl(roh);
      if (roh == null || String(roh).trim() === '') return { art: 'leer' };
      if (w == null) return { art: 'falsch', text: 'Keine Zahl.' };
      var ex = evEd.p.exakt[k], b = evEd.p.buch[k];
      if (r2(w) === r2(ex)) return { art: 'exakt' };
      if (b && r2(w) === r2(b.w)) return { art: 'buch', text: 'Buchwert' + (b.hinweis ? ' – ' + b.hinweis : '') };
      var v = eigeneWerte(), gut = (EVF[k] || []).some(function (fo) { return (!fo.geht || fo.geht(v)) && r2(w) === r2(fo.f(v)); });
      if (gut) return { art: 'folge', text: 'Folgefehler: mit deinen eigenen Vorwerten richtig gerechnet.' };
      return { art: 'falsch', text: 'Noch nicht. ' + evFormelText(k, false) };
    }
    function evFormelText(k, mitWerten) {
      var v = eigeneWerte(), fo = (EVF[k] || []).filter(function (x) { return !x.geht || x.geht(v); })[0];
      if (!fo) return k + ': gegeben';
      if (!mitWerten) return fo.t;
      var name = { zeit: 'Zeit', dauer: 'Dauer', plan: 'geplant %', fertig: 'fertig %' };
      var eig = function (x) {
        if (KZ.indexOf(x) >= 0 && !evGegeben(x)) { var w = ezl(evEd.werte[x]); return w == null ? x + ' ?' : zahlDe(w); }
        var val = KZ.indexOf(x) >= 0 ? evEd.p.geg[x] : evEd.p.exakt[x];
        return val == null ? (name[x] || x) + ' ?' : zahlDe(val) + (x === 'plan' || x === 'fertig' ? ' %' : '');
      };
      var t = fo.t.split('=')[0] + '= ' + fo.t.split('=')[1].trim().replace(/BAC|EAC|TCPI|CPI|SPI|EV|PV|AC|Zeit|Dauer|geplant %|fertig %/g, function (m) {
        var map = { 'Zeit': 'zeit', 'Dauer': 'dauer', 'geplant %': 'plan', 'fertig %': 'fertig' };
        return eig(map[m] || m);
      });
      return t;
    }
    function evGegebenText() {
      var g = evEd.p.geg, t = [];
      if (g.BAC != null) t.push('BAC ' + zahlDe(g.BAC));
      if (g.dauer != null) t.push('Dauer ' + zahlDe(g.dauer));
      if (g.zeit != null) t.push('vergangen ' + zahlDe(g.zeit));
      if (g.plan != null) t.push('geplant ' + zahlDe(g.plan) + ' %');
      if (g.fertig != null) t.push('fertig ' + zahlDe(g.fertig) + ' %');
      ['EV', 'AC', 'CPI', 'SPI', 'PV'].forEach(function (k) { if (g[k] != null) t.push(k + ' ' + zahlDe(g[k])); });
      return t.join(' · ');
    }
    function zeigeEv(q) {
      if (!evEd || evEd.id !== q.id || evEd.q !== q) evEd = evNeu(q);
      var e = evEd, einst = U().einst, kz = ctx.EV_KZ;
      var lang = function (k) { var x = kz.filter(function (y) { return y.k === k; })[0]; return x ? x.lang.replace(/[\[\]]/g, '') : ''; };
      var html = '<main class="seite ue-seite ue-ev"><div class="kopf"><a class="textknopf zurueck" href="#/ueben">' + IKON.links + 'Üben</a><span class="ue-status ' + statusVon(q.id) + '">' + STATUS_TEXT[statusVon(q.id)] + '</span></div>' +
        '<div class="ue-kopf">' + abzeichen(q) + '</div><h1 class="gross">Earned Value · ' + esc(titel(q)) + '</h1>' +
        (herkunft(q).typ === 'vertiefung' ? '<p class="leise">Ausblick, darf schwerer sein: Hier sind andere Werte gegeben – die Formeln werden umgestellt.</p>' : '') +
        '<details class="karte ue-aufgabe"' + (statusVon(q.id) === 'offen' ? ' open' : '') + '><summary>Aufgabe</summary><div class="fragetext" lang="en">' + ctx.fragetextHtml(q.frage) + '</div>' +
        '<p><b>Gegeben:</b> ' + esc(evGegebenText()) + '</p></details>' +
        '<div class="ue-schalter"><label><input type="checkbox" data-einst="sofort"' + (einst.sofort ? ' checked' : '') + '> Sofort prüfen</label>' +
        '<label><input type="checkbox" data-einst="formel"' + (einst.formel ? ' checked' : '') + '> Formel beim Tippen</label>' +
        '<label><input type="checkbox" data-einst="gegeben"' + (einst.gegeben ? ' checked' : '') + '> Gegebene Werte eintragen</label></div>';
      GRUPPEN.forEach(function (gr) {
        html += '<section class="karte"><span class="ueber">' + esc(gr[0]) + '</span>' + gr[1].map(function (k) {
          var geg = evGegeben(k), wert = geg ? zahlDe(e.p.geg[k]) : (e.werte[k] || '');
          return '<div class="ev-feld" data-ev-zeile="' + k + '"><label for="ev-' + k + '"><span class="ev-abk">' + k + '</span><span class="lang" lang="en">' + esc(lang(k)) + '</span>' + (geg ? '<span class="ev-geg">gegeben</span>' : '') + '</label>' +
            iKnopf('ev:' + k, k) +
            '<span class="ev-eingabe-zeile"><input id="ev-' + k + '" class="eingabe" data-ev-wert="' + k + '" inputmode="decimal" autocomplete="off" value="' + esc(wert) + '"' + (geg ? ' readonly data-gegeben' : '') + '>' +
            (!geg && MINUS[k] ? '<button class="ue-pm" data-ev-pm="' + k + '" aria-label="Vorzeichen von ' + k + ' wechseln">±</button>' : '') + '</span>' +
            '<span class="ue-mark" data-ev-mark="' + k + '"></span><p class="ev-hinweis" data-ev-hinweis="' + k + '"></p></div>';
        }).join('') + '</section>';
      });
      html += '<div class="ue-formelzeile statisch" data-ev-formel hidden></div>' +
        '<button class="knopf" data-ev-pruefen>Prüfen</button><div class="ue-pills" data-ev-status></div><div data-ev-ergebnis></div>' +
        '<p class="leise">Gewertet wird der exakte Wert auf zwei Stellen oder der Buchwert. Folgefehler: Rechnest du mit einem eigenen falschen Vorwert richtig weiter, zählt das als richtig.</p>' +
        rechnerHtml() + '</main>';
      app.innerHTML = html;
      bindeEv();
      if (e.ergebnis) evPruefe();
    }
    function evPruefe() {
      var e = evEd, ok = 0, n = 0, alle = {};
      KZ.forEach(function (k) {
        var b = evBewerte(k); alle[k] = b;
        var inp = app.querySelector('[data-ev-wert="' + k + '"]'), m = app.querySelector('[data-ev-mark="' + k + '"]'), h = app.querySelector('[data-ev-hinweis="' + k + '"]');
        if (b.art === 'gegeben') return;
        n++;
        var gut = b.art === 'exakt' || b.art === 'buch' || b.art === 'folge';
        if (gut) ok++;
        inp.classList.remove('ok', 'bad');
        if (b.art !== 'leer') inp.classList.add(gut ? 'ok' : 'bad');
        m.textContent = b.art === 'leer' ? '' : gut ? '✓' : '✗'; m.className = 'ue-mark' + (b.art === 'leer' ? '' : gut ? ' ok' : ' bad');
        h.textContent = b.text || ''; h.className = 'ev-hinweis' + (b.art === 'buch' || b.art === 'folge' ? ' gut' : '');
      });
      e.ergebnis = { ok: ok, n: n };
      app.querySelector('[data-ev-status]').innerHTML = '<span class="ue-pill ' + (ok === n ? 'ok' : '') + '">' + ok + ' von ' + n + ' richtig</span>';
      var erg = app.querySelector('[data-ev-ergebnis]');
      if (ok === n) {
        erg.innerHTML = evVergleichHtml(alle);
        if (statusVon(e.id) !== 'geloest') { merkeStand(e.id, { werte: e.werte, verlauf: e.rech.verlauf }, true); var s = app.querySelector('.ue-status'); if (s) { s.className = 'ue-status geloest'; s.textContent = 'gelöst'; } }
      } else erg.innerHTML = '';
    }
    function evVergleichHtml(alle) {
      var e = evEd, buch = Object.keys(e.p.buch).length && e.p.mitBuch, ex = e.p.exakt;
      var art = function (k) { return { 'exakt': '', buch: 'Buchwert', folge: 'Folgefehler', gegeben: 'gegeben' }[alle[k].art] || ''; };
      var h = '<section class="karte"><div class="ergebnis ok" style="padding:12px"><span class="kreis">' + IKON.ok + '</span><span><strong>Alles richtig</strong></span></div>' +
        '<div class="matrix-rahmen ev-rahmen"><table class="ev-tabelle ue-vergleich"><thead><tr><th>Kennzahl</th><th class="z">Deine</th><th class="z">Exakt</th>' + (buch ? '<th class="z">Buch</th>' : '') + '<th>Deutung</th></tr></thead><tbody>' +
        KZ.map(function (k) {
          var dein = evGegeben(k) ? zahlDe(e.p.geg[k]) : zahlDe(ezl(e.werte[k]));
          var b = e.p.buch[k], abw = b && r2(b.w) !== r2(ex[k]);
          var d = ctx.evDeutung(k, ex);
          return '<tr><td><b>' + k + '</b>' + (art(k) ? '<span class="in">' + art(k) + '</span>' : '') + '</td><td class="z">' + dein + '</td><td class="z">' + zahlDe(ex[k]) + '</td>' +
            (buch ? '<td class="z' + (abw ? ' abw' : '') + '">' + (b ? zahlDe(b.w) : '–') + (abw && b.hinweis ? '<span class="in">' + esc(b.hinweis) + '</span>' : '') + '</td>' : '') +
            '<td>' + (d[1] ? '<span class="tag ' + d[0] + '">' + esc(d[1]) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (buch ? '<p class="leise">Orange: Das Buch weicht vom exakten Wert ab (Rundung oder Druckfehler). Beide Werte gelten als richtig.</p>' : '') +
        (e.q.warum ? '<p class="ev-deutung">' + esc(e.q.warum) + '</p>' : '') + '</section>';
      return h;
    }
    function bindeEv() {
      bindeInfo(app);
      var formel = app.querySelector('[data-ev-formel]');
      app.querySelectorAll('[data-ev-wert]').forEach(function (inp) {
        var k = inp.getAttribute('data-ev-wert');
        if (inp.hasAttribute('data-gegeben')) return;
        inp.addEventListener('focus', function () {
          evEd.letztes = k; rechnerAnzeige();
          if (U().einst.formel) { formel.textContent = evFormelText(k, true); formel.hidden = false; inp.closest('.ev-feld').appendChild(formel); }
        });
        inp.addEventListener('blur', function () { setTimeout(function () { if (!document.activeElement || !document.activeElement.hasAttribute || !document.activeElement.hasAttribute('data-ev-wert')) formel.hidden = true; }, 60); });
        inp.addEventListener('input', function () {
          evEd.werte[k] = inp.value;
          inp.classList.remove('ok', 'bad');
          var m = app.querySelector('[data-ev-mark="' + k + '"]'); m.textContent = ''; m.className = 'ue-mark';
          app.querySelector('[data-ev-hinweis="' + k + '"]').textContent = '';
          merkeStand(evEd.id, { werte: evEd.werte, verlauf: evEd.rech.verlauf }, false);
          if (U().einst.formel) formel.textContent = evFormelText(k, true);
          if (U().einst.sofort) evPruefe();
        });
        inp.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Enter') return; ev.preventDefault();
          var frei = KZ.filter(function (x) { return !evGegeben(x); }), i = frei.indexOf(k);
          var naechstes = i >= 0 && i < frei.length - 1 ? app.querySelector('[data-ev-wert="' + frei[i + 1] + '"]') : null;
          if (naechstes) naechstes.focus(); else inp.blur();
        });
      });
      app.querySelectorAll('[data-ev-pm]').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-ev-pm'), inp = app.querySelector('[data-ev-wert="' + k + '"]');
          var v = inp.value.trim().replace(/^[−–]/, '-');
          inp.value = v.charAt(0) === '-' ? v.slice(1) : '-' + v;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
      app.querySelector('[data-ev-pruefen]').addEventListener('click', evPruefe);
      app.querySelectorAll('[data-einst]').forEach(function (c) {
        c.addEventListener('change', function () {
          var a = c.getAttribute('data-einst'); U().einst[a] = c.checked; ctx.speichere();
          if (a === 'gegeben') { var y = window.scrollY; zeigeEv(evEd.q); window.scrollTo(0, y); return; }
          if (a === 'sofort' && c.checked) evPruefe(); if (!c.checked) formel.hidden = true;
        });
      });
      bindeRechner();
    }

    /* ----- Taschenrechner (rechnet nur, was eingetippt wird – keine Formeln) ----- */
    var TASTEN = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', ',', '←', '='];
    function rechnerHtml() {
      return '<details class="ue-rechner" data-rechner><summary><span>Rechner</span><span class="leise" data-rechner-kurz></span></summary>' +
        '<div class="ue-r-anzeige"><div class="ausdruck" data-r-ausdruck>&nbsp;</div><div class="erg" data-r-erg>&nbsp;</div></div>' +
        '<div class="ue-r-tasten">' + TASTEN.map(function (t) { return '<button data-taste="' + t + '"' + (t === '=' ? ' class="gleich"' : /[÷×−+]/.test(t) ? ' class="op"' : '') + '>' + t + '</button>'; }).join('') + '</div>' +
        '<button class="knopf klein" data-r-uebernehmen>In Feld übernehmen</button><ul class="ue-r-verlauf" data-r-verlauf></ul></details>';
    }
    function rechne(ausdruck) {
      var s = String(ausdruck).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.').replace(/\s/g, ''), i = 0;
      function zahl() {
        var m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i)); if (!m) throw new Error('Zahl erwartet');
        i += m[0].length; return parseFloat(m[0]);
      }
      function faktor() {
        if (s[i] === '-') { i++; return -faktor(); }
        if (s[i] === '+') { i++; return faktor(); }
        if (s[i] === '(') { i++; var v = summe(); if (s[i] !== ')') throw new Error('Klammer fehlt'); i++; return v; }
        return zahl();
      }
      function produkt() {
        var v = faktor();
        while (s[i] === '*' || s[i] === '/') { var o = s[i++], w = faktor(); v = o === '*' ? v * w : v / w; }
        return v;
      }
      function summe() {
        var v = produkt();
        while (s[i] === '+' || s[i] === '-') { var o = s[i++], w = produkt(); v = o === '+' ? v + w : v - w; }
        return v;
      }
      if (!s) throw new Error('Leer');
      var v = summe(); if (i !== s.length) throw new Error('Unerwartetes Zeichen');
      if (!isFinite(v)) throw new Error('Division durch 0');
      return v;
    }
    function zahlLang(x) { var t = String(Math.round(x * 1e10) / 1e10).replace('.', ','); return t; }
    function rechnerAnzeige() {
      var r = evEd && evEd.rech; if (!r) return;
      var a = app.querySelector('[data-r-ausdruck]'), e = app.querySelector('[data-r-erg]'), v = app.querySelector('[data-r-verlauf]'), k = app.querySelector('[data-rechner-kurz]'), u = app.querySelector('[data-r-uebernehmen]');
      if (!a) return;
      a.textContent = r.ausdruck || ' ';
      e.textContent = r.fehler ? r.fehler : r.erg == null ? ' ' : '= ' + zahlLang(r.erg) + (r2(r.erg) !== Math.round(r.erg * 1e10) / 1e10 ? '  ≈ ' + String(r2(r.erg)).replace('.', ',') : '');
      v.innerHTML = r.verlauf.slice(-3).reverse().map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
      k.textContent = r.erg != null ? '= ' + String(r2(r.erg)).replace('.', ',') : '';
      u.disabled = r.erg == null || !evEd.letztes;
      u.textContent = evEd.letztes ? 'In Feld ' + evEd.letztes + ' übernehmen' : 'In Feld übernehmen (erst ein Feld antippen)';
    }
    function bindeRechner() {
      var r = evEd.rech;
      app.querySelectorAll('[data-taste]').forEach(function (b) {
        b.addEventListener('click', function () {
          var t = b.getAttribute('data-taste'); r.fehler = '';
          if (t === 'C') { r.ausdruck = ''; r.erg = null; r.fertig = false; }
          else if (t === '←') { if (r.fertig) { r.fertig = false; r.erg = null; } else r.ausdruck = r.ausdruck.slice(0, -1); }
          else if (t === '=') {
            try { r.erg = rechne(r.ausdruck); r.fertig = true; r.verlauf.push(r.ausdruck + ' = ' + String(r2(r.erg)).replace('.', ',')); if (r.verlauf.length > 3) r.verlauf.shift(); }
            catch (err) { r.erg = null; r.fehler = err.message; r.fertig = false; }
          } else {
            if (r.fertig) {   // nach „=“: Ziffer beginnt neu, Rechenzeichen rechnet mit dem Ergebnis weiter
              r.ausdruck = /[÷×−+]/.test(t) ? zahlLang(r.erg) : '';
              r.fertig = false;
            }
            r.ausdruck += t; r.erg = null;
          }
          rechnerAnzeige();
        });
      });
      app.querySelector('[data-r-uebernehmen]').addEventListener('click', function () {
        if (r.erg == null || !evEd.letztes) return;
        var k = evEd.letztes, inp = app.querySelector('[data-ev-wert="' + k + '"]');
        inp.value = String(r2(r.erg)).replace('.', ',');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.focus();
      });
      rechnerAnzeige();
    }

    /* ======================= Liste (Reiter Üben) ======================= */
    function rang(q) { var h = herkunft(q).typ; return (h === 'buch' ? 0 : h === 'eigene' ? 1 : 2); }
    function zeigeListe() {
      var alle = ctx.uebungen();
      var gruppe = function (typ, name, beschreibung) {
        var l = alle.filter(function (q) { return art(q) === typ; }).sort(function (a, b) { return rang(a) - rang(b) || (a.id < b.id ? -1 : 1); });
        var g = { offen: 0, angefangen: 0, geloest: 0 }; l.forEach(function (q) { g[statusVon(q.id)]++; });
        var h = '<section class="karte ue-bereich"><div class="zeile"><h2 class="ue-bereich-titel">' + name + '</h2><span class="leise">' + g.geloest + ' von ' + l.length + ' gelöst</span></div>' +
          '<p class="leise">' + beschreibung + '</p>';
        if (!l.length) return h + '<p class="leise">Noch keine Aufgaben in deiner Fragenbank.</p></section>';
        var vorher = null;
        l.forEach(function (q) {
          var hk = herkunft(q).typ;
          if (hk === 'vertiefung' && vorher !== 'vertiefung') h += '<p class="ue-ausblick">Ausblick, darf schwerer sein:</p>';
          vorher = hk;
          var st = statusVon(q.id);
          h += '<a class="eintrag ue-eintrag" href="#/uebung/' + encodeURIComponent(q.id) + '"><span class="status ' + (st === 'geloest' ? 'ok' : st === 'angefangen' ? 'halb' : '') + '">' +
            (st === 'geloest' ? '✓' : st === 'angefangen' ? '…' : '•') + '</span><span class="mitte"><span>' + abzeichen(q) + '</span><span>' + esc(titel(q)) + ' · ' + STATUS_TEXT[st] + '</span></span>' + IKON.rechts + '</a>';
        });
        return h + '</section>';
      };
      app.innerHTML = '<main class="seite mit-nav">' + ctx.kopfMitZahnrad('<h1 class="gross">Üben</h1>') +
        '<p class="unter">Rechnen wie in der Prüfung: Netzplan und Earned Value. Zählt nicht zur Quote der Fragen.</p>' +
        gruppe('cpm', 'Netzplan', 'Critical Path Method: Netz zeichnen, Forward und Backward Pass, Float, „Was wäre, wenn“.') +
        gruppe('ev', 'Earned Value', 'Alle 12 Kennzahlen in der Reihenfolge der Formelsammlung: PEA, Abweichungen, Indizes, Prognosen.') +
        (alle.length ? '' : '<p class="meldung">Übungen kommen über ein Paket mit der Spalte <code>daten</code> in deine Fragenbank.</p>') +
        '<p class="leise">Gängige Formeln der Critical Path Method und des Earned Value; Aufgaben aus deiner Fragenbank. <a href="#/quellen">Quellen und Hinweise</a></p>' +
        '</main>' + ctx.nav('ueben');
    }
    function zeigeAufgabe(id) {
      var q = ctx.uebungen().filter(function (x) { return x.id === id; })[0];
      if (!q) { app.innerHTML = '<main class="seite"><div class="kopf"><a class="textknopf zurueck" href="#/ueben">' + IKON.links + 'Üben</a></div><p class="meldung">Aufgabe ' + esc(id) + ' nicht gefunden.</p></main>'; return; }
      if (art(q) === 'cpm') zeigeNetz(q); else zeigeEv(q);
    }
    function verlassen() { schliesseInfo(); if (ed && ed.probe) ed.probe = null; }

    return { zeigeListe: zeigeListe, zeigeAufgabe: zeigeAufgabe, verlassen: verlassen, art: art,
      test: { rechneNetz: rechneNetz, parseCpm: parseCpm, parseEv: parseEv, evLoese: evLoese, rechne: rechne, anordnung: anordnung,
        editor: function () { return ed; }, evEditor: function () { return evEd; } } };
  }
  PMPUeben.norm = normUeben;
  window.PMPUeben = PMPUeben;
})();
