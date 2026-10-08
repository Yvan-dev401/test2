/* Mes projets — l'application : écrans, formulaires, navigation, enregistrement, verrou.
 *
 * Trois règles tiennent tout le fichier :
 *
 * 1. Les projets en clair n'existent qu'en mémoire, coffre ouvert. Ce qui part vers le
 *    stockage est toujours l'enveloppe chiffrée. Au verrouillage, la mémoire et l'écran
 *    sont vidés.
 * 2. Tout texte inséré dans la page passe par le gabarit html``, qui ÉCHAPPE PAR DÉFAUT.
 *    Pour insérer du HTML brut il faut l'écrire explicitement — brut(…) —, ce qui n'arrive
 *    que pour du balisage produit par ce code lui-même. Un nom de projet piégé, arrivé par
 *    une sauvegarde importée, ne peut donc que s'afficher, jamais s'exécuter.
 * 3. Les chiffres viennent de projets-modele.js, et de lui seul.
 */
(function () {
  'use strict';

  const M = window.Modele;
  const C = window.Coffre;
  const S = window.Stockage;
  const G = window.Graphiques;
  const app = document.getElementById('app');

  const etat = {
    session: null,          // la clé, en mémoire seulement
    base: null,             // les projets en clair, en mémoire seulement
    activite: Date.now(),
    minuteurSave: null,
    aEnregistrer: false,
    chaine: Promise.resolve(),
    derives: {},            // zones recalculées après chaque saisie
    filtre: { statut: '', archives: false },
    importEnAttente: null,
    message: null
  };

  /* ═════════════════════════ gabarit qui échappe par défaut ═════════════════════════ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function Brut(s) { this.s = s; }
  function brut(s) { return new Brut(String(s)); }

  function piece(v) {
    if (v instanceof Brut) return v.s;
    if (Array.isArray(v)) return v.map(piece).join('');
    if (v === false || v == null) return '';
    return esc(v);
  }

  function html(chaines) {
    let out = chaines[0];
    for (let i = 1; i < arguments.length; i++) out += piece(arguments[i]) + chaines[i];
    return new Brut(out);
  }

  function poser(cible, contenu) {
    cible.innerHTML = contenu instanceof Brut ? contenu.s : esc(contenu);
  }

  /* ═════════════════════════ mise en forme ═════════════════════════ */

  const fmt = M.fmt;
  const ar = n => fmt.ar(n) + ' Ar';
  const saisie = n => (n ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '');
  const pct = n => n == null ? '—' : fmt.dec(n, 0) + ' %';
  const STATUT = {};
  M.STATUTS.forEach(s => { STATUT[s[0]] = s[1]; });

  function dateCourte(iso) {
    if (!iso) return 'jamais';
    const d = new Date(iso);
    if (isNaN(d)) return 'jamais';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function joursDepuis(iso) {
    if (!iso) return Infinity;
    return (Date.now() - new Date(iso).getTime()) / 86400000;
  }

  /* ═════════════════════════ enregistrement ═════════════════════════
     Les écritures sont mises en file : deux enregistrements ne peuvent pas se croiser et
     laisser une version ancienne écraser une récente. */

  function statutSave(texte, erreur) {
    const el = document.getElementById('etat-save');
    if (!el) return;
    el.textContent = texte;
    el.classList.toggle('save-ko', !!erreur);
  }

  function enregistrer() {
    etat.aEnregistrer = true;
    statutSave('Enregistrement…');
    clearTimeout(etat.minuteurSave);
    etat.minuteurSave = setTimeout(vider, 250);
  }

  function vider() {
    clearTimeout(etat.minuteurSave);
    if (!etat.aEnregistrer || !etat.session) return etat.chaine;
    etat.aEnregistrer = false;
    /* La clé et les projets sont capturés MAINTENANT, pas au moment où le chiffrement aura
       lieu : le verrouillage peut ainsi vider la mémoire tout de suite, l'écriture en cours
       garde ce qu'il faut. Sinon on chiffrerait du vide. */
    const session = etat.session;
    const base = JSON.parse(JSON.stringify(etat.base));
    etat.chaine = etat.chaine.then(() => C.sceller(session, base))
      .then(env => S.enregistrer(env))
      .then(() => statutSave('Enregistré'), e => {
        etat.aEnregistrer = true;
        statutSave('Échec de l’enregistrement — ' + e.message, true);
      });
    return etat.chaine;
  }

  /* ═════════════════════════ verrou ═════════════════════════ */

  function ecran(contenu) {
    poser(app, html`<div class="ecran"><div class="ecran-carte">${contenu}</div></div>`);
  }

  function jauge(id) {
    return html`<div class="jauge" id="${id}" data-score="0"><span class="jauge-barre"><span></span></span>
      <span class="jauge-texte">Au moins ${C.LONGUEUR_MIN} caractères. Une phrase de quatre mots fait mieux qu’un mot compliqué.</span></div>`;
  }

  function majJauge(id, mdp) {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = C.solidite(mdp);
    el.setAttribute('data-score', mdp ? String(v.score) : '0');
    el.querySelector('.jauge-texte').textContent = mdp ? v.message
      : 'Au moins ' + C.LONGUEUR_MIN + ' caractères. Une phrase de quatre mots fait mieux qu’un mot compliqué.';
    return v;
  }

  function ecranCreation() {
    ecran(html`
      <div class="marque">🗂️ Mes projets</div>
      <h1 class="ecran-titre">Crée ton coffre</h1>
      <ul class="points">
        <li><b>Ton mot de passe chiffre tes données</b> dans ce navigateur, avant tout
          enregistrement. Sans lui, ce qui est stocké est illisible — y compris pour l’auteur du site.</li>
        <li><b>Mot de passe oublié, données perdues.</b> Personne ne peut le retrouver. Note-le
          dans un endroit sûr, et fais des sauvegardes.</li>
        <li><b>Les données restent sur cet appareil.</b> Pour les retrouver ailleurs, une
          sauvegarde chiffrée se télécharge et se réimporte.</li>
      </ul>
      <form class="pile" data-form="creer" autocomplete="on">
        <label class="champ"><span class="champ-l">Mot de passe</span>
          <span class="mdp"><input type="password" name="mdp" autocomplete="new-password" required
            minlength="${C.LONGUEUR_MIN}" aria-describedby="jauge-c">
            <button type="button" class="mdp-voir" data-action="voir-mdp" aria-label="Afficher le mot de passe">👁</button></span></label>
        ${jauge('jauge-c')}
        <label class="champ"><span class="champ-l">Confirmation</span>
          <input type="password" name="confirmation" autocomplete="new-password" required></label>
        <p class="erreur" data-erreur hidden></p>
        <button type="submit" class="btn btn-main btn-large" disabled>Créer le coffre</button>
      </form>
      <p class="ecran-pied"><a href="index.html">← Retour à l’accueil</a></p>`);
    const f = app.querySelector('[data-form="creer"]');
    const verifier = () => {
      const v = majJauge('jauge-c', f.mdp.value);
      f.querySelector('[type=submit]').disabled = !(v && v.acceptable && f.mdp.value === f.confirmation.value);
    };
    f.addEventListener('input', verifier);
    f.mdp.focus();
  }

  function ecranOuverture(erreur) {
    ecran(html`
      <div class="marque">🗂️ Mes projets</div>
      <h1 class="ecran-titre">Coffre verrouillé</h1>
      <p class="ecran-texte">Saisis ton mot de passe pour déchiffrer tes projets.</p>
      <form class="pile" data-form="ouvrir">
        <label class="champ"><span class="champ-l">Mot de passe</span>
          <span class="mdp"><input type="password" name="mdp" autocomplete="current-password" required>
            <button type="button" class="mdp-voir" data-action="voir-mdp" aria-label="Afficher le mot de passe">👁</button></span></label>
        <p class="erreur" data-erreur ${erreur ? '' : brut('hidden')}>${erreur || ''}</p>
        <button type="submit" class="btn btn-main btn-large">Déverrouiller</button>
      </form>
      <p class="ecran-pied"><button type="button" class="lien" data-action="oubli">J’ai oublié mon mot de passe</button>
        · <a href="index.html">Accueil</a></p>`);
    app.querySelector('[name=mdp]').focus();
  }

  function ecranOubli() {
    ecran(html`
      <div class="marque">🗂️ Mes projets</div>
      <h1 class="ecran-titre">Mot de passe oublié</h1>
      <p class="ecran-texte">Il n’existe <b>aucun moyen</b> de le retrouver : c’est précisément ce
        qui protège tes données. Ni le site, ni son auteur, ni personne ne peut ouvrir le coffre
        sans lui.</p>
      <p class="ecran-texte">Deux possibilités : réessayer — les gestionnaires de mots de passe du
        navigateur l’ont peut-être retenu —, ou effacer le coffre de cet appareil et repartir de zéro.
        Si tu as une sauvegarde, tu pourras la réimporter avec <b>son</b> mot de passe.</p>
      <form class="pile" data-form="effacer">
        <label class="champ"><span class="champ-l">Pour effacer, tape EFFACER</span>
          <input type="text" name="confirmation" autocomplete="off" autocapitalize="characters"></label>
        <button type="submit" class="btn btn-danger">Effacer le coffre de cet appareil</button>
      </form>
      <p class="ecran-pied"><button type="button" class="lien" data-action="retour-verrou">← Réessayer le mot de passe</button></p>`);
  }

  function attente(texte) {
    ecran(html`<div class="marque">🗂️ Mes projets</div><p class="attente"><span class="roue"></span>${texte}</p>`);
  }

  async function creerCoffre(f) {
    const err = f.querySelector('[data-erreur]');
    if (f.mdp.value !== f.confirmation.value) {
      err.hidden = false; err.textContent = 'Les deux mots de passe ne sont pas identiques.'; return;
    }
    const mdp = f.mdp.value;
    attente('Création du coffre…');
    try {
      const r = await C.creer(mdp, M.nouvelleBase());
      await S.enregistrer(r.enveloppe);
      ouvrirSession(r.session, M.nouvelleBase());
    } catch (e) {
      ecranCreation();
      const e2 = app.querySelector('[data-erreur]');
      e2.hidden = false; e2.textContent = e.message;
    }
  }

  async function ouvrirCoffre(f) {
    const mdp = f.mdp.value;
    attente('Déchiffrement…');
    try {
      const env = await S.charger();
      if (!env) { ecranCreation(); return; }
      const r = await C.ouvrir(env, mdp);
      ouvrirSession(r.session, M.normaliserBase(r.donnees));
    } catch (e) {
      ecranOuverture(e.code === 'refus' ? 'Mot de passe incorrect.' : e.message);
    }
  }

  function ouvrirSession(session, base) {
    etat.session = session;
    etat.base = base;
    etat.activite = Date.now();
    if (!location.hash || location.hash === '#') location.hash = '#/';
    rendre();
  }

  /** Verrouiller : lancer l'enregistrement de la dernière saisie, puis oublier tout de suite
   *  la clé, les projets et l'écran. C'est synchrone exprès : vider() a déjà capturé ce qu'il
   *  doit écrire, et rien de déchiffré ne doit survivre à cet appel — pas même le temps d'un
   *  chiffrement, pendant lequel la page pourrait être mise en cache. */
  function verrouiller() {
    if (!etat.session) return etat.chaine;
    commettreChampActif();
    const ecriture = vider();
    etat.session = null;
    etat.base = null;
    etat.derives = {};
    etat.importEnAttente = null;
    poser(app, '');
    ecranOuverture();
    return ecriture;
  }

  /* inactivité */
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, () => { etat.activite = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (!etat.session) return;
    const minutes = (etat.base && etat.base.reglages.verrouMinutes) || 15;
    if (Date.now() - etat.activite > minutes * 60000) verrouiller();
  }, 10000);

  /* en quittant la page : enregistrer ce qui peut l'être, puis verrouiller, pour qu'un retour
     arrière ne remontre pas les projets déchiffrés */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && etat.session) { commettreChampActif(); vider(); }
  });
  window.addEventListener('pagehide', () => { if (etat.session) verrouiller(); });

  /* ═════════════════════════ navigation ═════════════════════════ */

  function route() {
    const h = (location.hash || '#/').replace(/^#\/?/, '');
    const p = h.split('/').filter(Boolean);
    return { vue: p[0] || 'tableau', id: p[1] || null, onglet: p[2] || 'synthese' };
  }

  window.addEventListener('hashchange', () => { if (etat.session) rendre(); });

  function projet(id) {
    return etat.base.projets.find(p => p.id === id) || null;
  }

  function remplacer(p) {
    const i = etat.base.projets.findIndex(x => x.id === p.id);
    if (i >= 0) etat.base.projets[i] = p;
  }

  function coquille(actif, contenu) {
    const lien = (h, cle, texte) => html`<a href="${h}" class="nav-l${actif === cle ? ' nav-actif' : ''}"
      ${actif === cle ? brut('aria-current="page"') : ''}>${texte}</a>`;
    return html`
      <header class="barre">
        <a href="#/" class="marque marque-barre">🗂️ Mes projets</a>
        <span class="etat-save" id="etat-save" role="status">Enregistré</span>
        <button type="button" class="btn btn-verrou" data-action="verrouiller" title="Verrouiller maintenant">🔒 Verrouiller</button>
      </header>
      <nav class="nav" aria-label="Navigation">
        ${lien('#/', 'tableau', 'Tableau de bord')}
        ${lien('#/projets', 'projets', 'Projets')}
        ${lien('#/lexique', 'lexique', 'Lexique')}
        ${lien('#/parametres', 'parametres', 'Paramètres')}
        <a href="index.html" class="nav-l nav-sortie">← Accueil</a>
      </nav>
      ${etat.message ? html`<div class="flash flash-${etat.message.ton}" role="status">${etat.message.texte}
        <button type="button" class="flash-x" data-action="fermer-message" aria-label="Fermer">×</button></div>` : ''}
      <main class="vue" id="vue">${contenu}</main>`;
  }

  function annoncer(texte, ton) {
    etat.message = { texte: texte, ton: ton || 'ok' };
  }

  function rendre() {
    if (!etat.session) return;
    const r = route();
    etat.derives = {};
    let actif = r.vue, contenu;
    if (r.vue === 'projets') contenu = vueListe();
    else if (r.vue === 'projet') {
      const p = projet(r.id);
      if (!p) { location.hash = '#/projets'; return; }
      actif = 'projets';
      contenu = vueProjet(p, r.onglet);
    } else if (r.vue === 'parametres') contenu = vueParametres();
    else if (r.vue === 'lexique') contenu = vueLexique();
    else { actif = 'tableau'; contenu = vueTableau(); }
    poser(app, coquille(actif, contenu));
    rafraichirDerives();
    etat.message = null;
    if (r.vue === 'lexique' && r.id) {
      const cible = document.getElementById('lex-' + r.id);
      if (cible) cible.scrollIntoView({ block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }
  }

  /** Les zones dérivées se recalculent après chaque saisie sans redessiner les champs :
   *  on garde ainsi la saisie en cours et la position du curseur. */
  function derive(cle, fn) {
    etat.derives[cle] = fn;
    return html`<div data-derive="${cle}"></div>`;
  }

  /* Chaque zone reçoit la largeur de son cadre : les schémas s'y dessinent à l'échelle 1. */
  function rafraichirDerives() {
    Object.keys(etat.derives).forEach(cle => {
      const el = app.querySelector('[data-derive="' + cle + '"]');
      if (el) poser(el, etat.derives[cle](el.clientWidth));
    });
  }

  /* l'écran tourne, la fenêtre change : les schémas se redessinent à la nouvelle largeur */
  let minuteurTaille = null;
  window.addEventListener('resize', () => {
    clearTimeout(minuteurTaille);
    minuteurTaille = setTimeout(() => { if (etat.session) rafraichirDerives(); }, 180);
  });

  /* ═════════════════════════ morceaux d'interface ═════════════════════════ */

  function kpi(lab, valeur, sous, ton, lexique) {
    return html`<div class="kpi${ton ? ' kpi-' + ton : ''}">
      <div class="kpi-l">${lexique ? html`<a href="#/lexique/${lexique}" class="lex">${lab}</a>` : lab}</div>
      <div class="kpi-v">${valeur}</div>
      ${sous ? html`<div class="kpi-s">${sous}</div>` : ''}</div>`;
  }

  function badge(statut) {
    return html`<span class="badge badge-${statut}">${STATUT[statut] || statut}</span>`;
  }

  function alertes(liste) {
    if (!liste.length) return html`<p class="rien">Aucune alerte : rien ne manque, rien ne cloche dans les chiffres saisis.</p>`;
    return html`<ul class="alertes">${liste.map(a => html`<li class="alerte alerte-${a.niveau}">${a.texte}</li>`)}</ul>`;
  }

  function carte(titre, contenu, extra) {
    return html`<section class="carte"><div class="carte-h"><h2>${titre}</h2>${extra || ''}</div>${contenu}</section>`;
  }

  function options(liste, choisi) {
    return liste.map(o => {
      const v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
      return html`<option value="${v}"${String(v) === String(choisi) ? brut(' selected') : ''}>${t}</option>`;
    });
  }

  /* ═════════════════════════ tableau de bord ═════════════════════════ */

  function vueTableau() {
    const t = M.portefeuille(etat.base.projets);
    const tous = etat.base.projets;

    if (!tous.length) {
      return html`
        <div class="vide">
          <h1>Bienvenue dans ton coffre</h1>
          <p>Aucun projet pour l’instant. Crée le premier, ou charge un exemple tout rempli pour voir
            comment l’outil raisonne — tu pourras le supprimer ensuite.</p>
          <div class="actions">
            <button type="button" class="btn btn-main" data-action="nouveau">＋ Nouveau projet</button>
            <button type="button" class="btn" data-action="exemple">Charger un projet d’exemple</button>
          </div>
        </div>`;
    }

    const rappel = joursDepuis(etat.base.derniereSauvegarde) > 14;
    const enAlerte = t.projets.filter(p => p.analyse.alertes.length)
      .sort((a, b) => b.analyse.alertes.filter(x => x.niveau === 'critique').length
        - a.analyse.alertes.filter(x => x.niveau === 'critique').length);

    return html`
      <div class="tete">
        <h1>Tableau de bord</h1>
        <button type="button" class="btn btn-main" data-action="nouveau">＋ Nouveau projet</button>
      </div>

      ${rappel ? html`<div class="rappel">
        <p><b>${etat.base.derniereSauvegarde ? 'Dernière sauvegarde : ' + dateCourte(etat.base.derniereSauvegarde) + '.'
          : 'Tu n’as encore fait aucune sauvegarde.'}</b> Si ce navigateur est effacé, tes projets disparaissent avec lui.</p>
        <button type="button" class="btn" data-action="sauvegarde">Télécharger une sauvegarde</button></div>` : ''}

      <div class="kpis">
        ${kpi('Projets actifs', String(t.nb), tous.length > t.nb ? (tous.length - t.nb) + ' archivés ou abandonnés' : '')}
        ${kpi('Capital engagé', ar(t.capital), 'total des investissements')}
        ${kpi('Besoin de trésorerie', ar(t.besoin), 'face à ' + ar(t.budget) + ' de budget', t.manque > 0 ? 'ko' : '', 'besoin')}
        ${kpi(t.manque > 0 ? 'Il manque' : 'Marge de sécurité', ar(t.manque > 0 ? t.manque : t.budget - t.besoin),
          t.manque > 0 ? 'à trouver avant de lancer' : 'budget non engagé', t.manque > 0 ? 'ko' : 'ok')}
        ${kpi('Bénéfice mensuel au plafond', ar(t.plafond), 'tous projets confondus', t.plafond > 0 ? 'ok' : '', 'plafond')}
      </div>

      ${enAlerte.length ? carte('À surveiller', html`<div class="pile-serree">${enAlerte.map(p => html`
        <a class="alerte-projet" href="#/projet/${p.id}">
          <span class="alerte-projet-nom">${p.nom} ${badge(p.statut)}</span>
          ${alertes(p.analyse.alertes)}</a>`)}</div>`) : ''}

      <div class="grille-2">
        ${carte('Quand chaque projet récupère sa mise', derive('frise', w => html`<div class="graphe">${brut(G.frise(t.projets, w))}</div>`))}
        ${carte('Carte des risques ouverts', html`<div class="graphe graphe-carre">${brut(G.carteRisques(t.risques.map(x => x.risque)))}</div>
          <p class="note">${t.risques.length} risque${t.risques.length > 1 ? 's' : ''} ouvert${t.risques.length > 1 ? 's' : ''}
            sur l’ensemble des projets. En haut à droite : probables et graves.</p>`)}
      </div>

      ${carte('Tes projets', html`<div class="cartes-projets">${t.projets.map(p => carteProjet(projet(p.id), p.analyse))}</div>`,
        html`<a href="#/projets" class="lien">Tout voir →</a>`)}`;
  }

  function carteProjet(p, a) {
    const couverture = a.besoinTotal > 0 ? Math.min(100, p.budget / a.besoinTotal * 100) : 100;
    return html`<a class="carte-projet" href="#/projet/${p.id}">
      <span class="cp-tete"><span class="cp-nom">${p.nom}</span>${badge(p.statut)}</span>
      ${p.secteur ? html`<span class="cp-secteur">${p.secteur}</span>` : ''}
      <span class="cp-ligne"><span>Retour sur la mise</span><b>${M.retourTexte(a.retour)}</b></span>
      <span class="cp-ligne"><span>Au plafond</span><b>${ar(a.plafond)} / mois</b></span>
      <span class="cp-ligne"><span>Budget / besoin</span><b>${fmt.mAr(p.budget)} / ${fmt.mAr(a.besoinTotal)}</b></span>
      <span class="jauge-budget${a.manque > 0 ? ' jauge-ko' : ''}"><span style="width:${couverture.toFixed(0)}%"></span></span>
      ${a.alertes.length ? html`<span class="cp-alerte">⚠ ${a.alertes.length} alerte${a.alertes.length > 1 ? 's' : ''}</span>` : ''}
    </a>`;
  }

  /* ═════════════════════════ liste des projets ═════════════════════════ */

  function vueListe() {
    const f = etat.filtre;
    const liste = etat.base.projets
      .filter(p => (f.archives ? true : !p.archive) && (!f.statut || p.statut === f.statut))
      .sort((a, b) => (b.modifieLe || '').localeCompare(a.modifieLe || ''));
    return html`
      <div class="tete">
        <h1>Projets</h1>
        <button type="button" class="btn btn-main" data-action="nouveau">＋ Nouveau projet</button>
      </div>
      <div class="filtres">
        <label class="champ champ-inline"><span class="champ-l">Statut</span>
          <select data-filtre="statut"><option value="">Tous</option>${options(M.STATUTS, f.statut)}</select></label>
        <label class="case"><input type="checkbox" data-filtre="archives"${f.archives ? brut(' checked') : ''}> Afficher les archivés</label>
      </div>
      ${liste.length ? html`<div class="liste">${liste.map(p => {
        const a = M.analyse(p);
        return html`<div class="liste-ligne${p.archive ? ' archive' : ''}">
          <a href="#/projet/${p.id}" class="liste-nom">${p.nom}</a>
          ${badge(p.statut)}
          <span class="liste-chiffre"><span class="muted">Besoin</span> ${fmt.mAr(a.besoinTotal)} Ar</span>
          <span class="liste-chiffre"><span class="muted">Retour</span> ${M.retourTexte(a.retour)}</span>
          <span class="liste-actions">
            <button type="button" class="btn btn-petit" data-action="dupliquer" data-id="${p.id}">Dupliquer</button>
            <button type="button" class="btn btn-petit" data-action="archiver" data-id="${p.id}">${p.archive ? 'Désarchiver' : 'Archiver'}</button>
            <button type="button" class="btn btn-petit btn-danger-l" data-action="supprimer" data-id="${p.id}">Supprimer</button>
          </span></div>`;
      })}</div>` : html`<p class="rien">Aucun projet ne correspond à ce filtre.</p>`}`;
  }

  /* ═════════════════════════ un projet ═════════════════════════ */

  const ONGLETS = [
    ['synthese', 'Synthèse'], ['investissements', 'Investissements'], ['depenses', 'Dépenses'],
    ['revenus', 'Revenus'], ['risques', 'Risques'], ['echeancier', 'Échéancier']
  ];

  /* La définition des colonnes de chaque liste : un seul endroit à modifier pour ajouter un champ. */
  const MOIS_OPT = [];
  for (let m = 1; m <= 60; m++) MOIS_OPT.push(m);
  const NOTE_OPT = [[1, '1 — très faible'], [2, '2 — faible'], [3, '3 — moyen'], [4, '4 — fort'], [5, '5 — très fort']];

  const COLONNES = {
    investissements: [
      { k: 'libelle', t: 'texte', lab: 'Ce que tu achètes', ph: 'Ex. : broyeur, aménagement du local', large: true },
      { k: 'categorie', t: 'choix', lab: 'Catégorie', opts: M.CAT_INVEST },
      { k: 'montant', t: 'montant', lab: 'Montant (Ar)' },
      { k: 'mois', t: 'mois', lab: 'Mois de la dépense' }
    ],
    depenses: [
      { k: 'libelle', t: 'texte', lab: 'Dépense', ph: 'Ex. : loyer, salaires', large: true },
      { k: 'categorie', t: 'choix', lab: 'Catégorie', opts: M.CAT_DEPENSE },
      { k: 'montant', t: 'montant', lab: 'Montant (Ar)' },
      { k: 'frequence', t: 'choix', lab: 'Fréquence', opts: [['mensuelle', 'Mensuelle'], ['ponctuelle', 'Une fois']] },
      { k: 'debut', t: 'mois', lab: 'À partir du mois' },
      { k: 'fin', t: 'mois-fin', lab: 'Jusqu’au mois' }
    ],
    revenus: [
      { k: 'libelle', t: 'texte', lab: 'Revenu', ph: 'Ex. : ventes au détail', large: true },
      { k: 'montant', t: 'montant', lab: 'Par mois, à plein régime (Ar)' },
      { k: 'debut', t: 'mois', lab: 'Premier mois' },
      { k: 'pleinRegime', t: 'mois', lab: 'Plein régime au mois' },
      { k: 'fin', t: 'mois-fin', lab: 'Jusqu’au mois' }
    ],
    risques: [
      { k: 'libelle', t: 'texte', lab: 'Ce qui peut mal tourner', ph: 'Ex. : la machine tombe en panne', large: true },
      { k: 'probabilite', t: 'choix', lab: 'Probabilité', opts: NOTE_OPT },
      { k: 'impact', t: 'choix', lab: 'Impact', opts: NOTE_OPT },
      { k: 'cout', t: 'montant', lab: 'Coût si ça arrive (Ar)' },
      { k: 'statut', t: 'choix', lab: 'Statut', opts: [['ouvert', 'Ouvert'], ['maitrise', 'Maîtrisé'], ['survenu', 'Survenu']] },
      { k: 'parade', t: 'long', lab: 'La parade', ph: 'Ce que tu fais pour l’éviter, ou pour l’encaisser', large: true }
    ],
    jalons: [
      { k: 'libelle', t: 'texte', lab: 'Jalon', ph: 'Ex. : patente obtenue', large: true },
      { k: 'mois', t: 'mois', lab: 'Mois visé' },
      { k: 'fait', t: 'case', lab: 'Atteint' }
    ]
  };

  function champ(c, ligne, liste) {
    const attrs = html`data-l="${liste || ''}" data-id="${ligne.id || ''}" data-k="${c.k}"`;
    const v = ligne[c.k];
    let saisieEl;
    if (c.t === 'texte') saisieEl = html`<input type="text" ${attrs} value="${v}" placeholder="${c.ph || ''}" maxlength="160">`;
    else if (c.t === 'long') saisieEl = html`<textarea ${attrs} rows="2" placeholder="${c.ph || ''}" maxlength="1000">${v}</textarea>`;
    else if (c.t === 'montant') saisieEl = html`<input type="text" inputmode="numeric" ${attrs} value="${saisie(v)}" placeholder="0">`;
    else if (c.t === 'mois') saisieEl = html`<select ${attrs}>${options(MOIS_OPT.map(m => [m, 'mois ' + m]), v)}</select>`;
    else if (c.t === 'mois-fin') saisieEl = html`<select ${attrs}><option value="">sans fin</option>${options(MOIS_OPT.map(m => [m, 'mois ' + m]), v)}</select>`;
    else if (c.t === 'choix') saisieEl = html`<select ${attrs}>${options(c.opts, v)}</select>`;
    else if (c.t === 'case') return html`<label class="case case-ligne"><input type="checkbox" ${attrs}${v ? brut(' checked') : ''}> ${c.lab}</label>`;
    const largeur = c.t === 'long' ? ' champ-plein' : (c.large ? ' champ-large' : '');
    return html`<label class="champ${largeur}"><span class="champ-l">${c.lab}</span>${saisieEl}</label>`;
  }

  function lignes(p, liste, filtre, ajout) {
    const items = p[liste].filter(filtre || (() => true));
    const cols = COLONNES[liste];
    return html`<div class="lignes" data-liste="${liste}">
      ${items.length ? items.map(x => html`<div class="ligne" data-ligne="${liste}">
        ${cols.map(c => champ(c, x, liste))}
        ${liste === 'risques' ? html`<span class="ligne-score">${derive('score-' + x.id, () => {
          const a = M.analyse(projet(p.id));
          const r = a.risques.find(y => y.id === x.id);
          return r ? html`<span class="score score-${r.niveau}">${r.score} · ${r.niveau === 'eleve' ? 'élevé' : r.niveau}</span>` : '';
        })}</span>` : ''}
        <button type="button" class="ligne-x" data-action="retirer-ligne" data-l="${liste}" data-id="${x.id}"
          aria-label="Retirer cette ligne">×</button>
      </div>`) : html`<p class="rien">Rien pour l’instant.</p>`}
      <button type="button" class="btn btn-ajout" data-action="ajouter-ligne" data-l="${liste}"
        ${ajout ? html`data-type="${ajout}"` : ''}>＋ Ajouter</button>
    </div>`;
  }

  function vueProjet(p, onglet) {
    if (!ONGLETS.some(o => o[0] === onglet)) onglet = 'synthese';
    const corps = {
      synthese: ongletSynthese, investissements: ongletInvestissements, depenses: ongletDepenses,
      revenus: ongletRevenus, risques: ongletRisques, echeancier: ongletEcheancier
    }[onglet](p);
    return html`
      <div class="tete tete-projet">
        <div><a href="#/projets" class="fil">← Projets</a>
          <h1>${derive('titre', () => html`${projet(p.id).nom}`)}</h1></div>
        ${derive('badge', () => badge(projet(p.id).statut))}
      </div>
      <nav class="onglets" aria-label="Rubriques du projet">${ONGLETS.map(o => html`<a href="#/projet/${p.id}/${o[0]}"
        class="onglet${o[0] === onglet ? ' onglet-actif' : ''}"${o[0] === onglet ? brut(' aria-current="page"') : ''}>${o[1]}</a>`)}</nav>
      ${derive('kpis', () => kpisProjet(projet(p.id)))}
      ${corps}`;
  }

  function kpisProjet(p) {
    const a = M.analyse(p);
    return html`<div class="kpis">
      ${kpi('Budget disponible', ar(p.budget))}
      ${kpi('Besoin de trésorerie', ar(a.besoinTotal),
        a.provision ? 'dont ' + ar(a.provision) + ' de provision pour risques' : (a.moisCreux ? 'au plus bas : mois ' + a.moisCreux : ''),
        a.manque > 0 ? 'ko' : '', 'besoin')}
      ${kpi(a.manque > 0 ? 'Il manque' : 'Marge de sécurité', ar(a.manque > 0 ? a.manque : p.budget - a.besoinTotal), '',
        a.manque > 0 ? 'ko' : 'ok')}
      ${kpi('Retour sur la mise', M.retourTexte(a.retour),
        a.retour.etat === 'mois' ? M.moisLabel(p.dateDebut, a.retour.mois) : '',
        a.retour.etat === 'jamais' ? 'ko' : (a.retour.etat === 'au-dela' ? 'warn' : ''), 'retour')}
      ${kpi('Bénéfice mensuel au plafond', ar(a.plafond), a.seuil ? 'premier mois bénéficiaire : ' + a.seuil : 'aucun mois bénéficiaire',
        a.plafond > 0 ? 'ok' : (a.plafond < 0 ? 'ko' : ''), 'plafond')}
      ${kpi('Rendement annuel', pct(a.rendement), 'au rythme de croisière', '', 'rendement')}
    </div>`;
  }

  function ongletSynthese(p) {
    const id = p.id;
    return html`
      ${carte('Alertes', derive('alertes', () => alertes(M.analyse(projet(id)).alertes)))}
      ${carte('Trésorerie cumulée', html`${derive('graphe-treso', w => {
        const q = projet(id);
        return html`<div class="graphe">${brut(G.tresorerie(M.analyse(q), q.budget, w))}</div>`;
      })}<p class="note">La courbe part de zéro et cumule chaque mois ; son point le plus bas est ton
        <a href="#/lexique/besoin" class="lex">besoin de trésorerie</a>. La ligne orange, c’est ton budget
        moins la <a href="#/lexique/provision" class="lex">provision pour risques</a> — l’argent qu’il faut
        garder de côté. Si la courbe passe dessous, il te manque de l’argent.</p>`)}
      ${carte('Le projet', html`<div class="formulaire">
        ${champ({ k: 'nom', t: 'texte', lab: 'Nom du projet', large: true }, p)}
        <label class="champ"><span class="champ-l">Statut</span><select data-k="statut">${options(M.STATUTS, p.statut)}</select></label>
        ${champ({ k: 'secteur', t: 'texte', lab: 'Secteur', ph: 'Ex. : agro-alimentaire' }, p)}
        <label class="champ"><span class="champ-l">Mois de démarrage</span>
          <input type="month" data-k="dateDebut" value="${p.dateDebut}"></label>
        ${champ({ k: 'budget', t: 'montant', lab: 'Budget disponible (Ar)' }, p)}
        <label class="champ champ-large"><span class="champ-l">Description</span>
          <textarea data-k="description" rows="3" maxlength="2000" placeholder="Ce que fait le projet, pour qui, et pourquoi maintenant">${p.description}</textarea></label>
      </div>`)}
      ${carte('Jalons', lignes(p, 'jalons'))}
      ${carte('Notes', html`<label class="champ champ-large"><span class="champ-l">Notes libres</span>
        <textarea data-k="notes" rows="5" maxlength="10000" placeholder="Contacts, devis reçus, idées…">${p.notes}</textarea></label>`)}`;
  }

  function ongletInvestissements(p) {
    const id = p.id;
    return html`
      ${carte('Investissements de départ', html`
        <p class="aide">Tout ce qu’il faut acheter ou payer <b>une fois</b> pour lancer le projet. Le mois
          indique quand l’argent sort : un investissement au mois 6 ne pèse pas sur le démarrage.</p>
        ${lignes(p, 'investissements')}
        ${derive('total-inv', () => html`<p class="total">Total : <b>${ar(M.analyse(projet(id)).investTotal)}</b></p>`)}`)}
      ${carte('Répartition', derive('graphe-inv', () => {
        const q = projet(id), parCat = {};
        q.investissements.forEach(x => { parCat[x.categorie] = (parCat[x.categorie] || 0) + x.montant; });
        const rows = Object.keys(parCat).map(k => ({ libelle: k, valeur: parCat[k] })).sort((a, b) => b.valeur - a.valeur);
        return html`<div class="graphe graphe-anneau">${brut(G.anneau(rows, 'Répartition des investissements'))}</div>`;
      }))}`;
  }

  function ongletDepenses(p) {
    const id = p.id;
    return html`
      ${carte('Dépenses obligatoires', html`
        <p class="aide">Ce que tu payes <b>même sans rien vendre</b> : loyer, salaires, abonnements,
          remboursements. C’est l’horloge qui tourne.</p>
        ${lignes(p, 'depenses', x => x.type === 'obligatoire', 'obligatoire')}`)}
      ${carte('Autres dépenses', html`
        <p class="aide">Ce qui pourrait être réduit ou différé si le projet ralentit : marketing,
          déplacements, achats non essentiels.</p>
        ${lignes(p, 'depenses', x => x.type === 'autre', 'autre')}`)}
      ${carte('Par catégorie, à plein régime', derive('graphe-dep', w => {
        const q = projet(id), parCat = {}, h = M.HORIZON;
        q.depenses.forEach(x => {
          if (x.frequence !== 'mensuelle') return;
          if (x.fin != null && x.fin < h) return;
          parCat[x.categorie] = (parCat[x.categorie] || 0) + x.montant;
        });
        const rows = Object.keys(parCat).map(k => ({ libelle: k, valeur: parCat[k] })).sort((a, b) => b.valeur - a.valeur);
        const total = rows.reduce((s, r) => s + r.valeur, 0);
        return html`<div class="graphe">${brut(G.barres(rows, 'Dépenses mensuelles par catégorie', w))}</div>
          <p class="total">Charges mensuelles qui courent encore au mois ${h} : <b>${ar(total)}</b></p>`;
      }))}`;
  }

  function ongletRevenus(p) {
    const id = p.id;
    return html`
      ${carte('Revenus', html`
        <p class="aide">Le montant <b>par mois, une fois le plein régime atteint</b>. Entre le premier
          mois et le plein régime, le revenu monte progressivement — c’est la
          <a href="#/lexique/montee" class="lex">montée en charge</a>, et l’oublier rend tous les plans optimistes.</p>
        ${lignes(p, 'revenus')}`)}
      ${carte('Entrées et sorties, mois par mois', derive('graphe-flux', w => html`
        <div class="graphe">${brut(G.flux(M.analyse(projet(id)), w))}</div>
        <p class="legende"><span class="pastille p-ok"></span>revenus
          <span class="pastille p-ko"></span>obligatoires <span class="pastille p-warn"></span>autres
          <span class="pastille p-acc"></span>investissements</p>`))}`;
  }

  function ongletRisques(p) {
    const id = p.id;
    return html`
      ${carte('Risques', html`
        <p class="aide">Probabilité × impact donne le score. Le coût estimé, pondéré par la
          probabilité, devient une <a href="#/lexique/provision" class="lex">provision</a> ajoutée à ton
          besoin de trésorerie — tant que le risque reste ouvert.</p>
        ${lignes(p, 'risques')}
        ${derive('provision', () => html`<p class="total">Provision pour les risques ouverts : <b>${ar(M.analyse(projet(id)).provision)}</b></p>`)}`)}
      ${carte('Carte des risques', derive('graphe-risques', () => html`
        <div class="graphe graphe-carre">${brut(G.carteRisques(M.analyse(projet(id)).risques.filter(r => r.statut === 'ouvert')))}</div>
        <p class="note">Seuls les risques ouverts y figurent.</p>`))}`;
  }

  function ongletEcheancier(p) {
    const id = p.id;
    return html`
      ${carte('Mois par mois', derive('echeancier', () => {
        const q = projet(id), a = M.analyse(q);
        return html`<div class="defile"><table class="tableau">
          <thead><tr><th>Mois</th><th class="num">Revenus</th><th class="num">Obligatoires</th>
            <th class="num">Autres</th><th class="num">Investissements</th><th class="num">Flux du mois</th>
            <th class="num">Trésorerie cumulée</th></tr></thead>
          <tbody>${a.mois.map(x => html`<tr class="${x.cumul < 0 ? 'neg' : ''}${x.m === a.moisCreux ? ' creux' : ''}">
            <td>${x.m} · ${M.moisLabel(q.dateDebut, x.m)}</td>
            <td class="num">${fmt.ar(x.revenus)}</td><td class="num">${fmt.ar(x.obligatoires)}</td>
            <td class="num">${fmt.ar(x.autres)}</td><td class="num">${fmt.ar(x.investissement)}</td>
            <td class="num">${fmt.ar(x.flux)}</td><td class="num"><b>${fmt.ar(x.cumul)}</b></td></tr>`)}</tbody>
          <tfoot><tr><td>Total ${a.h} mois</td><td class="num">${fmt.ar(a.totaux.revenus)}</td>
            <td class="num">${fmt.ar(a.totaux.obligatoires)}</td><td class="num">${fmt.ar(a.totaux.autres)}</td>
            <td class="num">${fmt.ar(a.totaux.invest)}</td><td class="num">${fmt.ar(a.resultatHorizon)}</td>
            <td class="num"><b>${fmt.ar(a.resultatHorizon)}</b></td></tr></tfoot>
        </table></div>`;
      }), html`<button type="button" class="btn btn-petit" data-action="imprimer">🖨️ Imprimer</button>`)}`;
  }

  /* ═════════════════════════ paramètres ═════════════════════════ */

  function vueParametres() {
    const d = S.decrire();
    const imp = etat.importEnAttente;
    return html`
      <div class="tete"><h1>Paramètres</h1></div>

      ${carte('Où sont tes données', html`
        <p><b>${d.titre}.</b> ${d.detail}</p>
        <p class="muted">Coffre chiffré : ${fmt.ar(d.taille)} caractères · AES-256-GCM · clé dérivée en
          ${fmt.ar(C.TOURS)} tours de PBKDF2.</p>`)}

      ${carte('Sauvegarde', html`
        <p>La sauvegarde est le coffre lui-même, <b>chiffré avec ton mot de passe actuel</b> : on peut la
          ranger sur une clé USB ou se l’envoyer par mail sans risque. Elle sert aussi à transporter tes
          projets sur un autre appareil.</p>
        <p class="muted">Dernière sauvegarde : ${dateCourte(etat.base.derniereSauvegarde)}.</p>
        <div class="actions">
          <button type="button" class="btn btn-main" data-action="sauvegarde">Télécharger une sauvegarde</button>
          <label class="btn btn-fichier">Importer une sauvegarde…
            <input type="file" accept=".json,application/json" data-action="choisir-import" hidden></label>
        </div>
        ${imp ? html`<form class="pile import" data-form="import">
          <p><b>${imp.nom}</b> — une sauvegarde scellée le ${dateCourte(imp.enveloppe.scelleLe)}.
            Saisis le mot de passe <b>de cette sauvegarde</b> — celui qui était en vigueur quand elle a été faite.</p>
          <label class="champ"><span class="champ-l">Mot de passe de la sauvegarde</span>
            <input type="password" name="mdp" autocomplete="current-password" required></label>
          <fieldset class="choix-import"><legend>Que faire de ses projets ?</legend>
            <label class="case"><input type="radio" name="mode" value="fusion" checked> Ajouter ceux qui ne sont pas déjà ici</label>
            <label class="case"><input type="radio" name="mode" value="remplacer"> Remplacer tous mes projets actuels</label>
          </fieldset>
          <p class="erreur" data-erreur hidden></p>
          <div class="actions"><button type="submit" class="btn btn-main">Importer</button>
            <button type="button" class="btn" data-action="annuler-import">Annuler</button></div>
        </form>` : ''}`)}

      ${carte('Changer de mot de passe', html`<form class="pile" data-form="mdp">
        <label class="champ"><span class="champ-l">Mot de passe actuel</span>
          <input type="password" name="ancien" autocomplete="current-password" required></label>
        <label class="champ"><span class="champ-l">Nouveau mot de passe</span>
          <input type="password" name="nouveau" autocomplete="new-password" required></label>
        ${jauge('jauge-p')}
        <label class="champ"><span class="champ-l">Confirmation</span>
          <input type="password" name="confirmation" autocomplete="new-password" required></label>
        <p class="erreur" data-erreur hidden></p>
        <p class="muted">Les sauvegardes déjà téléchargées restent chiffrées avec l’ancien mot de passe.</p>
        <button type="submit" class="btn btn-main">Changer le mot de passe</button>
      </form>`)}

      ${carte('Verrouillage automatique', html`<label class="champ champ-inline"><span class="champ-l">Après</span>
        <select data-reglage="verrouMinutes">${options([[5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 heure']],
          etat.base.reglages.verrouMinutes)}</select></label>
        <p class="muted">Sans activité pendant ce délai, le coffre se referme et l’écran est vidé.</p>`)}

      ${carte('Zone sensible', html`<form class="pile" data-form="effacer">
        <p>Effacer le coffre de <b>cet appareil</b>. Sans sauvegarde, tes projets seront perdus définitivement.</p>
        <label class="champ champ-inline"><span class="champ-l">Tape EFFACER</span>
          <input type="text" name="confirmation" autocomplete="off" autocapitalize="characters"></label>
        <button type="submit" class="btn btn-danger">Effacer le coffre</button>
      </form>`)}`;
  }

  /* ═════════════════════════ lexique ═════════════════════════ */

  const LEXIQUE = [
    ['besoin', 'Besoin de trésorerie',
      'L’argent qu’il faut réellement avoir pour tenir jusqu’à la rentabilité.',
      'Le point le plus bas de la trésorerie cumulée, plus la provision pour les risques encore ouverts.',
      'C’est presque toujours plus que la somme des investissements : il faut aussi payer les charges des mois où l’on ne vend pas encore assez. C’est le chiffre qui manque à presque tous les plans — et celui qu’il faut comparer à ton budget.'],
    ['retour', 'Retour sur la mise (point mort)',
      'Le mois où tu as récupéré tout ce que tu as mis dans le projet.',
      'Le mois qui suit le dernier passage de la trésorerie cumulée sous zéro. Au-delà des 36 mois détaillés, on prolonge au rythme de croisière.',
      '« Jamais » ne veut pas dire « lent » : cela veut dire que le mois de croisière lui-même perd de l’argent. « Plus de 10 ans » veut dire que le projet rembourse, mais trop lentement pour qu’on le compte sérieusement.'],
    ['seuil', 'Premier mois bénéficiaire',
      'Le premier mois où les revenus dépassent les dépenses courantes.',
      'Revenus du mois − dépenses obligatoires − autres dépenses > 0. Les investissements ne comptent pas ici.',
      'Ne pas confondre avec le retour sur la mise : on peut gagner de l’argent chaque mois et mettre encore des années à récupérer ce qu’on a investi.'],
    ['plafond', 'Bénéfice mensuel au plafond',
      'Ce que le projet rapporte chaque mois, une fois la montée en charge terminée.',
      'Revenus − dépenses du dernier mois calculé.',
      'C’est lui qui dit ce que le projet rapporte vraiment. Le rendement dit seulement ce qu’il rapporte par ariary investi — les deux ne classent pas les projets dans le même ordre.'],
    ['rendement', 'Rendement annuel',
      'Ce que rapporte chaque ariary investi en une année pleine.',
      'Bénéfice mensuel au plafond × 12 ÷ investissements.',
      'Un rendement énorme signale souvent un petit capital, pas une bonne affaire. Un dépôt à 10 M Ar peut afficher 200 % et rapporter dix fois moins qu’une unité à 700 M Ar.'],
    ['provision', 'Provision pour risques',
      'L’argent à garder de côté pour encaisser les mauvaises surprises probables.',
      'Pour chaque risque ouvert : coût estimé × probabilité ÷ 5.',
      'Un risque très grave mais très improbable pèse peu dans la provision : il appelle une parade, pas une réserve. Passer un risque en « maîtrisé » le retire du calcul — ne le fais que quand c’est vrai.'],
    ['montee', 'Montée en charge',
      'Le temps qu’il faut pour passer des premières ventes au plein régime.',
      'Entre le premier mois et le mois de plein régime, le revenu progresse en ligne droite.',
      'Personne ne vend à plein régime le premier mois. Un plan sans montée en charge sous-estime toujours le besoin de trésorerie.'],
    ['obligatoires', 'Dépenses obligatoires',
      'Ce que tu payes même en ne vendant rien : loyer, salaires, abonnements, remboursements.',
      'La somme des lignes marquées « obligatoire » actives dans le mois.',
      'Ce sont elles qui creusent le trou les mois sans vente. Les réduire avant le lancement vaut plus que n’importe quelle hausse de prix.'],
    ['tresorerie', 'Trésorerie cumulée',
      'L’argent réellement disponible depuis le premier jour du projet.',
      'Trésorerie du mois précédent + flux du mois. Elle part de zéro.',
      'C’est elle qui met en faillite, pas le bénéfice : on peut être rentable chaque mois et manquer d’argent en caisse.']
  ];

  function vueLexique() {
    return html`
      <div class="tete"><h1>Lexique</h1></div>
      <p class="intro">Les notions qui portent les chiffres de l’application. Chacune avec son calcul et le
        piège qu’elle cache — parce que la plupart ne sont pas difficiles à définir, elles sont faciles à mal utiliser.</p>
      <div class="lexique">${LEXIQUE.map(e => html`<article class="lex-entree" id="lex-${e[0]}">
        <h2>${e[1]}</h2><p>${e[2]}</p>
        <p class="lex-calc"><b>Le calcul —</b> ${e[3]}</p>
        <p class="lex-piege"><b>Le piège —</b> ${e[4]}</p></article>`)}</div>`;
  }

  /* ═════════════════════════ saisie ═════════════════════════ */

  const MONTANTS = ['montant', 'cout', 'budget'];
  const ENTIERS = ['mois', 'debut', 'pleinRegime', 'probabilite', 'impact'];

  function lireValeur(el, k) {
    if (el.type === 'checkbox') return el.checked;
    const v = el.value;
    if (MONTANTS.indexOf(k) >= 0) return Number(String(v).replace(/[^\d]/g, '')) || 0;
    if (k === 'fin') return v === '' ? null : Number(v);
    if (ENTIERS.indexOf(k) >= 0) return Number(v);
    return v;
  }

  function majChamp(el) {
    const r = route();
    if (r.vue !== 'projet') return;
    const p = projet(r.id);
    if (!p) return;
    const liste = el.getAttribute('data-l'), id = el.getAttribute('data-id'), k = el.getAttribute('data-k');
    const cible = liste ? (p[liste] || []).find(x => x.id === id) : p;
    if (!cible) return;
    cible[k] = lireValeur(el, k);
    p.modifieLe = new Date().toISOString();
    const n = M.normaliser(p);
    remplacer(n);
    /* la valeur normalisée revient dans le champ : un montant mis en forme, une fin ramenée au début */
    const apres = liste ? n[liste].find(x => x.id === id) : n;
    if (apres && el.type !== 'checkbox' && el !== document.activeElement) {
      if (MONTANTS.indexOf(k) >= 0) el.value = saisie(apres[k]);
      else if (k === 'fin') el.value = apres[k] == null ? '' : String(apres[k]);
    }
    if (apres && liste === 'depenses' && k === 'debut') {
      const finEl = el.closest('.ligne') && el.closest('.ligne').querySelector('[data-k="fin"]');
      if (finEl) finEl.value = apres.fin == null ? '' : String(apres.fin);
    }
    enregistrer();
    rafraichirDerives();
  }

  /** Un champ encore en cours d'édition au moment de verrouiller ou de quitter : on le
   *  valide, pour ne pas perdre la dernière saisie. */
  function commettreChampActif() {
    const el = document.activeElement;
    if (el && el.hasAttribute && el.hasAttribute('data-k') && app.contains(el)) majChamp(el);
  }

  /* ═════════════════════════ actions ═════════════════════════ */

  function exemple() {
    const p = M.normaliser({
      nom: 'Exemple — Dépôt d’intrants agricoles', secteur: 'Négoce agricole', statut: 'preparation',
      description: 'Projet d’exemple, repris de la page « Produire ici ce qu’on importe » : acheter l’engrais au ' +
        'grossiste, le revendre au sac aux riziculteurs. Modifie-le ou supprime-le librement.',
      budget: 12000000, dateDebut: (function () {
        const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
      })(),
      investissements: [
        { libelle: 'Stock de départ : 30 sacs d’engrais', categorie: 'Stock de départ', montant: 5500000, mois: 1 },
        { libelle: 'Caution et aménagement du local', categorie: 'Aménagement', montant: 1800000, mois: 1 },
        { libelle: 'Bascule, brouette, palettes', categorie: 'Équipement', montant: 900000, mois: 1 },
        { libelle: 'Patente, enregistrement, agrément', categorie: 'Démarches et statut', montant: 450000, mois: 1 },
        { libelle: 'Réserve de trésorerie', categorie: 'Réserve', montant: 1200000, mois: 1 }
      ],
      depenses: [
        { libelle: 'Loyer du local', categorie: 'Loyer', montant: 200000, type: 'obligatoire', debut: 1 },
        { libelle: 'Gardiennage', categorie: 'Salaires', montant: 210000, type: 'obligatoire', debut: 1 },
        { libelle: 'Transport et livraisons', categorie: 'Transport', montant: 250000, type: 'obligatoire', debut: 1 },
        { libelle: 'Divers, imprévus', categorie: 'Autre', montant: 120000, type: 'autre', debut: 1 },
        { libelle: 'Affichage dans les fokontany', categorie: 'Marketing', montant: 300000, type: 'autre', frequence: 'ponctuelle', debut: 2 }
      ],
      revenus: [
        { libelle: 'Marge sur les ventes (ventes − achats)', montant: 3000000, debut: 1, pleinRegime: 7 }
      ],
      risques: [
        { libelle: 'Le stock dort si la campagne agricole décale', probabilite: 3, impact: 3, cout: 2000000,
          parade: 'Ne jamais acheter plus de six semaines de vente.' },
        { libelle: 'Les paysans demandent du crédit avant la récolte', probabilite: 4, impact: 4, cout: 3000000,
          parade: 'Pas de crédit la première année ; ensuite un plafond par client.' },
        { libelle: 'Le prix d’achat monte avec le dollar', probabilite: 3, impact: 2, cout: 1000000,
          parade: 'Répercuter vite à la baisse, lentement à la hausse.' }
      ],
      jalons: [
        { libelle: 'Patente et local obtenus', mois: 1 },
        { libelle: 'Mise récupérée', mois: 9 },
        { libelle: 'Réserve du palier suivant constituée', mois: 12 }
      ]
    });
    etat.base.projets.push(p);
    enregistrer();
    location.hash = '#/projet/' + p.id;
  }

  async function telechargerSauvegarde() {
    await vider();
    etat.base.derniereSauvegarde = new Date().toISOString();
    const env = await C.sceller(etat.session, etat.base);
    await S.enregistrer(env);
    const blob = new Blob([JSON.stringify(env, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mes-projets-' + new Date().toISOString().slice(0, 10) + '.coffre.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    annoncer('Sauvegarde téléchargée. Elle est chiffrée avec ton mot de passe actuel.');
    rendre();
  }

  function choisirImport(input) {
    const fichier = input.files && input.files[0];
    if (!fichier) return;
    if (fichier.size > 5 * 1024 * 1024) { annoncer('Ce fichier est trop gros pour être une sauvegarde.', 'ko'); rendre(); return; }
    const lecteur = new FileReader();
    lecteur.onload = () => {
      try {
        const env = JSON.parse(lecteur.result);
        C.verifierEnveloppe(env);
        etat.importEnAttente = { nom: fichier.name, enveloppe: env };
      } catch (e) {
        etat.importEnAttente = null;
        annoncer(e.code ? e.message : 'Ce fichier n’est pas une sauvegarde lisible.', 'ko');
      }
      rendre();
    };
    lecteur.readAsText(fichier);
  }

  async function importer(f) {
    const err = f.querySelector('[data-erreur]');
    const imp = etat.importEnAttente;
    if (!imp) return;
    const mode = f.querySelector('[name=mode]:checked').value;
    const bouton = f.querySelector('[type=submit]');
    bouton.disabled = true; bouton.textContent = 'Déchiffrement…';
    try {
      const r = await C.ouvrir(imp.enveloppe, f.mdp.value);
      const venue = M.normaliserBase(r.donnees);
      let n;
      if (mode === 'remplacer') {
        n = venue.projets.length;
        etat.base.projets = venue.projets;
      } else {
        const ici = new Set(etat.base.projets.map(p => p.id));
        const nouveaux = venue.projets.filter(p => !ici.has(p.id));
        n = nouveaux.length;
        etat.base.projets = etat.base.projets.concat(nouveaux);
      }
      etat.importEnAttente = null;
      enregistrer();
      annoncer(mode === 'remplacer'
        ? n + ' projet' + (n > 1 ? 's' : '') + ' importé' + (n > 1 ? 's' : '') + ', à la place des précédents.'
        : (n ? n + ' projet' + (n > 1 ? 's' : '') + ' ajouté' + (n > 1 ? 's' : '') + '.' : 'Tous les projets de cette sauvegarde étaient déjà là.'));
      rendre();
    } catch (e) {
      bouton.disabled = false; bouton.textContent = 'Importer';
      err.hidden = false;
      err.textContent = e.code === 'refus' ? 'Ce n’est pas le mot de passe de cette sauvegarde.' : e.message;
    }
  }

  async function changerMotDePasse(f) {
    const err = f.querySelector('[data-erreur]');
    const montrer = t => { err.hidden = false; err.textContent = t; };
    if (f.nouveau.value !== f.confirmation.value) return montrer('Les deux nouveaux mots de passe ne sont pas identiques.');
    const v = C.solidite(f.nouveau.value);
    if (!v.acceptable) return montrer(v.message);
    const bouton = f.querySelector('[type=submit]');
    bouton.disabled = true; bouton.textContent = 'Rechiffrement…';
    try {
      await vider();
      const env = await S.charger();
      await C.ouvrir(env, f.ancien.value);           // vérifie l'ancien sur le coffre réel
      const r = await C.creer(f.nouveau.value, etat.base);
      await S.enregistrer(r.enveloppe);
      etat.session = r.session;
      annoncer('Mot de passe changé. Le coffre est rechiffré avec le nouveau.');
      rendre();
    } catch (e) {
      bouton.disabled = false; bouton.textContent = 'Changer le mot de passe';
      montrer(e.code === 'refus' ? 'Le mot de passe actuel est incorrect.' : e.message);
    }
  }

  async function effacerCoffre(f) {
    if (f.confirmation.value.trim().toUpperCase() !== 'EFFACER') {
      f.confirmation.focus();
      f.confirmation.classList.add('invalide');
      return;
    }
    await S.effacer();
    etat.session = null; etat.base = null; etat.derives = {};
    location.hash = '';
    ecranCreation();
  }

  /* ═════════════════════════ délégation des événements ═════════════════════════ */

  app.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || !app.contains(b)) return;
    const a = b.getAttribute('data-action'), id = b.getAttribute('data-id');
    if (a === 'choisir-import') return;                       // c'est l'input fichier, géré au change

    if (a === 'voir-mdp') {
      const i = b.parentNode.querySelector('input');
      i.type = i.type === 'password' ? 'text' : 'password';
      b.setAttribute('aria-label', i.type === 'password' ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
      return;
    }
    if (a === 'oubli') return ecranOubli();
    if (a === 'retour-verrou') return ecranOuverture();
    if (!etat.session) return;

    if (a === 'verrouiller') return verrouiller();
    if (a === 'fermer-message') { const f = b.closest('.flash'); if (f) f.remove(); return; }
    if (a === 'nouveau') {
      const p = M.nouveauProjet('Nouveau projet');
      etat.base.projets.push(p);
      enregistrer();
      location.hash = '#/projet/' + p.id;
      setTimeout(() => { const n = app.querySelector('[data-k="nom"]'); if (n) { n.focus(); n.select(); } }, 60);
      return;
    }
    if (a === 'exemple') return exemple();
    if (a === 'dupliquer') {
      const c = M.dupliquer(projet(id));
      etat.base.projets.push(c);
      enregistrer(); annoncer('Projet dupliqué.'); rendre(); return;
    }
    if (a === 'archiver') {
      const p = projet(id); p.archive = !p.archive; p.modifieLe = new Date().toISOString();
      enregistrer(); rendre(); return;
    }
    if (a === 'supprimer') {
      const p = projet(id);
      if (!window.confirm('Supprimer définitivement « ' + p.nom + ' » ?\n\nSans sauvegarde, il sera perdu.')) return;
      etat.base.projets = etat.base.projets.filter(x => x.id !== id);
      enregistrer(); annoncer('Projet supprimé.'); rendre(); return;
    }
    if (a === 'ajouter-ligne') {
      const r = route(), p = projet(r.id), liste = b.getAttribute('data-l');
      const ligne = { id: M.uid() };
      if (liste === 'depenses') ligne.type = b.getAttribute('data-type') || 'obligatoire';
      p[liste].push(ligne);
      remplacer(M.normaliser(p));
      enregistrer();
      rendre();
      const lig = app.querySelector('[data-id="' + ligne.id + '"][data-k="libelle"]');
      if (lig) lig.focus();
      return;
    }
    if (a === 'retirer-ligne') {
      const r = route(), p = projet(r.id), liste = b.getAttribute('data-l');
      p[liste] = p[liste].filter(x => x.id !== id);
      enregistrer(); rendre(); return;
    }
    if (a === 'sauvegarde') return telechargerSauvegarde();
    if (a === 'annuler-import') { etat.importEnAttente = null; rendre(); return; }
    if (a === 'imprimer') return window.print();
  });

  app.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('[data-action="choisir-import"]')) return choisirImport(el);
    if (!etat.session) return;
    if (el.hasAttribute('data-k')) return majChamp(el);
    if (el.hasAttribute('data-filtre')) {
      const k = el.getAttribute('data-filtre');
      etat.filtre[k] = el.type === 'checkbox' ? el.checked : el.value;
      rendre(); return;
    }
    if (el.hasAttribute('data-reglage')) {
      etat.base.reglages[el.getAttribute('data-reglage')] = Number(el.value);
      etat.base = M.normaliserBase(etat.base);
      enregistrer();
    }
  });

  /* la jauge du changement de mot de passe */
  app.addEventListener('input', e => {
    if (e.target.name === 'nouveau' && e.target.form && e.target.form.getAttribute('data-form') === 'mdp') {
      majJauge('jauge-p', e.target.value);
    }
  });

  app.addEventListener('submit', e => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const k = f.getAttribute('data-form');
    if (k === 'creer') return creerCoffre(f);
    if (k === 'ouvrir') return ouvrirCoffre(f);
    if (k === 'effacer') return effacerCoffre(f);
    if (!etat.session) return;
    if (k === 'import') return importer(f);
    if (k === 'mdp') return changerMotDePasse(f);
  });

  /* ═════════════════════════ démarrage ═════════════════════════ */

  async function demarrer() {
    if (!C.disponible) {
      ecran(html`<div class="marque">🗂️ Mes projets</div><h1 class="ecran-titre">Navigateur non pris en charge</h1>
        <p class="ecran-texte">Le chiffrement a besoin d’une page servie en HTTPS et d’un navigateur récent.</p>
        <p class="ecran-pied"><a href="index.html">← Accueil</a></p>`);
      return;
    }
    try {
      const env = await S.charger();
      if (env) ecranOuverture(); else ecranCreation();
    } catch (e) {
      ecran(html`<div class="marque">🗂️ Mes projets</div><h1 class="ecran-titre">Coffre illisible</h1>
        <p class="ecran-texte">${e.message}</p>
        <form class="pile" data-form="effacer"><label class="champ"><span class="champ-l">Pour repartir de zéro, tape EFFACER</span>
          <input type="text" name="confirmation" autocomplete="off"></label>
          <button type="submit" class="btn btn-danger">Effacer et recommencer</button></form>`);
    }
  }

  /* pour les tests : rien de sensible, seulement de quoi lire l'état d'enregistrement */
  window.__mesProjets = { vider: vider, verrouiller: verrouiller, ouvert: () => !!etat.session };

  demarrer();
})();
