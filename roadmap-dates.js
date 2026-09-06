/* Replanification des dates de roadmap.
   Les jours d'une roadmap sont strictement consécutifs : la date du jour de rang n vaut
   « date de départ + n jours ». Il suffit donc de déplacer l'ancre pour redater tout le
   parcours. L'ancre est mémorisée par page dans localStorage. */

(function () {
  'use strict';

  var JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  var JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function iso(date) {
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  function fromIso(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
    if (!m) return null;
    var date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(date.getTime()) ? null : date;
  }

  function addDays(date, n) {
    var out = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    out.setDate(out.getDate() + n);
    return out;
  }

  function midnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  window.RoadmapDates = {

    /** key : clé localStorage propre à la page · defaultStart : 'AAAA-MM-JJ' du jour 1 d'origine
     *  totalDays : nombre de jours de la roadmap · progressKey : clé de la progression
     *  phaseNames : phases de CETTE roadmap, seules à effacer (deux pages mandarin partagent
     *  la même clé de progression). */
    init: function (options) {
      this.key = options.key;
      this.progressKey = options.progressKey;
      this.phaseNames = options.phaseNames || [];
      // defaultStart absent : la roadmap est purement relative tant qu'aucune date n'est choisie.
      this.defaultStart = options.defaultStart ? fromIso(options.defaultStart) : null;
      this.totalDays = options.totalDays;
      return this;
    },

    /** Date de départ courante : l'ancre enregistrée, sinon celle d'origine (parfois nulle). */
    start: function () {
      var saved = null;
      try { saved = fromIso(localStorage.getItem(this.key)); } catch (e) { /* mode privé */ }
      return saved || this.defaultStart;
    },

    hasStart: function () {
      return this.start() !== null;
    },

    isCustom: function () {
      var current = this.start();
      if (!current) return false;
      return !this.defaultStart || iso(current) !== iso(this.defaultStart);
    },

    dateFor: function (index) {
      var current = this.start();
      return current ? addDays(current, index) : null;
    },

    /** Intervalle de jours 1-based → « 7–20 septembre ». */
    dayRange: function (fromDay, toDay) {
      return this.weekRange(this.dateFor(fromDay - 1), this.dateFor(toDay - 1));
    },

    lastDate: function () {
      return this.dateFor(this.totalDays - 1);
    },

    /** « Mar 21 » — même format que les libellés d'origine. */
    dayLabel: function (date) {
      return JOURS[date.getDay()] + ' ' + date.getDate();
    },

    /** « 21–27 juillet » ou « 28 juillet – 3 août » selon que la semaine change de mois. */
    weekRange: function (first, last) {
      if (first.getMonth() === last.getMonth()) {
        return first.getDate() + '–' + last.getDate() + ' ' + MOIS[last.getMonth()];
      }
      return first.getDate() + ' ' + MOIS[first.getMonth()] +
        ' – ' + last.getDate() + ' ' + MOIS[last.getMonth()];
    },

    /** « 21 juillet 2026 » */
    formatLong: function (date) {
      return date.getDate() + ' ' + MOIS[date.getMonth()] + ' ' + date.getFullYear();
    },

    /** « mardi 21 juillet 2026 » */
    formatFull: function (date) {
      return JOURS_LONGS[date.getDay()] + ' ' + this.formatLong(date);
    },

    /** « octobre 2026 » */
    formatMonth: function (date) {
      return MOIS[date.getMonth()] + ' ' + date.getFullYear();
    },

    setStart: function (date) {
      try {
        if (date) localStorage.setItem(this.key, iso(date));
        else localStorage.removeItem(this.key);
      } catch (e) { /* quota / mode privé : l'affichage reste correct pour la session */ }
    },

    /** N'efface que les phases de cette roadmap, pour ne pas toucher à une autre page
     *  qui partagerait la même clé de progression. */
    clearProgress: function () {
      if (!this.progressKey) return;
      try {
        var saved = JSON.parse(localStorage.getItem(this.progressKey) || '{}');
        this.phaseNames.forEach(function (name) { delete saved[name]; });
        if (Object.keys(saved).length) {
          localStorage.setItem(this.progressKey, JSON.stringify(saved));
        } else {
          localStorage.removeItem(this.progressKey);
        }
      } catch (e) { /* idem */ }
    },

    /** Insère la barre « Départ / Replanifier » et son panneau dans le conteneur donné.
     *  onApply() est appelé après chaque changement d'ancre pour reconstruire la page. */
    mountPanel: function (container, handlers) {
      var self = this;
      var opts = handlers || {};
      var texts = {
        empty: opts.emptyText || 'Aucune date de départ : le plan est affiché en jours relatifs.',
        openEmpty: opts.openEmptyLabel || 'Planifier les dates',
        open: opts.openLabel || 'Replanifier',
        reset: opts.resetLabel || "Dates d'origine"
      };
      container.innerHTML = '';
      container.className = 'resched';

      // ── barre de résumé
      var summary = el('div', 'resched-bar');
      var info = el('div', 'resched-info');
      summary.appendChild(info);

      var openBtn = el('button', 'resched-btn resched-btn-main', texts.open);
      openBtn.type = 'button';
      summary.appendChild(openBtn);
      container.appendChild(summary);

      // ── panneau
      var panel = el('div', 'resched-panel');
      panel.hidden = true;

      var intro = el('p', 'resched-help',
        'Choisis la date du jour 1 : tous les jours suivants seront recalés à la suite.');
      panel.appendChild(intro);

      var row = el('div', 'resched-row');
      var input = document.createElement('input');
      input.type = 'date';
      input.className = 'resched-date';
      input.setAttribute('aria-label', 'Date du premier jour');
      row.appendChild(input);

      var todayBtn = el('button', 'resched-btn', "Commencer aujourd'hui");
      todayBtn.type = 'button';
      row.appendChild(todayBtn);
      panel.appendChild(row);

      var keepLabel = el('label', 'resched-keep');
      var keep = document.createElement('input');
      keep.type = 'checkbox';
      keep.checked = true;
      keepLabel.appendChild(keep);
      keepLabel.appendChild(document.createTextNode(' Conserver ma progression (jours déjà cochés)'));
      // Sans progression enregistrée (roadmaps 90 jours), l'option n'aurait aucun effet.
      if (opts.keepOption !== false) panel.appendChild(keepLabel);

      var preview = el('p', 'resched-preview');
      panel.appendChild(preview);

      var actions = el('div', 'resched-row');
      var apply = el('button', 'resched-btn resched-btn-main', 'Appliquer');
      apply.type = 'button';
      var reset = el('button', 'resched-btn', texts.reset);
      reset.type = 'button';
      var cancel = el('button', 'resched-btn resched-btn-ghost', 'Annuler');
      cancel.type = 'button';
      actions.appendChild(apply);
      actions.appendChild(reset);
      actions.appendChild(cancel);
      panel.appendChild(actions);

      container.appendChild(panel);

      function updatePreview() {
        var date = fromIso(input.value);
        if (!date) {
          preview.textContent = 'Choisis une date valide.';
          return;
        }
        var end = addDays(date, self.totalDays - 1);
        preview.textContent = 'Jour 1 → ' + self.formatFull(date) +
          ' · dernier jour (n° ' + self.totalDays + ') → ' + self.formatFull(end) + '.';
      }

      function refreshSummary() {
        info.innerHTML = '';
        if (self.hasStart()) {
          info.appendChild(document.createTextNode('🗓️ Départ : '));
          info.appendChild(el('span', 'resched-strong', self.formatFull(self.start())));
          info.appendChild(el('span', 'resched-muted',
            ' — fin : ' + self.formatFull(self.lastDate())));
        } else {
          info.appendChild(document.createTextNode('🗓️ ' + texts.empty));
        }
        reset.hidden = !self.isCustom();
        summary.classList.toggle('resched-custom', self.isCustom());
        if (panel.hidden) {
          openBtn.textContent = self.hasStart() ? texts.open : texts.openEmpty;
        }
      }

      function openPanel(open) {
        panel.hidden = !open;
        openBtn.textContent = open ? 'Fermer'
          : (self.hasStart() ? texts.open : texts.openEmpty);
        if (open) {
          input.value = iso(self.isCustom() && self.start() ? self.start() : midnight(new Date()));
          keep.checked = true;
          updatePreview();
          input.focus();
        }
      }

      function commit(date) {
        if (opts.keepOption !== false && !keep.checked) self.clearProgress();
        self.setStart(date);
        refreshSummary();
        openPanel(false);
        if (handlers && handlers.onApply) handlers.onApply();
      }

      openBtn.addEventListener('click', function () { openPanel(panel.hidden); });
      cancel.addEventListener('click', function () { openPanel(false); });
      input.addEventListener('input', updatePreview);

      todayBtn.addEventListener('click', function () {
        input.value = iso(midnight(new Date()));
        updatePreview();
      });

      apply.addEventListener('click', function () {
        var date = fromIso(input.value);
        if (!date) { window.alert('Choisis une date de départ valide.'); return; }
        var end = addDays(date, self.totalDays - 1);
        var message = 'Replanifier la roadmap ?\n\n' +
          'Jour 1 : ' + self.formatFull(date) + '\n' +
          'Dernier jour : ' + self.formatFull(end) + '\n\n' +
          (opts.keepOption === false ? ''
            : (keep.checked ? 'Ta progression est conservée.'
              : '⚠️ Tous les jours cochés seront remis à zéro.'));
        if (window.confirm(message.trim())) commit(date);
      });

      reset.addEventListener('click', function () {
        var question = self.defaultStart
          ? 'Revenir aux dates d’origine (jour 1 le ' + self.formatFull(self.defaultStart) + ') ?'
          : 'Retirer les dates ? Le plan repassera en jours relatifs.';
        if (window.confirm(question)) {
          self.setStart(null);
          refreshSummary();
          openPanel(false);
          if (handlers && handlers.onApply) handlers.onApply();
        }
      });

      refreshSummary();
      this.refreshSummary = refreshSummary;
    }
  };
})();
