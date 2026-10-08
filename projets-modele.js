/* Mes projets — les données et tous les calculs, sans interface.
 *
 * Ce fichier ne touche ni au DOM ni au stockage : il reçoit des projets, il rend des
 * chiffres. Il tourne donc aussi sous node, et c'est là qu'il est testé, sur des projets
 * construits pour avoir des réponses connues à l'avance.
 *
 * La logique du point mort reprend celle des pages business (business-produire-local.js) :
 * au-delà de l'horizon on prolonge au rythme de croisière plutôt que de répondre « jamais »,
 * et l'on distingue l'affaire qui rembourse en plus de dix ans de celle qui ne rembourse pas.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Modele = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;
  var HORIZON = 36;          // mois calculés en détail
  var PLAFOND_MOIS = 120;    // au-delà de dix ans, on cesse de chercher le point mort
  var NB = ' ';         // espace fine insécable, comme sur le reste du site

  var STATUTS = [
    ['idee', 'Idée'],
    ['preparation', 'Préparation'],
    ['en-cours', 'En cours'],
    ['rentable', 'Rentable'],
    ['abandonne', 'Abandonné']
  ];

  var CAT_INVEST = ['Équipement', 'Aménagement', 'Stock de départ', 'Véhicule',
    'Démarches et statut', 'Fonds de roulement', 'Réserve', 'Autre'];
  var CAT_DEPENSE = ['Salaires', 'Loyer', 'Énergie', 'Transport', 'Matières',
    'Marketing', 'Abonnements', 'Entretien', 'Impôts et taxes', 'Remboursement', 'Autre'];

  /* ───────────────────────── utilitaires ───────────────────────── */

  function uid() {
    var a = new Uint8Array(9), i, s = '';
    var c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
    if (c) c.getRandomValues(a);
    else for (i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    for (i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return s;
  }

  function nombre(v, min, max, defaut) {
    var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.\-]/g, ''));
    if (!isFinite(n)) n = defaut;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return n;
  }

  function entier(v, min, max, defaut) {
    return Math.round(nombre(v, min, max, defaut));
  }

  function texte(v, max) {
    return String(v == null ? '' : v).slice(0, max || 500);
  }

  function un(v, liste, defaut) {
    return liste.indexOf(v) >= 0 ? v : defaut;
  }

  function ar(n) {
    var s = String(Math.round(Math.abs(n))), out = '', i;
    for (i = 0; i < s.length; i++) {
      if (i && (s.length - i) % 3 === 0) out += NB;
      out += s.charAt(i);
    }
    return (n < 0 ? '− ' : '') + out;
  }

  function dec(n, d) {
    return n.toFixed(d === undefined ? 1 : d).replace('.', ',');
  }

  function mAr(n) {
    var v = n / 1000000;
    var court = function (x) {
      return Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : dec(x, 1);
    };
    if (Math.abs(v) >= 1000) return (n < 0 ? '− ' : '') + court(Math.abs(v) / 1000) + ' Md';
    if (Math.abs(v) >= 1) return (n < 0 ? '− ' : '') + court(Math.abs(v)) + ' M';
    return ar(n);
  }

  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  /** Le mois n (1 = premier mois du projet) en clair : « mars 2027 ». */
  function moisLabel(dateDebut, n) {
    var m = /^(\d{4})-(\d{2})$/.exec(dateDebut || '');
    if (!m) return 'mois ' + n;
    var t = Number(m[1]) * 12 + Number(m[2]) - 1 + (n - 1);
    return MOIS[t % 12] + ' ' + Math.floor(t / 12);
  }

  /* ───────────────────────── les données ───────────────────────── */

  function moisCourant() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  function nouveauProjet(nom) {
    var t = new Date().toISOString();
    return normaliser({
      id: uid(), nom: nom || 'Nouveau projet', statut: 'idee',
      dateDebut: moisCourant(), creeLe: t, modifieLe: t
    });
  }

  function nouvelleBase() {
    return { version: VERSION, projets: [], reglages: { verrouMinutes: 15 }, derniereSauvegarde: null };
  }

  /** Ramène n'importe quelle entrée — saisie, import, ancienne version — à une forme sûre.
   *  C'est le seul point d'entrée des données : tout ce qui passe ici est bien typé. */
  function normaliser(p) {
    p = p || {};
    var statuts = STATUTS.map(function (s) { return s[0]; });
    return {
      id: texte(p.id, 40) || uid(),
      nom: texte(p.nom, 120) || 'Sans nom',
      description: texte(p.description, 2000),
      secteur: texte(p.secteur, 80),
      statut: un(p.statut, statuts, 'idee'),
      archive: !!p.archive,
      dateDebut: /^\d{4}-\d{2}$/.test(p.dateDebut || '') ? p.dateDebut : moisCourant(),
      creeLe: texte(p.creeLe, 40) || new Date().toISOString(),
      modifieLe: texte(p.modifieLe, 40) || new Date().toISOString(),
      budget: nombre(p.budget, 0, 1e15, 0),
      investissements: (p.investissements || []).map(function (x) {
        return {
          id: texte(x.id, 40) || uid(), libelle: texte(x.libelle, 160),
          categorie: un(x.categorie, CAT_INVEST, 'Autre'),
          montant: nombre(x.montant, 0, 1e15, 0),
          mois: entier(x.mois, 1, PLAFOND_MOIS, 1)
        };
      }),
      depenses: (p.depenses || []).map(function (x) {
        var debut = entier(x.debut, 1, PLAFOND_MOIS, 1);
        var fin = x.fin == null || x.fin === '' ? null : entier(x.fin, debut, PLAFOND_MOIS, debut);
        return {
          id: texte(x.id, 40) || uid(), libelle: texte(x.libelle, 160),
          categorie: un(x.categorie, CAT_DEPENSE, 'Autre'),
          type: un(x.type, ['obligatoire', 'autre'], 'obligatoire'),
          frequence: un(x.frequence, ['mensuelle', 'ponctuelle'], 'mensuelle'),
          montant: nombre(x.montant, 0, 1e15, 0),
          debut: debut, fin: fin
        };
      }),
      revenus: (p.revenus || []).map(function (x) {
        var debut = entier(x.debut, 1, PLAFOND_MOIS, 1);
        var fin = x.fin == null || x.fin === '' ? null : entier(x.fin, debut, PLAFOND_MOIS, debut);
        return {
          id: texte(x.id, 40) || uid(), libelle: texte(x.libelle, 160),
          montant: nombre(x.montant, 0, 1e15, 0),
          debut: debut,
          pleinRegime: entier(x.pleinRegime, debut, PLAFOND_MOIS, debut),
          fin: fin
        };
      }),
      risques: (p.risques || []).map(function (x) {
        return {
          id: texte(x.id, 40) || uid(), libelle: texte(x.libelle, 200),
          probabilite: entier(x.probabilite, 1, 5, 3),
          impact: entier(x.impact, 1, 5, 3),
          cout: nombre(x.cout, 0, 1e15, 0),
          parade: texte(x.parade, 1000),
          statut: un(x.statut, ['ouvert', 'maitrise', 'survenu'], 'ouvert')
        };
      }),
      jalons: (p.jalons || []).map(function (x) {
        return {
          id: texte(x.id, 40) || uid(), libelle: texte(x.libelle, 200),
          mois: entier(x.mois, 1, PLAFOND_MOIS, 1), fait: !!x.fait
        };
      }),
      notes: texte(p.notes, 10000)
    };
  }

  function normaliserBase(b) {
    b = b || {};
    var reg = b.reglages || {};
    return {
      version: VERSION,
      projets: (b.projets || []).map(normaliser),
      reglages: { verrouMinutes: entier(reg.verrouMinutes, 1, 240, 15) },
      derniereSauvegarde: typeof b.derniereSauvegarde === 'string' ? b.derniereSauvegarde : null
    };
  }

  /* ───────────────────────── les calculs ───────────────────────── */

  function actif(ligne, m) {
    if (ligne.frequence === 'ponctuelle') return m === ligne.debut;
    return m >= ligne.debut && (ligne.fin == null || m <= ligne.fin);
  }

  /** Revenu du mois m, montée en charge comprise : linéaire du début au plein régime. */
  function revenuDuMois(r, m) {
    if (m < r.debut || (r.fin != null && m > r.fin)) return 0;
    if (r.pleinRegime > r.debut && m < r.pleinRegime) {
      return r.montant * (m - r.debut + 1) / (r.pleinRegime - r.debut + 1);
    }
    return r.montant;
  }

  function niveauRisque(score) {
    if (score >= 15) return 'critique';
    if (score >= 8) return 'eleve';
    if (score >= 4) return 'moyen';
    return 'faible';
  }

  /** Tout ce qu'on peut dire d'un projet. h : nombre de mois détaillés. */
  function analyse(p, h) {
    h = h || HORIZON;
    var mois = [], cumul = 0, i, m;
    var totaux = { invest: 0, obligatoires: 0, autres: 0, revenus: 0 };

    for (m = 1; m <= h; m++) {
      var inv = 0, depO = 0, depA = 0, rev = 0;
      p.investissements.forEach(function (x) { if (x.mois === m) inv += x.montant; });
      p.depenses.forEach(function (x) {
        if (!actif(x, m)) return;
        if (x.type === 'obligatoire') depO += x.montant; else depA += x.montant;
      });
      p.revenus.forEach(function (x) { rev += revenuDuMois(x, m); });
      rev = Math.round(rev);
      var exploitation = rev - depO - depA;
      var flux = exploitation - inv;
      cumul += flux;
      totaux.invest += inv; totaux.obligatoires += depO; totaux.autres += depA; totaux.revenus += rev;
      mois.push({ m: m, investissement: inv, obligatoires: depO, autres: depA,
        revenus: rev, exploitation: exploitation, flux: flux, cumul: cumul });
    }

    /* investissements prévus au-delà de l'horizon : ils comptent dans la mise engagée */
    var investTotal = 0;
    p.investissements.forEach(function (x) { investTotal += x.montant; });

    /* Le rythme de croisière : le résultat d'exploitation du dernier mois calculé. */
    var croisiere = mois.length ? mois[mois.length - 1].exploitation : 0;

    /* Le besoin de trésorerie : le point le plus bas de la courbe. C'est l'argent qu'il faut
       réellement avoir pour tenir jusqu'à la rentabilité — souvent bien plus que la mise. */
    var creux = 0, moisCreux = 0;
    mois.forEach(function (x) { if (x.cumul < creux) { creux = x.cumul; moisCreux = x.m; } });
    /* si la courbe descend encore à la fin de l'horizon, le creux réel est plus loin */
    var creuxOuvert = croisiere < 0 && mois.length && mois[mois.length - 1].cumul === creux;
    var besoin = -creux;

    /* Le seuil : premier mois où l'exploitation dégage de l'argent. */
    var seuil = 0;
    for (i = 0; i < mois.length; i++) { if (mois[i].exploitation > 0) { seuil = mois[i].m; break; } }

    /* Le retour sur la mise : après le dernier mois où la trésorerie cumulée est négative. */
    var retour;
    if (!mois.some(function (x) { return x.cumul < 0; })) {
      retour = { etat: 'immediat', mois: 0 };
    } else if (mois[mois.length - 1].cumul >= 0) {
      var dernierNegatif = 0;
      mois.forEach(function (x) { if (x.cumul < 0) dernierNegatif = x.m; });
      retour = { etat: 'mois', mois: dernierNegatif + 1 };
    } else if (croisiere <= 0) {
      retour = { etat: 'jamais', mois: 0 };
    } else {
      var reste = -mois[mois.length - 1].cumul;
      var n = h + Math.ceil(reste / croisiere);
      retour = n > PLAFOND_MOIS ? { etat: 'au-dela', mois: n } : { etat: 'mois', mois: n };
    }

    /* Les risques : la provision est le coût pondéré par la probabilité, pour les risques
       encore ouverts. Elle s'ajoute au besoin : c'est l'argent à garder de côté. */
    var provision = 0, risques = [];
    p.risques.forEach(function (r) {
      var score = r.probabilite * r.impact;
      if (r.statut === 'ouvert') provision += r.cout * r.probabilite / 5;
      risques.push({ id: r.id, libelle: r.libelle, probabilite: r.probabilite, impact: r.impact,
        score: score, niveau: niveauRisque(score), statut: r.statut, cout: r.cout });
    });
    provision = Math.round(provision);

    var besoinTotal = besoin + provision;
    var manque = Math.max(0, besoinTotal - p.budget);
    var base = investTotal || besoin;
    var rendement = base > 0 && croisiere > 0 ? croisiere * 12 / base * 100 : null;

    var alertes = [];
    if (manque > 0) {
      alertes.push({ niveau: 'critique', code: 'manque',
        texte: 'Il manque ' + ar(manque) + ' Ar pour tenir jusqu’à la rentabilité.' });
    }
    if (retour.etat === 'jamais') {
      alertes.push({ niveau: 'critique', code: 'jamais',
        texte: 'Au rythme de croisière, le projet perd de l’argent chaque mois : il ne rembourse jamais sa mise.' });
    }
    if (creuxOuvert) {
      alertes.push({ niveau: 'eleve', code: 'creux-ouvert',
        texte: 'La trésorerie descend encore au mois ' + h + ' : le besoin réel est plus élevé que celui affiché.' });
    }
    if (!p.revenus.length) {
      alertes.push({ niveau: 'moyen', code: 'sans-revenu',
        texte: 'Aucun revenu saisi : les calculs ne montrent que les sorties.' });
    }
    var critiques = risques.filter(function (r) { return r.niveau === 'critique' && r.statut === 'ouvert'; }).length;
    if (critiques) {
      alertes.push({ niveau: 'eleve', code: 'risques',
        texte: critiques + (critiques > 1 ? ' risques critiques ouverts.' : ' risque critique ouvert.') });
    }
    if (retour.etat === 'au-dela') {
      alertes.push({ niveau: 'moyen', code: 'lent',
        texte: 'Le retour sur la mise prend plus de dix ans au rythme de croisière.' });
    }

    return {
      h: h, mois: mois, totaux: totaux,
      investTotal: investTotal, croisiere: croisiere, plafond: croisiere,
      besoin: besoin, moisCreux: moisCreux, creuxOuvert: creuxOuvert,
      provision: provision, besoinTotal: besoinTotal, manque: manque,
      seuil: seuil, retour: retour, rendement: rendement,
      resultatHorizon: cumul, risques: risques, alertes: alertes
    };
  }

  /** « 13 mois » · « 2,5 ans » · « immédiat » · « plus de 10 ans » · « jamais ». */
  function retourTexte(r) {
    if (r.etat === 'immediat') return 'immédiat';
    if (r.etat === 'jamais') return 'jamais';
    if (r.etat === 'au-dela') return 'plus de 10 ans';
    return r.mois <= 18 ? r.mois + ' mois' : dec(r.mois / 12, 1) + ' ans';
  }

  /** La vue d'ensemble : ce qui compte, sans les projets abandonnés ni archivés. */
  function portefeuille(projets) {
    var actifs = projets.filter(function (p) { return !p.archive && p.statut !== 'abandonne'; });
    var t = { nb: actifs.length, budget: 0, capital: 0, besoin: 0, manque: 0, plafond: 0,
      alertes: 0, critiques: 0, projets: [], risques: [] };
    actifs.forEach(function (p) {
      var a = analyse(p);
      t.budget += p.budget;
      t.capital += a.investTotal;
      t.besoin += a.besoinTotal;
      t.manque += a.manque;
      if (a.plafond > 0) t.plafond += a.plafond;
      t.alertes += a.alertes.length;
      t.critiques += a.alertes.filter(function (x) { return x.niveau === 'critique'; }).length;
      t.projets.push({ id: p.id, nom: p.nom, statut: p.statut, analyse: a });
      a.risques.forEach(function (r) {
        if (r.statut === 'ouvert') t.risques.push({ projet: p.nom, projetId: p.id, risque: r });
      });
    });
    return t;
  }

  function dupliquer(p) {
    var c = JSON.parse(JSON.stringify(p));
    c.id = uid();
    c.nom = p.nom + ' (copie)';
    c.creeLe = c.modifieLe = new Date().toISOString();
    ['investissements', 'depenses', 'revenus', 'risques', 'jalons'].forEach(function (k) {
      c[k].forEach(function (x) { x.id = uid(); });
    });
    return normaliser(c);
  }

  return {
    VERSION: VERSION, HORIZON: HORIZON, PLAFOND_MOIS: PLAFOND_MOIS,
    STATUTS: STATUTS, CAT_INVEST: CAT_INVEST, CAT_DEPENSE: CAT_DEPENSE,
    uid: uid, nouveauProjet: nouveauProjet, nouvelleBase: nouvelleBase,
    normaliser: normaliser, normaliserBase: normaliserBase, dupliquer: dupliquer,
    analyse: analyse, portefeuille: portefeuille, revenuDuMois: revenuDuMois,
    niveauRisque: niveauRisque, retourTexte: retourTexte, moisLabel: moisLabel,
    fmt: { ar: ar, mAr: mAr, dec: dec, NB: NB }
  };
});
