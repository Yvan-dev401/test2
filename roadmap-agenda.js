/* Export de la roadmap vers l'agenda du téléphone, partagé par les pages roadmap.

   Le site est statique : personne ne peut envoyer une notification à heure fixe. On passe
   donc par l'agenda, qui sait le faire nativement — on fabrique un fichier .ics, tu
   l'importes une fois, et c'est ton téléphone qui sonne ensuite, sur tous les appareils où
   ton agenda est synchronisé, hors ligne et sans compte en plus.

   Les dates viennent de RoadmapDates : l'agenda suit donc la date de départ que tu as
   choisie avec « Replanifier », sans que rien ne soit recopié ici. La durée des séances
   vient de l'objectif de RoadmapTimer.

   Les réglages sont enregistrés dans localStorage sous « roadmap-<slug>-agenda » :
     { heure: "18:00", duree: 10800, avance: 15, repos: true, hebdo: true, veille: true, seq: 3 } */

(function () {
  'use strict';

  var DOMAINE = 'roadmap.local';   // racine des UID : jamais résolue, sert juste d'identifiant

  function pad(n, l) {
    var s = String(n);
    while (s.length < (l || 2)) s = '0' + s;
    return s;
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ───────────────────────── mise en forme ICS (RFC 5545) ─────────────────────────
     Un fichier mal formé est refusé en silence par les agendas : ces quatre fonctions
     sont la partie à ne pas bâcler. */

  /** Nombre d'octets qu'occupe un point de code en UTF-8. Le pliage se compte en octets,
   *  pas en caractères — un « é » en vaut deux, un caractère chinois trois. */
  function octets(cp) {
    if (cp < 0x80) return 1;
    if (cp < 0x800) return 2;
    if (cp < 0x10000) return 3;
    return 4;
  }

  /** Plie une ligne à 75 octets, continuation préfixée d'une espace (qui compte, elle aussi).
   *  On avance par point de code pour ne jamais couper une séquence UTF-8 en deux. */
  function plier(ligne) {
    var out = '', larg = 0, i = 0, cp, ch, n;
    while (i < ligne.length) {
      cp = ligne.codePointAt(i);
      ch = String.fromCodePoint(cp);
      i += ch.length;
      n = octets(cp);
      if (larg + n > 75) { out += '\r\n '; larg = 1; }
      out += ch;
      larg += n;
    }
    return out;
  }

  /** Échappement des valeurs TEXT. L'ordre compte : la contre-oblique d'abord. */
  function esc(texte) {
    return String(texte == null ? '' : texte)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  /** Heure locale flottante : « 20260804T180000 », sans Z ni TZID. C'est 18 h là où tu es,
   *  ce qu'on veut pour une séance d'étude, et ça évite d'embarquer une VTIMEZONE. */
  function flottant(date, heures, minutes) {
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
      'T' + pad(heures) + pad(minutes) + '00';
  }

  function horodatage() {
    var d = new Date();
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  /** « PT3H » · « PT2H30M » · « PT45M » */
  function duree(secondes) {
    var m = Math.max(1, Math.round(secondes / 60));
    var h = Math.floor(m / 60);
    m = m % 60;
    if (h && m) return 'PT' + h + 'H' + m + 'M';
    return h ? 'PT' + h + 'H' : 'PT' + m + 'M';
  }

  /* ───────────────────────── le texte des journées ─────────────────────────
     Les libellés de jour contiennent du HTML : <b>, <i>, et des liens sur la page TOEFL. */

  var zoneDecodage = null;

  function decoder(texte) {
    if (texte.indexOf('&') === -1) return texte;
    if (!zoneDecodage) zoneDecodage = document.createElement('textarea');
    zoneDecodage.innerHTML = texte;
    return zoneDecodage.value;
  }

  /** HTML → texte brut. Les liens gardent leur adresse : elle doit rester utilisable
   *  depuis le téléphone, où l'on n'a pas la page sous les yeux. */
  function plat(html) {
    var s = String(html == null ? '' : html);
    s = s.replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, function (_, url, dedans) {
      var t = decoder(dedans.replace(/<[^>]+>/g, '')).trim();
      return !t || t === url ? url : t + ' (' + url + ')';
    });
    s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d)>/gi, '\n');
    s = s.replace(/<[^>]+>/g, '');
    return decoder(s).replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  }

  /** 37 libellés de jour commencent déjà par 🌿 et 7 par 🎯. On retire le pictogramme du
   *  texte pour le reposer nous-mêmes devant le titre, sans le doubler. Comparaison par
   *  indexOf plutôt que par classe de caractères : une regex sans le drapeau u couperait
   *  ces emojis en deux moitiés de substitut. */
  function nu(texte) {
    var s = String(texte == null ? '' : texte).trim();
    var encore = true;
    while (encore) {
      encore = false;
      ['🎯', '🌿'].forEach(function (m) {
        if (s.indexOf(m) === 0) { s = s.slice(m.length).trim(); encore = true; }
      });
    }
    return s;
  }

  /** Titre court pour la notification, qui n'affiche que quelques mots. On coupe à la
   *  première frontière de sens, sinon au dernier espace avant la limite. */
  function titre(texte) {
    var t = plat(texte);
    var coupe = t.search(/\s[—:]\s|\.\s|\n/);
    if (coupe > 12) t = t.slice(0, coupe);
    t = t.replace(/[\s.:—-]+$/, '');
    if (t.length <= 52) return t;
    var espace = t.lastIndexOf(' ', 49);
    return t.slice(0, espace > 20 ? espace : 49).replace(/[\s,;:]+$/, '') + '…';
  }

  /* ───────────────────────── le module ───────────────────────── */

  window.RoadmapAgenda = {

    /** slug : racine du nom de fichier et des UID · label : préfixe des titres d'événement
     *  phases : les données de la page, déjà annotées d'un _i par jour. */
    init: function (options) {
      this.slug = options.slug;
      this.label = options.label;
      this.phases = options.phases || [];
      this.dates = options.dates || window.RoadmapDates;
      this.timer = options.timer || window.RoadmapTimer;
      this.key = 'roadmap-' + this.slug + '-agenda';
      this.prefs = this.lire();
      return this;
    },

    lire: function () {
      var p = { heure: '18:00', duree: null, avance: 15, repos: true, hebdo: true, veille: true, seq: 0 };
      try {
        var brut = JSON.parse(localStorage.getItem(this.key) || '{}');
        if (/^\d{2}:\d{2}$/.test(brut.heure)) p.heure = brut.heure;
        if (typeof brut.duree === 'number' && brut.duree > 0) p.duree = brut.duree;
        if (typeof brut.avance === 'number' && brut.avance >= 0) p.avance = brut.avance;
        ['repos', 'hebdo', 'veille'].forEach(function (k) {
          if (typeof brut[k] === 'boolean') p[k] = brut[k];
        });
        if (typeof brut.seq === 'number' && brut.seq >= 0) p.seq = Math.floor(brut.seq);
      } catch (e) { /* mode privé : les réglages valent pour la session */ }
      return p;
    },

    ecrire: function () {
      try { localStorage.setItem(this.key, JSON.stringify(this.prefs)); } catch (e) { /* idem */ }
    },

    /** Durée d'une séance, en secondes : le réglage propre à l'agenda, sinon l'objectif
     *  du minuteur de la page — 3 h en allemand et mandarin, 2 h au TOEFL. */
    dureeSeance: function () {
      if (this.prefs.duree) return this.prefs.duree;
      if (this.timer && this.timer.state && this.timer.state.goal) return this.timer.state.goal;
      return 3 * 3600;
    },

    heures: function () { return Number(this.prefs.heure.slice(0, 2)); },
    minutes: function () { return Number(this.prefs.heure.slice(3, 5)); },

    /** Tous les jours de la roadmap, à plat, dans l'ordre. */
    jours: function () {
      var out = [];
      this.phases.forEach(function (ph) {
        ph.weeks.forEach(function (wk) {
          wk.days.forEach(function (day) { out.push({ day: day, semaine: wk, phase: ph }); });
        });
      });
      return out;
    },

    /** Ce que contiendra le fichier, avant de l'écrire : sert aussi à l'aperçu. */
    compte: function () {
      var n = { travail: 0, repos: 0, hebdo: 0, examens: 0 };
      this.jours().forEach(function (j) {
        if (j.day.rest) n.repos++; else n.travail++;
        if (j.day.exam) n.examens++;
      });
      this.phases.forEach(function (ph) { n.hebdo += ph.weeks.length; });
      var total = n.travail + (this.prefs.repos ? n.repos : 0) + (this.prefs.hebdo ? n.hebdo : 0);
      n.total = total;
      return n;
    },

    /* ───────── fabrication du fichier ───────── */

    /** Rendez-vous d'une journée. */
    evenement: function (j, rang, total) {
      var d = this.dates.dateFor(j.day._i);
      var repos = !!j.day.rest;
      var exam = !!j.day.exam;
      var secondes = repos ? 45 * 60 : this.dureeSeance();
      var h = this.heures(), m = this.minutes();

      var marque = exam ? '🎯 ' : (repos ? '🌿 ' : '');
      var sujet = repos ? 'Repos actif' : nu(titre(j.day.t));
      var resume = this.label + ' · J' + rang + ' — ' + marque + sujet;

      var corps = plat(j.day.t);
      var pied = '⏱ ' + (repos ? '45 min' : duree(secondes).replace(/^PT/, '').toLowerCase()
        .replace('h', ' h ').replace('m', ' min').trim()) +
        ' · Jour ' + rang + ' sur ' + total + ' · ' + j.semaine.name;
      if (j.phase && j.phase.name) pied += ' · ' + j.phase.name;

      var lignes = [
        'BEGIN:VEVENT',
        'UID:' + this.slug + '-j' + pad(rang, 3) + '@' + DOMAINE,
        'DTSTAMP:' + horodatage(),
        'DTSTART:' + flottant(d, h, m),
        'DURATION:' + duree(secondes),
        'SEQUENCE:' + this.prefs.seq,
        'TRANSP:OPAQUE',
        'CATEGORIES:' + esc(this.label),
        'SUMMARY:' + esc(resume),
        'DESCRIPTION:' + esc(corps + '\n\n' + pied + (this.lien ? '\n' + this.lien : ''))
      ];
      if (this.lien) lignes.push('URL:' + esc(this.lien));

      lignes = lignes.concat(this.alarme(this.prefs.avance, resume));
      /* Un examen blanc se prépare la veille : deuxième alerte à 20 h le soir d'avant.
         Le décalage se compte depuis le début de l'événement, d'où les 24 h ajoutées. */
      if (exam && this.prefs.veille) {
        var minutesAvant = (h * 60 + m) + (24 - 20) * 60;
        lignes = lignes.concat(
          this.alarme(minutesAvant, 'Demain : ' + resume + ' — prépare tes conditions de test'));
      }
      lignes.push('END:VEVENT');
      return lignes;
    },

    /** Bilan de fin de semaine, juste après la dernière séance de la semaine. */
    evenementHebdo: function (wk, phase, rangSemaine, suivante) {
      var jours = wk.days;
      var dernier = this.dates.dateFor(jours[jours.length - 1]._i);
      var fin = this.heures() * 60 + this.minutes() + Math.round(this.dureeSeance() / 60);
      var h = Math.floor(fin / 60) % 24, m = fin % 60;

      var corps = 'Ce que cette semaine a couvert :\n';
      jours.forEach(function (day) {
        corps += '· ' + day.d + ' — ' + nu(titre(day.t)) + (day.rest ? ' 🌿' : '') + '\n';
      });
      corps += '\nRelis ce que tu as coché, refais ce qui a résisté.';
      if (suivante) {
        corps += '\n\nLa semaine prochaine : ' + suivante.name +
          (suivante.level ? ' (' + suivante.level + ')' : '') + ' — ' + nu(titre(suivante.days[0].t));
      } else {
        corps += '\n\nC’est la dernière semaine du parcours.';
      }
      if (this.lien) corps += '\n' + this.lien;

      var resume = this.label + ' · Bilan ' + wk.name.toLowerCase() +
        (wk.level ? ' (' + wk.level + ')' : '');

      var lignes = [
        'BEGIN:VEVENT',
        'UID:' + this.slug + '-bilan' + pad(rangSemaine, 2) + '@' + DOMAINE,
        'DTSTAMP:' + horodatage(),
        'DTSTART:' + flottant(dernier, h, m),
        'DURATION:PT20M',
        'SEQUENCE:' + this.prefs.seq,
        'TRANSP:TRANSPARENT',
        'CATEGORIES:' + esc(this.label),
        'SUMMARY:' + esc(resume),
        'DESCRIPTION:' + esc(corps)
      ];
      if (this.lien) lignes.push('URL:' + esc(this.lien));
      lignes = lignes.concat(this.alarme(0, resume));
      lignes.push('END:VEVENT');
      return lignes;
    },

    /** C'est cette partie qui déclenche la notification du téléphone. */
    alarme: function (minutesAvant, texte) {
      return [
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:' + esc(texte),
        'TRIGGER:' + (minutesAvant > 0 ? '-PT' + minutesAvant + 'M' : 'PT0S'),
        'END:VALARM'
      ];
    },

    /** Le fichier complet. limite : n'écrire que les N premières journées (fichier d'essai). */
    ics: function (limite) {
      if (!this.dates.hasStart()) return null;
      var self = this;
      var tous = this.jours();
      var total = tous.length;
      var lignes = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//roadmap//' + this.slug + '//FR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:' + esc(this.label + ' — roadmap'),
        'X-WR-CALDESC:' + esc('Programme jour par jour, ' + total + ' journées. ' +
          'Réimporte le fichier après une replanification : les rendez-vous se déplacent.')
      ];

      var arret = limite ? Math.min(limite, total) : total;
      tous.forEach(function (j, i) {
        if (i >= arret) return;
        if (j.day.rest && !self.prefs.repos) return;
        lignes = lignes.concat(self.evenement(j, i + 1, total));
      });

      if (this.prefs.hebdo) {
        var rang = 0, plates = [];
        this.phases.forEach(function (ph) {
          ph.weeks.forEach(function (wk) { plates.push({ wk: wk, phase: ph }); });
        });
        plates.forEach(function (p, i) {
          rang++;
          var premier = p.wk.days[0]._i;
          if (premier >= arret) return;
          lignes = lignes.concat(
            self.evenementHebdo(p.wk, p.phase, rang, plates[i + 1] ? plates[i + 1].wk : null));
        });
      }

      lignes.push('END:VCALENDAR');
      return lignes.map(plier).join('\r\n') + '\r\n';
    },

    telecharger: function (limite) {
      var texte = this.ics(limite);
      if (!texte) return false;
      this.prefs.seq++;
      this.ecrire();
      var nom = 'roadmap-' + this.slug + (limite ? '-essai' : '') + '.ics';
      /* type text/calendar : sur iPhone, ouvrir le fichier propose directement l'import. */
      var blob = new Blob([texte], { type: 'text/calendar;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = nom;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    },

    /* ───────── l'interface ───────── */

    mount: function (container) {
      var self = this;
      this.el = container;
      /* l'adresse réelle de la page, pour que le rendez-vous ramène au détail du jour */
      this.lien = (location.protocol === 'http:' || location.protocol === 'https:')
        ? location.href.split('#')[0] : '';

      container.innerHTML = '';
      container.className = 'agenda';

      var bar = el('div', 'agenda-bar');
      var info = el('div', 'agenda-info');
      bar.appendChild(info);
      var openBtn = el('button', 'resched-btn resched-btn-main', 'Créer l’agenda');
      openBtn.type = 'button';
      openBtn.setAttribute('aria-expanded', 'false');
      bar.appendChild(openBtn);
      container.appendChild(bar);

      var panel = el('div', 'agenda-panel');
      panel.hidden = true;

      panel.appendChild(el('p', 'agenda-help',
        'Ton téléphone ne peut pas être prévenu par le site — il est statique, personne n’y ' +
        'envoie rien. C’est ton agenda qui sait sonner à heure fixe : règle ci-dessous, ' +
        'télécharge le fichier, ouvre-le sur ton téléphone, et il s’occupe du reste.'));

      // ── heure et durée
      var l1 = el('div', 'agenda-row');
      l1.appendChild(el('label', 'agenda-lab', 'Je commence à'));
      var heure = document.createElement('input');
      heure.type = 'time';
      heure.className = 'resched-date';
      heure.value = this.prefs.heure;
      heure.setAttribute('aria-label', 'Heure de début des séances');
      l1.appendChild(heure);

      l1.appendChild(el('label', 'agenda-lab', 'pendant'));
      var dur = document.createElement('select');
      dur.className = 'resched-date';
      dur.setAttribute('aria-label', 'Durée d’une séance');
      [[3600, '1 h'], [5400, '1 h 30'], [7200, '2 h'], [9000, '2 h 30'],
      [10800, '3 h'], [12600, '3 h 30'], [14400, '4 h']].forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = String(o[0]);
        opt.textContent = o[1];
        dur.appendChild(opt);
      });
      dur.value = String(this.dureeSeance());
      l1.appendChild(dur);
      panel.appendChild(l1);

      // ── avance du rappel
      var l2 = el('div', 'agenda-row');
      l2.appendChild(el('label', 'agenda-lab', 'Le téléphone sonne'));
      var av = document.createElement('select');
      av.className = 'resched-date';
      av.setAttribute('aria-label', 'Avance du rappel');
      [[0, 'à l’heure pile'], [10, '10 min avant'], [15, '15 min avant'],
      [30, '30 min avant'], [60, '1 h avant']].forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = String(o[0]);
        opt.textContent = o[1];
        av.appendChild(opt);
      });
      av.value = String(this.prefs.avance);
      l2.appendChild(av);
      panel.appendChild(l2);

      // ── ce qu'on met dans l'agenda
      panel.appendChild(el('p', 'agenda-lab agenda-lab-bloc', 'Ce qui entre dans l’agenda'));
      var n = this.compte();

      var fixe = el('div', 'agenda-fixe');
      fixe.appendChild(el('span', 'agenda-puce', '✓'));
      fixe.appendChild(document.createTextNode(
        'Les ' + n.travail + ' jours de travail — toujours inclus'));
      panel.appendChild(fixe);

      function bascule(cle, texte) {
        var lab = el('label', 'resched-keep');
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = self.prefs[cle];
        lab.appendChild(box);
        lab.appendChild(document.createTextNode(' ' + texte));
        panel.appendChild(lab);
        box.addEventListener('change', function () {
          self.prefs[cle] = box.checked;
          self.ecrire();
          apercu();
        });
        return box;
      }

      bascule('repos', 'Les ' + n.repos + ' jours de repos 🌿 — un rappel court, pour garder le fil');
      bascule('hebdo', 'Un bilan en fin de semaine (' + n.hebdo + ' au total)');
      if (n.examens) {
        /* la page mandarin n'en compte qu'un seul */
        bascule('veille', (n.examens > 1
          ? 'Les ' + n.examens + ' examens blancs 🎯'
          : 'L’examen blanc 🎯') + ' — avec une alerte la veille à 20 h');
      }

      var vue = el('p', 'resched-preview');
      panel.appendChild(vue);

      // ── téléchargement
      var actions = el('div', 'agenda-row');
      var dl = el('button', 'resched-btn resched-btn-main', 'Télécharger l’agenda');
      dl.type = 'button';
      var essai = el('button', 'resched-btn', 'Fichier d’essai (3 jours)');
      essai.type = 'button';
      var fermer = el('button', 'resched-btn resched-btn-ghost', 'Fermer');
      fermer.type = 'button';
      actions.appendChild(dl);
      actions.appendChild(essai);
      actions.appendChild(fermer);
      panel.appendChild(actions);

      var mode = el('div', 'agenda-mode');
      mode.appendChild(el('p', 'agenda-mode-t', 'Une fois le fichier téléchargé'));
      var ul = document.createElement('ul');
      [['Téléphone Android', 'envoie-toi le fichier (Drive, Gmail, Messages) puis ouvre-le : Google Agenda propose l’import.'],
      ['iPhone', 'ouvre le fichier depuis Fichiers ou Mail : l’Agenda propose « Tout ajouter ».'],
      ['Ordinateur', 'Google Agenda → Paramètres → Importer et exporter → Importer.']
      ].forEach(function (o) {
        var li = document.createElement('li');
        li.appendChild(el('b', null, o[0] + ' — '));
        li.appendChild(document.createTextNode(o[1]));
        ul.appendChild(li);
      });
      mode.appendChild(ul);
      mode.appendChild(el('p', 'agenda-mode-n',
        'Crée un agenda à part plutôt que de mêler ces rendez-vous aux tiens : tu pourras tout ' +
        'retirer d’un bloc. Et si tu replanifies, retélécharge puis réimporte — les rendez-vous ' +
        'se déplacent au lieu de se dédoubler.'));
      panel.appendChild(mode);

      container.appendChild(panel);

      function apercu() {
        var c = self.compte();
        var fin = self.heures() * 60 + self.minutes() + Math.round(self.dureeSeance() / 60);
        var debut = self.prefs.heure;
        var fh = pad(Math.floor(fin / 60) % 24) + ':' + pad(fin % 60);
        vue.textContent = c.total + ' rendez-vous, de ' + debut + ' à ' + fh +
          ' — premier le ' + self.dates.formatFull(self.dates.dateFor(0)) +
          ', dernier le ' + self.dates.formatFull(self.dates.lastDate()) + '.';
      }

      function resume() {
        var c = self.compte();
        info.innerHTML = '';
        if (!self.dates.hasStart()) {
          info.appendChild(document.createTextNode(
            '📲 Rappels sur ton téléphone — choisis d’abord une date de départ ci-dessus.'));
          openBtn.disabled = true;
          openBtn.classList.add('agenda-btn-off');
          return;
        }
        openBtn.disabled = false;
        openBtn.classList.remove('agenda-btn-off');
        info.appendChild(document.createTextNode('📲 Rappels sur ton téléphone — '));
        info.appendChild(el('span', 'resched-strong', c.total + ' rendez-vous'));
        info.appendChild(el('span', 'resched-muted',
          ' dans ton agenda, du ' + self.dates.formatLong(self.dates.dateFor(0)) +
          ' au ' + self.dates.formatLong(self.dates.lastDate())));
        if (!panel.hidden) apercu();
      }

      function ouvrir(o) {
        panel.hidden = !o;
        openBtn.setAttribute('aria-expanded', o ? 'true' : 'false');
        openBtn.textContent = o ? 'Fermer' : 'Créer l’agenda';
        if (o) apercu();
      }

      openBtn.addEventListener('click', function () {
        if (openBtn.disabled) return;
        ouvrir(panel.hidden);
      });
      fermer.addEventListener('click', function () { ouvrir(false); });

      heure.addEventListener('change', function () {
        if (!/^\d{2}:\d{2}$/.test(heure.value)) { heure.value = self.prefs.heure; return; }
        self.prefs.heure = heure.value;
        self.ecrire();
        apercu();
      });
      dur.addEventListener('change', function () {
        self.prefs.duree = Number(dur.value);
        self.ecrire();
        apercu();
      });
      av.addEventListener('change', function () {
        self.prefs.avance = Number(av.value);
        self.ecrire();
      });

      dl.addEventListener('click', function () { self.telecharger(0); });
      essai.addEventListener('click', function () { self.telecharger(3); });

      this.refresh = resume;
      resume();
      return this;
    },

    /** Appelée après une replanification : les dates de la barre changent. */
    refresh: function () { /* remplacée par mount() ; sans montage, il n'y a rien à faire */ }
  };
})();
