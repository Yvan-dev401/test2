/* Page « Importer depuis la Chine » — paramètres modifiables et recalcul.
 *
 * Ce fichier est la source unique des chiffres de la page. Il tourne dans le
 * navigateur, et aussi sous node : les valeurs figées dans le HTML et les trois
 * schémas qui en dépendent sont produits par ce même code, de sorte que la page
 * sans JavaScript affiche exactement ce que le JavaScript recalculerait.
 *
 * Rien n'est importé : ni bibliothèque, ni requête réseau.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NB = ' ';           // espace fine insécable, séparateur de milliers
  var STORE = 'business-chine:params:v1';

  /* ───────────────────────── les 21 paramètres ───────────────────────── */

  var PARAMS = [
    // clé, libellé, valeur par défaut, unité, min, max, pas, groupe
    ['arUsd', 'Ariary pour 1 $', 4700, 'Ar', 500, 50000, 10, 'change'],
    ['arCny', 'Ariary pour 1 CNY', 680, 'Ar', 50, 10000, 5, 'change'],

    ['vBillet', 'Billet aller-retour', 5500000, 'Ar', 0, 50000000, 50000, 'voyage'],
    ['vHotel', 'Hébergement, 14 nuits', 1700000, 'Ar', 0, 50000000, 50000, 'voyage'],
    ['vInterprete', 'Interprète, 3 journées', 1050000, 'Ar', 0, 50000000, 50000, 'voyage'],
    ['vRepas', 'Repas, 14 jours', 700000, 'Ar', 0, 50000000, 50000, 'voyage'],
    ['vTransports', 'Transports sur place', 500000, 'Ar', 0, 50000000, 50000, 'voyage'],
    ['vVisa', 'Visa affaires + dossier', 450000, 'Ar', 0, 50000000, 10000, 'voyage'],
    ['vSim', 'Carte SIM, imprévus', 300000, 'Ar', 0, 50000000, 10000, 'voyage'],
    ['vAssurance', 'Assurance voyage', 250000, 'Ar', 0, 50000000, 10000, 'voyage'],
    ['vBanque', 'Frais bancaires et change', 250000, 'Ar', 0, 50000000, 10000, 'voyage'],

    ['tauxDroits', 'Droits de douane', 10, '%', 0, 100, 0.5, 'douane'],
    ['tauxTva', 'TVA à l’import', 20, '%', 0, 100, 0.5, 'douane'],
    ['fretExpress', 'Fret air express', 10, '$/kg', 0.1, 200, 0.5, 'douane'],
    ['fretCargo', 'Fret air cargo', 6, '$/kg', 0.1, 200, 0.5, 'douane'],
    ['transitaire', 'Transitaire, magasinage', 150000, 'Ar', 0, 20000000, 10000, 'douane'],

    ['qte', 'Quantité du lot', 30, 'unités', 1, 100000, 1, 'exemple'],
    ['prixUsineCny', 'Prix usine unitaire', 45, 'CNY', 0.1, 100000, 1, 'exemple'],
    ['poidsKg', 'Poids total du lot', 6, 'kg', 0.1, 50000, 0.5, 'exemple'],
    ['tauxAssurance', 'Assurance sur la marchandise', 2, '%', 0, 100, 0.5, 'exemple'],
    ['prixVente', 'Prix de vente unitaire', 85000, 'Ar', 0, 100000000, 1000, 'exemple']
  ];

  var GROUPES = [
    ['change', 'Taux de change', 'Sur un lot de plusieurs millions, quelques pour cent de variation effacent une bonne part de la marge.'],
    ['voyage', 'Le budget du voyage', 'Séjour type de 14 jours. Le total se recalcule, et avec lui les scénarios B, C et C′.'],
    ['douane', 'Fret et douane', 'Les valeurs que seuls la douane ou un transitaire peuvent te confirmer. Ce sont elles que cette page ne prétend pas connaître.'],
    ['exemple', 'L’exemple de prix de revient', 'Le lot qui sert à démontrer l’écart entre le prix usine et le prix de revient réel.']
  ];

  var DEFAULTS = {};
  var SPEC = {};
  PARAMS.forEach(function (p) {
    DEFAULTS[p[0]] = p[2];
    SPEC[p[0]] = { key: p[0], label: p[1], def: p[2], unit: p[3], min: p[4], max: p[5], step: p[6], groupe: p[7] };
  });

  /* Les quatre scénarios. Ce ne sont pas des paramètres : ce sont les hypothèses
     de volume de la page. Mais leurs droits, leur TVA et leur fret découlent
     bien des taux ci-dessus — sans quoi la page se contredirait dès la première
     modification. */
  var SCEN = [
    { k: 'A', titre: 'A — sourcing à distance, sans voyage', marchandise: 2800000, poids: 20, mode: 'express', transitaire: 300000, reserve: 300000, voyage: false, coef: 1.5, invendus: 10, sav: 5 },
    { k: 'B', titre: 'B — premier voyage, petit stock', marchandise: 6000000, poids: 45, mode: 'cargo', transitaire: 400000, reserve: 0, voyage: true, coef: 1.5, invendus: 10, sav: 5 },
    { k: 'C', titre: 'C — voyage + stock, produit à faible marge', marchandise: 18000000, poids: 140, mode: 'cargo', transitaire: 700000, reserve: 0, voyage: true, coef: 1.5, invendus: 15, sav: 5 },
    { k: 'Cp', titre: 'C′ — même voyage, produit à bonne marge', marchandise: 18000000, poids: 140, mode: 'cargo', transitaire: 700000, reserve: 0, voyage: true, coef: 2.2, invendus: 15, sav: 0 }
  ];

  var GROUPAGE_ACHETEURS = 5, GROUPAGE_KG = 20;
  var REP_FORFAIT = 1500000, REP_CLIENTS = 2;
  var ENG_COMMISSIONS = 2000000, ENG_PRECOMMANDES = 1500000;
  var JOURS = 14, JOURS_INTERPRETE = 3;

  /* ───────────────────────── mise en forme ───────────────────────── */

  function group(n) {
    var s = String(Math.abs(n)), out = '';
    for (var i = s.length; i > 0; i -= 3) out = s.slice(Math.max(0, i - 3), i) + (out ? NB + out : '');
    return (n < 0 ? '−' : '') + out;
  }
  function ar(n) { return group(Math.round(n)); }
  function arSigne(n) { n = Math.round(n); return (n > 0 ? '+' + NB : n < 0 ? '−' + NB : '') + group(Math.abs(n)); }
  function dec(n, d) {
    var s = Number(n).toFixed(d === undefined ? 1 : d).replace('.', ',');
    return s.replace(/,0$/, '');
  }
  function pct(n) { return dec(n, Math.abs(n - Math.round(n)) < 0.05 ? 0 : 1) + NB + '%'; }
  function coefTxt(n) { return '×' + NB + dec(n, 2).replace(/,(\d)0$/, ',$1'); }
  function mAr(n) {
    var v = n / 1e6, s = Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : dec(v, 1);
    return (n < 0 ? '−' : '') + s.replace('-', '') + NB + 'M';
  }
  function mArSigne(n) { return (n > 0 ? '+' + NB : '') + mAr(n); }
  function round(n, to) { return Math.round(n / to) * to; }

  /* ───────────────────────── le calcul ───────────────────────── */

  function compute(p) {
    var d = {}, i;
    for (i in p) d[i] = p[i];

    var fretAr = function (kg, mode) {
      return Math.round(kg * (mode === 'cargo' ? p.fretCargo : p.fretExpress) * p.arUsd);
    };

    /* — le voyage — */
    d.voyageTotal = p.vBillet + p.vHotel + p.vInterprete + p.vRepas + p.vTransports
      + p.vVisa + p.vSim + p.vAssurance + p.vBanque;
    d.nuitee = round(p.vHotel / JOURS, 1000);
    d.repasJour = round(p.vRepas / JOURS, 1000);
    d.interpreteJour = round(p.vInterprete / JOURS_INTERPRETE, 1000);
    d.billetPartPct = Math.round(100 * p.vBillet / d.voyageTotal);

    /* — l'exemple de prix de revient — */
    d.puAr = Math.round(p.prixUsineCny * p.arCny);
    d.pvFretUsd = p.poidsKg * p.fretExpress;
    d.pvMarchandise = Math.round(p.qte * d.puAr);
    d.pvFret = fretAr(p.poidsKg, 'express');
    d.pvAssurance = Math.round(d.pvMarchandise * p.tauxAssurance / 100);
    d.pvCaf = d.pvMarchandise + d.pvFret + d.pvAssurance;
    d.pvDroits = Math.round(d.pvCaf * p.tauxDroits / 100);
    d.pvTva = Math.round((d.pvCaf + d.pvDroits) * p.tauxTva / 100);
    d.pvTransitaire = p.transitaire;
    d.pvRevient = d.pvCaf + d.pvDroits + d.pvTva + d.pvTransitaire;

    d.pvRevientUnit = Math.round(d.pvRevient / p.qte);
    d.pvEcartPct = Math.round(100 * (d.pvRevientUnit / d.puAr - 1));
    d.pvMargeUnit = p.prixVente - d.pvRevientUnit;
    d.pvCoef = p.prixVente / d.pvRevientUnit;
    d.pvPartUsinePct = Math.round(100 * d.pvMarchandise / d.pvRevient);
    d.pvCoefUsine = p.prixVente / d.puAr;   // le coefficient illusoire, calculé sur le prix usine
    d.pvMargeBrute = d.pvMargeUnit * p.qte;
    var vendues = Math.round(p.qte * 0.9);
    var ca = vendues * p.prixVente;
    d.pvVendues = vendues;
    d.pvNet = Math.round(ca - ca * 0.05 - d.pvRevient);
    d.pvNetRond = round(d.pvNet, 10000);

    /* — le groupage de fret — */
    d.grKg = GROUPAGE_ACHETEURS * GROUPAGE_KG;
    d.grAcheteurs = GROUPAGE_ACHETEURS;
    d.grKgChacun = GROUPAGE_KG;
    d.grExpressUsd = d.grKg * p.fretExpress;
    d.grCargoUsd = d.grKg * p.fretCargo;
    d.grEcoUsd = d.grExpressUsd - d.grCargoUsd;
    d.grEcoAr = Math.round(d.grEcoUsd * p.arUsd);
    d.grPart = Math.round(d.grEcoAr / 2);

    /* — la représentation d'acheteurs — */
    d.repForfait = REP_FORFAIT;
    d.repClients = REP_CLIENTS;
    d.repTotal = REP_FORFAIT * REP_CLIENTS;
    d.repPctVoyage = Math.round(100 * d.repTotal / d.voyageTotal);

    /* — la règle des 60 % — */
    d.engCommissions = ENG_COMMISSIONS;
    d.engPrecommandes = ENG_PRECOMMANDES;
    d.engTotal = d.repTotal + ENG_COMMISSIONS + ENG_PRECOMMANDES;
    d.engPct = Math.round(100 * d.engTotal / d.voyageTotal);
    d.seuil60 = Math.round(d.voyageTotal * 0.6);

    /* — les quatre scénarios — */
    d.scen = {};
    SCEN.forEach(function (s) {
      var o = { titre: s.titre, coef: s.coef, invendus: s.invendus, sav: s.sav, poids: s.poids, mode: s.mode };
      o.marchandise = s.marchandise;
      o.fret = fretAr(s.poids, s.mode);
      o.assurance = Math.round(s.marchandise * p.tauxAssurance / 100);
      o.caf = o.marchandise + o.fret + o.assurance;
      o.droits = Math.round(o.caf * p.tauxDroits / 100);
      o.tva = Math.round((o.caf + o.droits) * p.tauxTva / 100);
      o.transitaire = s.transitaire;
      o.revient = o.caf + o.droits + o.tva + o.transitaire;
      o.reserve = s.reserve;
      o.voyage = s.voyage ? d.voyageTotal : 0;
      o.engage = o.revient + o.reserve + o.voyage;
      o.recettes = Math.round(o.revient * s.coef);
      o.apresInvendus = Math.round(o.recettes * (1 - s.invendus / 100));
      o.savAr = Math.round(o.apresInvendus * s.sav / 100);
      o.net = o.apresInvendus - o.savAr;
      o.marge = o.net - o.revient;
      o.resultat = o.marge - o.voyage;
      o.seuilPct = Math.round(100 * o.revient / o.recettes);
      o.cycles = o.marge > 0 ? Math.ceil(d.voyageTotal / o.marge) : null;
      d.scen[s.k] = o;
    });
    d.contrasteEcart = d.scen.Cp.resultat - d.scen.C.resultat;
    d.cyclesB = d.scen.B.cycles;
    d.moisBMin = d.cyclesB * 2;
    d.moisBMax = d.cyclesB * 3;

    return d;
  }

  /* ───────────── les valeurs affichées, par clé <span data-v> ───────────── */

  function values(p) {
    var d = compute(p), v = {}, s = d.scen;

    /* change et hypothèses */
    v.arUsd = ar(p.arUsd);
    v.arCny = ar(p.arCny);
    v.jours = String(JOURS);

    /* voyage */
    ['vBillet', 'vHotel', 'vInterprete', 'vRepas', 'vTransports', 'vVisa', 'vSim', 'vAssurance', 'vBanque']
      .forEach(function (k) { v[k] = ar(p[k]); });
    v.voyageTotal = ar(d.voyageTotal);
    v.voyageTotalM = mAr(d.voyageTotal);
    v.nuitee = ar(d.nuitee);
    v.repasJour = ar(d.repasJour);
    v.interpreteJour = ar(d.interpreteJour);
    v.billetPartPct = pct(d.billetPartPct);

    /* fret et douane */
    v.tauxDroits = pct(p.tauxDroits);
    v.tauxTva = pct(p.tauxTva);
    v.fretExpress = dec(p.fretExpress, 1);
    v.fretCargo = dec(p.fretCargo, 1);
    v.transitaire = ar(p.transitaire);
    v.tauxAssurance = pct(p.tauxAssurance);

    /* prix de revient */
    v.qte = String(p.qte);
    v.prixUsineCny = dec(p.prixUsineCny, 1);
    v.poidsKg = dec(p.poidsKg, 1);
    v.prixVente = ar(p.prixVente);
    v.puAr = ar(d.puAr);
    v.pvFretUsd = dec(d.pvFretUsd, 1);
    v.pvMarchandise = ar(d.pvMarchandise);
    v.pvFret = ar(d.pvFret);
    v.pvAssurance = ar(d.pvAssurance);
    v.pvCaf = ar(d.pvCaf);
    v.pvDroits = ar(d.pvDroits);
    v.pvTva = ar(d.pvTva);
    v.pvTransitaire = ar(d.pvTransitaire);
    v.pvRevient = ar(d.pvRevient);
    v.pvRevientUnit = ar(d.pvRevientUnit);
    v.pvEcartPct = '+' + NB + pct(d.pvEcartPct);
    v.pvMargeUnit = ar(d.pvMargeUnit);
    v.pvCoef = coefTxt(d.pvCoef);
    v.pvCoefNu = dec(d.pvCoef, 2);
    v.pvCoefUsine = coefTxt(d.pvCoefUsine);
    v.pvPartUsinePct = pct(d.pvPartUsinePct);
    v.pvMargeBrute = ar(d.pvMargeBrute);
    v.pvVendues = String(d.pvVendues);
    v.pvNetRond = ar(d.pvNetRond);

    /* groupage */
    v.grAcheteurs = String(d.grAcheteurs);
    v.grKgChacun = String(d.grKgChacun);
    v.grKg = String(d.grKg);
    v.grExpressUsd = ar(d.grExpressUsd);
    v.grCargoUsd = ar(d.grCargoUsd);
    v.grEcoUsd = ar(d.grEcoUsd);
    v.grEcoAr = ar(d.grEcoAr);
    v.grPart = ar(d.grPart);

    /* représentation et règle des 60 % */
    v.repForfait = ar(d.repForfait);
    v.repTotal = ar(d.repTotal);
    v.repPctVoyage = pct(d.repPctVoyage);
    v.engCommissions = ar(d.engCommissions);
    v.engPrecommandes = ar(d.engPrecommandes);
    v.engTotal = ar(d.engTotal);
    v.engPct = pct(d.engPct);

    /* scénarios */
    ['A', 'B', 'C', 'Cp'].forEach(function (k) {
      var o = s[k], px = 's' + k + '_';
      v[px + 'marchandise'] = ar(o.marchandise);
      v[px + 'poids'] = dec(o.poids, 0);
      v[px + 'fret'] = ar(o.fret);
      v[px + 'assurance'] = ar(o.assurance);
      v[px + 'fretAssurance'] = ar(o.fret + o.assurance);
      v[px + 'caf'] = ar(o.caf);
      v[px + 'droits'] = ar(o.droits);
      v[px + 'tva'] = ar(o.tva);
      v[px + 'droitsTva'] = ar(o.droits + o.tva);
      v[px + 'transitaire'] = ar(o.transitaire);
      v[px + 'revient'] = ar(o.revient);
      v[px + 'reserve'] = ar(o.reserve);
      v[px + 'voyage'] = ar(o.voyage);
      v[px + 'engage'] = ar(o.engage);
      v[px + 'engageM'] = mAr(o.engage);
      v[px + 'coef'] = coefTxt(o.coef);
      v[px + 'recettes'] = ar(o.recettes);
      v[px + 'invendus'] = pct(o.invendus);
      v[px + 'sav'] = pct(o.sav);
      v[px + 'apresInvendus'] = ar(o.apresInvendus);
      v[px + 'net'] = ar(o.net);
      v[px + 'marge'] = ar(o.marge);
      v[px + 'margeM'] = mAr(o.marge);
      v[px + 'voyageNeg'] = '−' + NB + ar(o.voyage);
      v[px + 'resultat'] = arSigne(o.resultat);
      v[px + 'resultatM'] = mArSigne(o.resultat);
      v[px + 'resultatAbs'] = ar(Math.abs(o.resultat));
      v[px + 'seuilPct'] = pct(o.seuilPct);
    });
    v.cyclesB = String(d.cyclesB);
    v.cyclesBMoins1 = String(d.cyclesB - 1);
    v.moisBMin = String(d.moisBMin);
    v.moisBMax = String(d.moisBMax);
    v.contrasteEcart = ar(Math.abs(d.contrasteEcart));
    v.contrasteEcartM = mAr(Math.abs(d.contrasteEcart));

    return { d: d, v: v };
  }

  /* ───────────────────────── les trois schémas ───────────────────────── */

  var P = ['#b45309', '#0f766e', '#4338ca', '#be123c', '#a16207',
    '#475569', '#0891b2', '#7c3aed', '#65a30d', '#7e22ce'];
  var INK = '#111827', MUT = '#6b7280', FAINT = '#9ca3af', OK = '#15803d', KO = '#b91c1c';

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function f1(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  function figTrip(p, d) {
    var rows = [
      ['Billet aller-retour', p.vBillet], ['Hébergement, ' + JOURS + ' nuits', p.vHotel],
      ['Interprète / guide d’achat', p.vInterprete], ['Repas, ' + JOURS + ' jours', p.vRepas],
      ['Transports sur place', p.vTransports], ['Visa affaires + dossier', p.vVisa],
      ['Carte SIM, imprévus', p.vSim], ['Assurance voyage', p.vAssurance],
      ['Frais bancaires et change', p.vBanque]
    ].sort(function (a, b) { return b[1] - a[1]; });
    var width = 460, top = 8, rowh = 26, gap = 8, labw = 148, barx = labw + 8;
    var barw = width - barx - 86, mx = Math.max.apply(null, rows.map(function (r) { return r[1]; })) || 1;
    var h = top + rows.length * (rowh + gap), o = ['<svg viewBox="0 0 ' + width + ' ' + h + '" role="img">'];
    rows.forEach(function (r, i) {
      var y = top + i * (rowh + gap), w = Math.max(2, barw * r[1] / mx), col = P[i % P.length];
      o.push('<text x="' + labw + '" y="' + (y + 17) + '" text-anchor="end" font-size="11.5" fill="' + INK + '">' + esc(r[0]) + '</text>');
      o.push('<rect x="' + barx + '" y="' + (y + 3) + '" width="' + barw + '" height="' + (rowh - 6) + '" rx="4" fill="#f3f4f6"/>');
      o.push('<rect x="' + barx + '" y="' + (y + 3) + '" width="' + f1(w) + '" height="' + (rowh - 6) + '" rx="4" fill="' + col + '"/>');
      o.push('<text x="' + (barx + barw + 8) + '" y="' + (y + 17) + '" font-size="11.5" font-weight="600" fill="' + INK + '">' + esc(ar(r[1]) + NB + 'Ar') + '</text>');
    });
    o.push('</svg>');
    return o.join('');
  }

  function figLanded(p, d) {
    var steps = [
      ['Prix usine', d.pvMarchandise, 'base'], ['Fret aérien', d.pvFret, 'add'],
      ['Assurance', d.pvAssurance, 'add'], ['Droits de douane', d.pvDroits, 'add'],
      ['TVA ' + dec(p.tauxTva, 1) + NB + '%', d.pvTva, 'add'],
      ['Transitaire, magasinage', d.pvTransitaire, 'add'], ['Prix de revient', 0, 'total']
    ];
    var width = 460, height = 300, l = 8, r = 8, t = 26, b = 58;
    var pw = width - l - r, ph = height - t - b, n = steps.length, slot = pw / n, bw = slot * 0.6;
    var total = 0;
    steps.forEach(function (s) { if (s[2] !== 'total') total += s[1]; });
    var ymax = total * 1.12 || 1, H = function (v) { return ph * v / ymax; };
    var o = ['<svg viewBox="0 0 ' + width + ' ' + height + '" role="img">'], acc = 0;
    steps.forEach(function (s, i) {
      var cx = l + slot * i + slot / 2, x = cx - bw / 2, y, hh;
      if (s[2] === 'total') {
        hh = H(total); y = t + ph - hh;
        o.push('<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(bw) + '" height="' + f1(hh) + '" rx="3" fill="' + INK + '"/>');
        o.push('<text x="' + f1(cx) + '" y="' + f1(y - 6) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + INK + '">' + ar(total) + '</text>');
      } else {
        hh = H(s[1]); y = t + ph - H(acc + s[1]);
        o.push('<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(bw) + '" height="' + f1(Math.max(hh, 2)) + '" rx="3" fill="' + (s[2] === 'base' ? P[0] : P[i % P.length]) + '"/>');
        o.push('<text x="' + f1(cx) + '" y="' + f1(y - 5) + '" text-anchor="middle" font-size="9.5" font-weight="600" fill="' + INK + '">' + (s[2] === 'add' ? '+' : '') + ar(s[1]) + '</text>');
        if (i + 1 < n && steps[i + 1][2] !== 'total') {
          var nx = l + slot * (i + 1) + slot / 2 - bw / 2;
          o.push('<line x1="' + f1(x + bw) + '" y1="' + f1(y) + '" x2="' + f1(nx) + '" y2="' + f1(y) + '" stroke="' + FAINT + '" stroke-width="1" stroke-dasharray="3 3"/>');
        }
        acc += s[1];
      }
      var words = s[0].split(' '), l1 = [], l2 = [];
      words.forEach(function (w) { (l1.concat([w]).join(' ').length <= 13 ? l1 : l2).push(w); });
      o.push('<text x="' + f1(cx) + '" y="' + (t + ph + 14) + '" text-anchor="middle" font-size="9" fill="' + MUT + '">' + esc(l1.join(' ')) + '</text>');
      if (l2.length) o.push('<text x="' + f1(cx) + '" y="' + (t + ph + 25) + '" text-anchor="middle" font-size="9" fill="' + MUT + '">' + esc(l2.join(' ')) + '</text>');
    });
    o.push('<line x1="' + l + '" y1="' + (t + ph) + '" x2="' + (width - r) + '" y2="' + (t + ph) + '" stroke="' + INK + '" stroke-width="1.5"/>');
    o.push('</svg>');
    return o.join('');
  }

  function figScen(p, d) {
    var rows = ['A', 'B', 'C', 'Cp'].map(function (k) {
      return [d.scen[k].titre, d.scen[k].engage, d.scen[k].net];
    });
    var width = 460, rowh = 44, gap = 16, top = 22, l = 8, barw = width - 2 * l - 100;
    var mx = 0;
    rows.forEach(function (r) { mx = Math.max(mx, r[1], r[2]); });
    mx = mx || 1;
    var height = top + rows.length * (rowh + gap) + 24, o = ['<svg viewBox="0 0 ' + width + ' ' + height + '" role="img">'];
    rows.forEach(function (r, i) {
      var y = top + i * (rowh + gap), we = barw * r[1] / mx, wr = barw * r[2] / mx;
      var col = r[2] >= r[1] ? OK : KO;
      o.push('<text x="' + l + '" y="' + (y - 5) + '" font-size="11" font-weight="700" fill="' + INK + '">' + esc(r[0]) + '</text>');
      o.push('<rect x="' + l + '" y="' + (y + 2) + '" width="' + f1(we) + '" height="15" rx="3" fill="' + MUT + '"/>');
      o.push('<text x="' + f1(l + we + 6) + '" y="' + (y + 14) + '" font-size="10" font-weight="600" fill="' + MUT + '">' + ar(r[1]) + '</text>');
      o.push('<rect x="' + l + '" y="' + (y + 21) + '" width="' + f1(wr) + '" height="15" rx="3" fill="' + col + '"/>');
      o.push('<text x="' + f1(l + wr + 6) + '" y="' + (y + 33) + '" font-size="10" font-weight="600" fill="' + col + '">' + ar(r[2]) + '</text>');
    });
    o.push('<rect x="' + l + '" y="' + (height - 16) + '" width="11" height="11" rx="2" fill="' + MUT + '"/>'
      + '<text x="' + (l + 16) + '" y="' + (height - 7) + '" font-size="10" fill="' + MUT + '">capital engagé</text>'
      + '<rect x="' + (l + 112) + '" y="' + (height - 16) + '" width="11" height="11" rx="2" fill="' + OK + '"/>'
      + '<text x="' + (l + 128) + '" y="' + (height - 7) + '" font-size="10" fill="' + MUT + '">recettes, invendus et SAV déduits</text>');
    o.push('</svg>');
    return o.join('');
  }

  function figures(p) {
    var d = compute(p);
    return { trip: figTrip(p, d), landed: figLanded(p, d), scen: figScen(p, d) };
  }

  /* ───────────────────────── côté navigateur ───────────────────────── */

  function clamp(spec, raw) {
    var n = parseFloat(String(raw).replace(',', '.').replace(/[^\d.\-]/g, ''));
    if (!isFinite(n)) return null;
    return Math.min(spec.max, Math.max(spec.min, n));
  }

  function load() {
    var p = {}, k;
    for (k in DEFAULTS) p[k] = DEFAULTS[k];
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var saved = JSON.parse(raw);
        for (k in DEFAULTS) {
          if (typeof saved[k] === 'number' && isFinite(saved[k])) {
            p[k] = Math.min(SPEC[k].max, Math.max(SPEC[k].min, saved[k]));
          }
        }
      }
    } catch (e) { /* stockage indisponible : on garde les valeurs par défaut */ }
    return p;
  }

  function save(p) {
    try {
      var diff = {}, n = 0, k;
      for (k in DEFAULTS) if (p[k] !== DEFAULTS[k]) { diff[k] = p[k]; n++; }
      if (n) localStorage.setItem(STORE, JSON.stringify(diff));
      else localStorage.removeItem(STORE);
    } catch (e) { /* rien à faire : la page reste juste, elle n'est pas mémorisée */ }
  }

  function modifies(p) {
    var n = 0, k;
    for (k in DEFAULTS) if (p[k] !== DEFAULTS[k]) n++;
    return n;
  }

  function init() {
    var host = document.getElementById('params');
    if (!host) return;
    var p = load();

    /* — le panneau — */
    var html = '<button type="button" class="params-toggle" id="params-toggle" aria-expanded="false" aria-controls="params-body">'
      + '<span class="params-title">Tes chiffres</span>'
      + '<span class="params-sub" id="params-count"></span>'
      + '<span class="params-chevron" aria-hidden="true">▾</span></button>'
      + '<div class="params-body" id="params-body"><div class="params-inner">'
      + '<p class="params-intro">Les valeurs que cette page ne peut pas connaître à ta place. '
      + 'Mets-y le chiffre exact dès que la douane, un transitaire ou l’ambassade te l’aura donné : '
      + '<strong>toute la page se recalcule</strong>, schémas compris.</p>';
    GROUPES.forEach(function (g) {
      html += '<fieldset class="params-grp"><legend>' + esc(g[1]) + '</legend>'
        + '<p class="params-note">' + esc(g[2]) + '</p><div class="params-fields">';
      PARAMS.filter(function (x) { return x[7] === g[0]; }).forEach(function (x) {
        var s = SPEC[x[0]];
        html += '<label class="params-f"><span class="pf-l">' + esc(s.label) + '</span>'
          + '<span class="pf-i"><input type="number" id="pf-' + s.key + '" data-p="' + s.key + '" '
          + 'inputmode="decimal" step="' + s.step + '" min="' + s.min + '" max="' + s.max + '" '
          + 'value="' + p[s.key] + '"><em>' + esc(s.unit) + '</em></span></label>';
      });
      html += '</div></fieldset>';
    });
    html += '<div class="params-actions">'
      + '<button type="button" class="params-reset" id="params-reset">Réinitialiser les valeurs</button>'
      + '</div></div></div>'
      + '<table class="params-print"><caption>Hypothèses retenues</caption><tbody id="params-print-body"></tbody></table>';
    host.innerHTML = html;

    var toggle = document.getElementById('params-toggle');
    var body = document.getElementById('params-body');
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      body.classList.toggle('open', !open);
    });

    function apply() {
      var out = values(p), v = out.v;
      var missing = [];
      Array.prototype.forEach.call(document.querySelectorAll('[data-v]'), function (el) {
        var k = el.getAttribute('data-v');
        if (v[k] === undefined) { missing.push(k); return; }
        el.textContent = v[k];
      });
      if (missing.length && window.console) console.warn('data-v sans valeur : ' + missing.join(', '));

      var f = figures(p);
      var m = { trip: f.trip, landed: f.landed, scen: f.scen };
      Array.prototype.forEach.call(document.querySelectorAll('[data-fig]'), function (el) {
        var k = el.getAttribute('data-fig');
        if (m[k]) el.innerHTML = m[k];
      });

      var n = modifies(p);
      document.getElementById('params-count').textContent = n
        ? n + (n > 1 ? ' valeurs modifiées' : ' valeur modifiée')
        : PARAMS.length + ' valeurs, toutes modifiables';
      host.classList.toggle('params-custom', n > 0);

      var rows = '';
      PARAMS.forEach(function (x) {
        var s = SPEC[x[0]], val = p[s.key];
        var txt = (s.unit === 'Ar' ? ar(val) : dec(val, 2).replace(/,00$/, '')) + NB + s.unit;
        rows += '<tr' + (val !== s.def ? ' class="pp-mod"' : '') + '><th>' + esc(s.label) + '</th>'
          + '<td>' + esc(txt) + '</td>'
          + '<td>' + (val !== s.def ? 'saisie — défaut ' + esc(s.unit === 'Ar' ? ar(s.def) : dec(s.def, 2).replace(/,00$/, '')) : '') + '</td></tr>';
      });
      document.getElementById('params-print-body').innerHTML = rows;
      save(p);
    }

    Array.prototype.forEach.call(host.querySelectorAll('input[data-p]'), function (input) {
      function commit() {
        var k = input.getAttribute('data-p');
        var n = clamp(SPEC[k], input.value);
        if (n === null) n = p[k];           // saisie illisible : on garde l'ancienne
        p[k] = n;
        if (String(n) !== input.value) input.value = n;
        apply();
      }
      input.addEventListener('change', commit);
      input.addEventListener('blur', commit);
      input.addEventListener('input', function () {
        var k = input.getAttribute('data-p');
        var n = clamp(SPEC[k], input.value);
        if (n !== null && String(n) === input.value.replace(',', '.')) { p[k] = n; apply(); }
      });
    });

    document.getElementById('params-reset').addEventListener('click', function () {
      for (var k in DEFAULTS) p[k] = DEFAULTS[k];
      Array.prototype.forEach.call(host.querySelectorAll('input[data-p]'), function (i) {
        i.value = p[i.getAttribute('data-p')];
      });
      try { localStorage.removeItem(STORE); } catch (e) { }
      apply();
    });

    apply();

    /* si des valeurs ont déjà été saisies, le panneau s'ouvre : on doit voir
       tout de suite sur quoi la page est en train de calculer */
    if (modifies(p)) {
      toggle.setAttribute('aria-expanded', 'true');
      body.classList.add('open');
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return {
    PARAMS: PARAMS, SPEC: SPEC, DEFAULTS: DEFAULTS, GROUPES: GROUPES, STORE: STORE,
    compute: compute, values: values, figures: figures, init: init,
    fmt: { ar: ar, pct: pct, mAr: mAr, coef: coefTxt, dec: dec, NB: NB }
  };
});
