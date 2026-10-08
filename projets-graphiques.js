/* Mes projets — les schémas, en SVG écrit à la main.
 *
 * Comme sur le reste du site : pas de bibliothèque, rien à télécharger, net à l'impression.
 * Chaque fonction reçoit des chiffres déjà calculés par projets-modele.js et rend une chaîne
 * SVG. Les schémas larges reçoivent aussi la largeur réelle de leur cadre, en pixels : ils
 * sont dessinés à l'échelle 1, de sorte qu'un texte de 10 px fait 10 px sur un téléphone
 * comme sur un écran large — au lieu d'être dessinés pour 560 px puis réduits de moitié. Tout texte venant de l'utilisateur passe par esc() : un nom de projet importé d'une
 * sauvegarde ne doit jamais pouvoir s'injecter dans la page.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Graphiques = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INK = '#111827', MUT = '#6b7280', LINE = '#e5e7eb', PAPER = '#f9fafb';
  var ACC = '#4338ca', OK = '#15803d', KO = '#b91c1c', WARN = '#b45309';
  var PAL = ['#4338ca', '#0f766e', '#b45309', '#be123c', '#15803d', '#7c3aed', '#0891b2', '#475569', '#a16207', '#9d174d'];
  var NB = ' ';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function court(n) {
    var a = Math.abs(n), s = n < 0 ? '−' : '';
    var f = function (v) { return (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',')); };
    if (a >= 1e9) return s + f(a / 1e9) + ' Md';
    if (a >= 1e6) return s + f(a / 1e6) + ' M';
    if (a >= 1e3) return s + f(a / 1e3) + ' k';
    return s + String(Math.round(a));
  }

  function largeur(w, defaut) {
    return Math.round(Math.max(260, Math.min(1000, w || defaut)));
  }

  function tronque(t, n) {
    t = String(t || '');
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  function vide(w, h, texte) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(texte) + '">' +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="10" fill="' + PAPER + '"/>' +
      '<text x="' + (w / 2) + '" y="' + (h / 2 + 4) + '" text-anchor="middle" font-size="12" fill="' + MUT + '">' +
      esc(texte) + '</text></svg>';
  }

  /** La trésorerie cumulée, mois par mois, avec la ligne de ce que tu peux encaisser.
   *
   *  Cette ligne n'est pas le budget brut : c'est le budget MOINS la provision pour risques,
   *  l'argent qu'il faut garder de côté. Sinon le schéma contredirait l'alerte — la courbe
   *  resterait au-dessus du budget alors que le projet manque d'argent une fois la provision
   *  mise à part. Passer sous la ligne veut donc dire exactement ce que dit l'alerte. */
  function tresorerie(a, budget, wDispo) {
    var w = largeur(wDispo, 560), h = w < 420 ? 230 : 260, l = 50, r = 12, t = 18, b = 34;
    var pw = w - l - r, ph = h - t - b;
    var pts = a.mois.map(function (x) { return x.cumul; });
    if (!pts.length) return vide(w, h, 'Aucune donnée');
    var disponible = Math.max(0, (budget || 0) - (a.provision || 0));
    var plancher = -disponible;
    var ymin = Math.min.apply(null, pts.concat([0, plancher]));
    var ymax = Math.max.apply(null, pts.concat([0]));
    if (ymax === ymin) { ymax += 1; ymin -= 1; }
    var pad = (ymax - ymin) * 0.08;
    ymin -= pad; ymax += pad;
    var X = function (m) { return l + pw * (m - 1) / Math.max(1, a.h - 1); };
    var Y = function (v) { return t + ph * (ymax - v) / (ymax - ymin); };

    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Trésorerie cumulée mois par mois">'];
    /* graduations */
    for (var k = 0; k <= 4; k++) {
      var v = ymin + (ymax - ymin) * k / 4, y = Y(v);
      out.push('<line x1="' + l + '" y1="' + y.toFixed(1) + '" x2="' + (l + pw) + '" y2="' + y.toFixed(1) +
        '" stroke="' + LINE + '" stroke-dasharray="2 4"/>');
      out.push('<text x="' + (l - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="' + MUT + '">' +
        court(v) + '</text>');
    }
    /* zéro */
    out.push('<line x1="' + l + '" y1="' + Y(0).toFixed(1) + '" x2="' + (l + pw) + '" y2="' + Y(0).toFixed(1) +
      '" stroke="' + INK + '" stroke-width="1"/>');
    /* le budget : la profondeur maximale que tu peux encaisser */
    if (budget > 0) {
      var etiquette = !a.provision ? 'ton budget : − ' + court(budget)
        : (disponible > 0 ? 'budget − provision : − ' + court(disponible) : 'la provision absorbe tout le budget');
      out.push('<line x1="' + l + '" y1="' + Y(plancher).toFixed(1) + '" x2="' + (l + pw) + '" y2="' + Y(plancher).toFixed(1) +
        '" stroke="' + WARN + '" stroke-width="1.5" stroke-dasharray="6 4"/>');
      out.push('<text x="' + (l + pw - 4) + '" y="' + (Y(plancher) - 5).toFixed(1) + '" text-anchor="end" font-size="10" ' +
        'font-weight="600" fill="' + WARN + '">' + esc(etiquette) + '</text>');
    }
    /* aire sous la courbe, rouge sous zéro, verte au-dessus */
    var chemin = pts.map(function (v, i) { return (i ? 'L' : 'M') + X(i + 1).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' ');
    var aire = chemin + ' L' + X(pts.length).toFixed(1) + ' ' + Y(0).toFixed(1) + ' L' + X(1).toFixed(1) + ' ' + Y(0).toFixed(1) + ' Z';
    out.push('<defs><clipPath id="g-haut"><rect x="' + l + '" y="' + t + '" width="' + pw + '" height="' + (Y(0) - t).toFixed(1) + '"/></clipPath>' +
      '<clipPath id="g-bas"><rect x="' + l + '" y="' + Y(0).toFixed(1) + '" width="' + pw + '" height="' + (t + ph - Y(0)).toFixed(1) + '"/></clipPath></defs>');
    out.push('<path d="' + aire + '" fill="' + OK + '" opacity="0.14" clip-path="url(#g-haut)"/>');
    out.push('<path d="' + aire + '" fill="' + KO + '" opacity="0.12" clip-path="url(#g-bas)"/>');
    out.push('<path d="' + chemin + '" fill="none" stroke="' + ACC + '" stroke-width="2.2" stroke-linejoin="round"/>');
    /* le creux */
    if (a.besoin > 0 && a.moisCreux) {
      var cx = X(a.moisCreux), cy = Y(-a.besoin);
      out.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="4.5" fill="' + KO + '"/>');
      var anc = cx > l + pw * 0.7 ? 'end' : 'start';
      out.push('<text x="' + (cx + (anc === 'end' ? -8 : 8)).toFixed(1) + '" y="' + (cy + 14).toFixed(1) + '" text-anchor="' + anc +
        '" font-size="10" font-weight="700" fill="' + KO + '">besoin : ' + court(a.besoin) + ' (mois ' + a.moisCreux + ')</text>');
    }
    /* le retour */
    if (a.retour.etat === 'mois' && a.retour.mois <= a.h) {
      var rx = X(a.retour.mois);
      out.push('<line x1="' + rx.toFixed(1) + '" y1="' + t + '" x2="' + rx.toFixed(1) + '" y2="' + (t + ph) + '" stroke="' + OK +
        '" stroke-width="1.2" stroke-dasharray="3 3"/>');
      out.push('<text x="' + (rx + 4).toFixed(1) + '" y="' + (t + 10) + '" font-size="10" font-weight="700" fill="' + OK + '">' +
        'mise récupérée · mois ' + a.retour.mois + '</text>');
    }
    /* axe des mois */
    (w < 420 ? [1, 12, 24, 36] : [1, 6, 12, 18, 24, 30, 36]).forEach(function (m) {
      if (m > a.h) return;
      out.push('<text x="' + X(m).toFixed(1) + '" y="' + (h - 12) + '" text-anchor="middle" font-size="9.5" fill="' + MUT + '">' +
        (m === 1 ? 'mois 1' : m) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  /** Anneau de répartition : [{libelle, valeur}]. */
  function anneau(rows, titre) {
    var total = 0;
    rows.forEach(function (x) { total += x.valeur; });
    if (!total) return vide(320, 160, 'Rien à répartir pour l’instant');
    var w = 320, h = 160, cx = 78, cy = 80, rr = 56, sw = 22, C = 2 * Math.PI * rr;
    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(titre) + '">'];
    out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="none" stroke="' + LINE + '" stroke-width="' + sw + '"/>');
    var acc = 0;
    rows.forEach(function (x, i) {
      var ln = C * x.valeur / total;
      out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="none" stroke="' + PAL[i % PAL.length] +
        '" stroke-width="' + sw + '" stroke-dasharray="' + ln.toFixed(2) + ' ' + (C - ln).toFixed(2) +
        '" stroke-dashoffset="' + (-C * acc).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>');
      acc += x.valeur / total;
    });
    out.push('<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="12" font-weight="700" fill="' + INK + '">' +
      court(total) + '</text>');
    rows.slice(0, 7).forEach(function (x, i) {
      var y = 18 + i * 19;
      out.push('<rect x="170" y="' + (y - 9) + '" width="10" height="10" rx="2" fill="' + PAL[i % PAL.length] + '"/>');
      out.push('<text x="186" y="' + y + '" font-size="10.5" fill="' + INK + '">' + esc(tronque(x.libelle, 18)) + '</text>');
      out.push('<text x="' + (w - 4) + '" y="' + y + '" text-anchor="end" font-size="10.5" font-weight="700" fill="' + INK + '">' +
        Math.round(x.valeur / total * 100) + ' %</text>');
    });
    if (rows.length > 7) {
      out.push('<text x="186" y="' + (18 + 7 * 19) + '" font-size="10" fill="' + MUT + '">+ ' + (rows.length - 7) + ' autres</text>');
    }
    out.push('</svg>');
    return out.join('');
  }

  /** Barres horizontales : [{libelle, valeur, couleur?}]. */
  function barres(rows, titre, wDispo) {
    var w = largeur(wDispo, 560);
    if (!rows.length) return vide(w, 80, 'Rien à afficher pour l’instant');
    var labw = Math.min(170, Math.round(w * 0.36)), barx = labw + 10, barw = w - barx - 56;
    var lettres = Math.floor(labw / 6.2);
    var top = 6, rowh = 24, gap = 6, h = top + rows.length * (rowh + gap);
    var mx = Math.max.apply(null, rows.map(function (x) { return x.valeur; })) || 1;
    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(titre) + '">'];
    rows.forEach(function (x, i) {
      var y = top + i * (rowh + gap), bw = Math.max(2, barw * x.valeur / mx);
      out.push('<text x="0" y="' + (y + 16) + '" font-size="10.5" fill="' + INK + '">' + esc(tronque(x.libelle, lettres)) + '</text>');
      out.push('<rect x="' + barx + '" y="' + (y + 4) + '" width="' + bw.toFixed(1) + '" height="' + (rowh - 8) +
        '" rx="3" fill="' + (x.couleur || PAL[i % PAL.length]) + '"/>');
      out.push('<text x="' + (barx + bw + 6).toFixed(1) + '" y="' + (y + 16) + '" font-size="10" font-weight="700" fill="' + INK + '">' +
        court(x.valeur) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  var COULEUR_NIVEAU = { faible: '#dcfce7', moyen: '#fef3c7', eleve: '#fed7aa', critique: '#fecaca' };

  /** La carte des risques : probabilité en abscisse, impact en ordonnée, 5 × 5. */
  function carteRisques(items, titre) {
    var w = 360, h = 300, l = 44, t = 12, cell = 52;
    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(titre || 'Carte des risques') + '">'];
    var grille = {};
    items.forEach(function (r) {
      var k = r.probabilite + '-' + r.impact;
      (grille[k] = grille[k] || []).push(r);
    });
    for (var p = 1; p <= 5; p++) {
      for (var i = 1; i <= 5; i++) {
        var score = p * i;
        var niveau = score >= 15 ? 'critique' : score >= 8 ? 'eleve' : score >= 4 ? 'moyen' : 'faible';
        var x = l + (p - 1) * cell, y = t + (5 - i) * cell;
        out.push('<rect x="' + x + '" y="' + y + '" width="' + (cell - 3) + '" height="' + (cell - 3) + '" rx="6" fill="' +
          COULEUR_NIVEAU[niveau] + '"/>');
        var ici = grille[p + '-' + i];
        if (ici) {
          out.push('<circle cx="' + (x + (cell - 3) / 2) + '" cy="' + (y + (cell - 3) / 2) + '" r="13" fill="' + INK + '"/>');
          out.push('<text x="' + (x + (cell - 3) / 2) + '" y="' + (y + (cell - 3) / 2 + 4) + '" text-anchor="middle" font-size="11.5" ' +
            'font-weight="700" fill="white">' + ici.length + '</text>');
        }
      }
    }
    for (var n = 1; n <= 5; n++) {
      out.push('<text x="' + (l + (n - 1) * cell + (cell - 3) / 2) + '" y="' + (t + 5 * cell + 12) + '" text-anchor="middle" ' +
        'font-size="10" fill="' + MUT + '">' + n + '</text>');
      out.push('<text x="' + (l - 8) + '" y="' + (t + (5 - n) * cell + (cell - 3) / 2 + 4) + '" text-anchor="end" font-size="10" fill="' +
        MUT + '">' + n + '</text>');
    }
    out.push('<text x="' + (l + 2.5 * cell) + '" y="' + (h - 4) + '" text-anchor="middle" font-size="10.5" fill="' + MUT + '">Probabilité →</text>');
    out.push('<text transform="translate(12,' + (t + 2.5 * cell) + ') rotate(-90)" text-anchor="middle" font-size="10.5" fill="' +
      MUT + '">Impact →</text>');
    out.push('</svg>');
    return out.join('');
  }

  /** La frise du portefeuille : quand chaque projet récupère sa mise. */
  function frise(projets, wDispo) {
    var w = largeur(wDispo, 560);
    if (!projets.length) return vide(w, 80, 'Aucun projet actif');
    var labw = Math.min(150, Math.round(w * 0.32)), barx = labw + 10, barw = w - barx - 70;
    var lettres = Math.floor(labw / 6.2);
    var top = 22, rowh = 26, gap = 6, h = top + projets.length * (rowh + gap) + 18;
    var MAX = 60;   // l'échelle s'arrête à cinq ans : au-delà, le détail n'a plus de sens
    var X = function (m) { return barx + barw * Math.min(m, MAX) / MAX; };
    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Quand chaque projet récupère sa mise">'];
    [0, 12, 24, 36, 48, 60].forEach(function (m) {
      out.push('<line x1="' + X(m).toFixed(1) + '" y1="' + (top - 6) + '" x2="' + X(m).toFixed(1) + '" y2="' + (h - 18) +
        '" stroke="' + LINE + '"/>');
      /* sur un écran étroit, une graduation sur deux : sinon les étiquettes se chevauchent */
      if (w < 420 && m % 24 !== 0) return;
      out.push('<text x="' + X(m).toFixed(1) + '" y="12" text-anchor="middle" font-size="9.5" fill="' + MUT + '">' +
        (m === 0 ? 'départ' : (m / 12) + ' an' + (m > 12 ? 's' : '')) + '</text>');
    });
    projets.forEach(function (p, i) {
      var y = top + i * (rowh + gap), r = p.analyse.retour;
      out.push('<text x="0" y="' + (y + 17) + '" font-size="10.5" fill="' + INK + '">' + esc(tronque(p.nom, lettres)) + '</text>');
      var fin, couleur, etiquette;
      if (r.etat === 'immediat') { fin = 0.6; couleur = OK; etiquette = 'immédiat'; }
      else if (r.etat === 'jamais') { fin = MAX; couleur = KO; etiquette = 'jamais'; }
      else if (r.etat === 'au-dela') { fin = MAX; couleur = WARN; etiquette = '> 10 ans'; }
      else { fin = r.mois; couleur = r.mois <= 24 ? OK : r.mois <= 48 ? ACC : WARN; etiquette = 'mois ' + r.mois; }
      var bw = Math.max(3, X(fin) - barx);
      out.push('<rect x="' + barx + '" y="' + (y + 5) + '" width="' + bw.toFixed(1) + '" height="' + (rowh - 10) + '" rx="3" fill="' +
        couleur + '"' + (r.etat === 'jamais' ? ' opacity="0.35"' : '') + '/>');
      out.push('<text x="' + (barx + bw + 6).toFixed(1) + '" y="' + (y + 17) + '" font-size="10" font-weight="700" fill="' + couleur + '">' +
        esc(etiquette) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  /** Les flux du mois : entrées au-dessus de l'axe, sorties en dessous. */
  function flux(a, wDispo) {
    var w = largeur(wDispo, 560), h = 220, l = 46, r = 8, t = 12, b = 26;
    var pw = w - l - r, ph = h - t - b, n = a.mois.length;
    if (!n) return vide(w, h, 'Aucune donnée');
    var mx = 1;
    a.mois.forEach(function (x) {
      mx = Math.max(mx, x.revenus, x.obligatoires + x.autres + x.investissement);
    });
    var Y0 = t + ph / 2, k = (ph / 2) / mx, slot = pw / n, bw = Math.max(2, slot * 0.66);
    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Entrées et sorties de chaque mois">'];
    out.push('<line x1="' + l + '" y1="' + Y0 + '" x2="' + (l + pw) + '" y2="' + Y0 + '" stroke="' + INK + '"/>');
    out.push('<text x="' + (l - 6) + '" y="' + (t + 8) + '" text-anchor="end" font-size="9.5" fill="' + MUT + '">+' + court(mx) + '</text>');
    out.push('<text x="' + (l - 6) + '" y="' + (t + ph) + '" text-anchor="end" font-size="9.5" fill="' + MUT + '">−' + court(mx) + '</text>');
    a.mois.forEach(function (x, i) {
      var cx = l + i * slot + (slot - bw) / 2;
      if (x.revenus) out.push('<rect x="' + cx.toFixed(1) + '" y="' + (Y0 - x.revenus * k).toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + (x.revenus * k).toFixed(1) + '" fill="' + OK + '"/>');
      var y = Y0;
      [[x.obligatoires, KO], [x.autres, WARN], [x.investissement, ACC]].forEach(function (s) {
        if (!s[0]) return;
        out.push('<rect x="' + cx.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (s[0] * k).toFixed(1) +
          '" fill="' + s[1] + '"/>');
        y += s[0] * k;
      });
    });
    (w < 420 ? [1, 12, 24, 36] : [1, 6, 12, 18, 24, 30, 36]).forEach(function (m) {
      if (m > n) return;
      out.push('<text x="' + (l + (m - 0.5) * slot).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="9.5" fill="' +
        MUT + '">' + m + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  return { tresorerie: tresorerie, anneau: anneau, barres: barres, carteRisques: carteRisques,
    frise: frise, flux: flux, esc: esc, COULEUR_NIVEAU: COULEUR_NIVEAU };
});
