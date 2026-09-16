/* Minuteur d'apprentissage, partagé par les pages roadmap de langue.

   Le minuteur est un chronomètre à l'ancienne : il compte le temps réel écoulé depuis
   son démarrage, que la page reste ouverte ou non — on le lance, on va travailler, on
   l'arrête en revenant. Le temps est reversé dans le jour courant toutes les 30 s, donc
   rien n'est perdu en cas de fermeture d'onglet ou de plantage.

   Tout est enregistré par jour dans localStorage :
     { goal: 10800, days: { "2026-09-16": 4320 }, running: { since: <ms> } } */

(function () {
  'use strict';

  var COMMIT_EVERY = 30;        // secondes entre deux reversements dans le jour courant
  var LONG_SESSION = 6 * 3600;  // au-delà, on signale un oubli probable — sans rien décider

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function dayKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  /** Minuit suivant, en passant par +25 h pour rester juste les jours de changement d'heure. */
  function nextMidnight(ms) {
    return startOfDay(new Date(ms + 25 * 3600 * 1000));
  }

  /** « 1:12:34 » */
  function clock(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    return Math.floor(s / 3600) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
  }

  /** « 1 h 12 » · « 45 min » · « 0 min » */
  function human(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    var h = Math.floor(s / 3600);
    var m = Math.floor(s / 60) % 60;
    if (!h) return m + ' min';
    return m ? h + ' h ' + pad(m) : h + ' h';
  }

  var JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  var JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  window.RoadmapTimer = {

    /** key : clé localStorage propre à la page · defaultGoal : objectif en secondes. */
    init: function (options) {
      this.key = options.key;
      this.defaultGoal = options.defaultGoal || 3 * 3600;
      this.state = this.read();
      return this;
    },

    read: function () {
      var state = { goal: this.defaultGoal, days: {}, running: null };
      try {
        var raw = JSON.parse(localStorage.getItem(this.key));
        if (raw && typeof raw === 'object') {
          if (typeof raw.goal === 'number' && raw.goal > 0) state.goal = raw.goal;
          if (raw.days && typeof raw.days === 'object') state.days = raw.days;
          if (raw.running && typeof raw.running.since === 'number') state.running = raw.running;
        }
      } catch (e) { /* mode privé ou données illisibles : on repart à zéro */ }
      return state;
    },

    save: function () {
      try { localStorage.setItem(this.key, JSON.stringify(this.state)); }
      catch (e) { /* quota : l'affichage reste juste pour la session */ }
    },

    add: function (key, seconds) {
      this.state.days[key] = Math.max(0, (this.state.days[key] || 0) + seconds);
      if (!this.state.days[key]) delete this.state.days[key];
    },

    /** Reverse le temps courant dans les jours qu'il traverse. Appelé à chaque
     *  reversement et avant toute lecture, pour que `days` reste la source de vérité. */
    commit: function () {
      var run = this.state.running;
      if (!run) return;
      var now = Date.now();

      // une session à cheval sur minuit est découpée jour par jour
      while (run.since < startOfDay(new Date(now))) {
        var edge = nextMidnight(run.since);
        this.add(dayKey(new Date(run.since)), Math.floor((edge - run.since) / 1000));
        run.since = edge;
      }

      var elapsed = Math.floor((now - run.since) / 1000);
      if (elapsed > 0) {
        this.add(dayKey(new Date(now)), elapsed);
        run.since += elapsed * 1000;
      }
      this.save();
    },

    isRunning: function () {
      return !!this.state.running;
    },

    /** Secondes du jour : ce qui est enregistré, plus la fraction en cours non reversée. */
    today: function () {
      var recorded = this.state.days[dayKey(new Date())] || 0;
      var run = this.state.running;
      if (!run) return recorded;
      var from = Math.max(run.since, startOfDay(new Date()));
      return recorded + Math.max(0, Math.floor((Date.now() - from) / 1000));
    },

    start: function () {
      if (this.state.running) return;
      this.state.running = { since: Date.now() };
      this.save();
    },

    stop: function () {
      if (!this.state.running) return;
      this.commit();
      this.state.running = null;
      this.save();
    },

    /** Correction manuelle, pour rattraper une session oubliée. */
    adjust: function (seconds) {
      this.commit();
      var key = dayKey(new Date());
      var current = this.state.days[key] || 0;
      this.add(key, Math.max(-current, seconds));
      this.save();
    },

    setGoal: function (seconds) {
      this.state.goal = Math.max(60, Math.round(seconds));
      this.save();
    },

    /** Les N derniers jours, du plus ancien au plus récent. */
    recent: function (count) {
      var out = [];
      var base = startOfDay(new Date());
      for (var i = count - 1; i >= 0; i--) {
        var date = new Date(base - i * 86400000);
        var key = dayKey(date);
        out.push({
          date: date,
          key: key,
          seconds: key === dayKey(new Date()) ? this.today() : (this.state.days[key] || 0)
        });
      }
      return out;
    },

    totals: function () {
      var keys = Object.keys(this.state.days);
      var sum = 0;
      for (var i = 0; i < keys.length; i++) sum += this.state.days[keys[i]];
      var run = this.state.running;
      if (run) sum += Math.max(0, Math.floor((Date.now() - run.since) / 1000));
      return { seconds: sum, days: keys.length };
    },

    // ──────────────────────────────── interface ────────────────────────────────

    mount: function (container) {
      var self = this;
      container.innerHTML = '';
      container.className = 'timer';

      var top = el('div', 'timer-top');
      var left = el('div');
      left.appendChild(el('div', 'timer-label', '⏱️ Temps d’apprentissage · aujourd’hui'));
      var clockEl = el('div', 'timer-clock');
      left.appendChild(clockEl);
      top.appendChild(left);

      var goalBox = el('div', 'timer-goal');
      var badge = el('span', 'timer-badge', '🎯 Objectif atteint');
      goalBox.appendChild(badge);
      var goalText = el('div', 'timer-goal-text');
      goalBox.appendChild(goalText);
      top.appendChild(goalBox);
      container.appendChild(top);

      var track = el('div', 'timer-track');
      var fill = el('div', 'timer-fill');
      track.appendChild(fill);
      container.appendChild(track);

      var status = el('p', 'timer-status');
      container.appendChild(status);

      var warn = el('p', 'timer-warn');
      warn.hidden = true;
      container.appendChild(warn);

      var actions = el('div', 'timer-actions');
      var main = el('button', 'timer-btn timer-btn-main timer-toggle');
      main.type = 'button';
      var plus = el('button', 'timer-btn', '+15 min');
      plus.type = 'button';
      var minus = el('button', 'timer-btn', '−15 min');
      minus.type = 'button';
      var goalBtn = el('button', 'timer-btn timer-btn-ghost', 'Objectif…');
      goalBtn.type = 'button';
      goalBtn.setAttribute('aria-expanded', 'false');
      actions.appendChild(main);
      actions.appendChild(plus);
      actions.appendChild(minus);
      actions.appendChild(goalBtn);
      container.appendChild(actions);

      var goalEdit = el('div', 'timer-goal-edit');
      goalEdit.hidden = true;
      var goalLabel = el('label', null, 'Objectif journalier ');
      var goalInput = document.createElement('input');
      goalInput.type = 'number';
      goalInput.className = 'timer-goal-input';
      goalInput.min = '0.5';
      goalInput.max = '12';
      goalInput.step = '0.5';
      goalLabel.appendChild(goalInput);
      goalLabel.appendChild(document.createTextNode(' heures'));
      goalEdit.appendChild(goalLabel);
      var goalApply = el('button', 'timer-btn timer-btn-main', 'Enregistrer');
      goalApply.type = 'button';
      goalEdit.appendChild(goalApply);
      container.appendChild(goalEdit);

      var history = el('div', 'timer-history');
      var histHead = el('div', 'timer-history-head');
      var histTitle = el('span', null, '7 derniers jours');
      var histSum = el('span', 'timer-history-sum');
      histHead.appendChild(histTitle);
      histHead.appendChild(histSum);
      history.appendChild(histHead);
      var histDays = el('div', 'timer-days');
      history.appendChild(histDays);
      var histTotal = el('p', 'timer-total');
      history.appendChild(histTotal);
      container.appendChild(history);

      function renderHistory() {
        var days = self.recent(7);
        histDays.innerHTML = '';
        var sum = 0;
        var max = Math.max(self.state.goal, 1);
        days.forEach(function (day) {
          sum += day.seconds;
          if (day.seconds > max) max = day.seconds;
        });
        days.forEach(function (day, index) {
          var cell = el('div', 'timer-day' + (day.seconds >= self.state.goal ? ' reached' : ''));
          cell.title = JOURS_LONGS[day.date.getDay()] + ' ' + day.date.getDate() + ' ' +
            MOIS[day.date.getMonth()] + ' — ' + human(day.seconds);
          var bar = el('div', 'timer-day-track');
          var barFill = el('div', 'timer-day-fill');
          barFill.style.height = Math.round((day.seconds / max) * 100) + '%';
          bar.appendChild(barFill);
          cell.appendChild(bar);
          cell.appendChild(el('div', 'timer-day-lbl',
            index === days.length - 1 ? 'auj.' : JOURS[day.date.getDay()]));
          histDays.appendChild(cell);
        });
        histSum.textContent = human(sum) + ' · moy. ' + human(Math.round(sum / 7));
        var totals = self.totals();
        histTotal.textContent = totals.days
          ? 'Total enregistré : ' + human(totals.seconds) + ' sur ' +
            totals.days + (totals.days > 1 ? ' jours' : ' jour')
          : 'Rien d’enregistré pour l’instant — lance le minuteur pour commencer.';
      }

      function render() {
        var seconds = self.today();
        var goal = self.state.goal;
        var running = self.isRunning();

        clockEl.textContent = clock(seconds);
        clockEl.classList.toggle('running', running);
        goalText.textContent = 'objectif ' + human(goal);
        badge.classList.toggle('visible', seconds >= goal);

        fill.style.width = Math.min(100, (seconds / goal) * 100) + '%';
        fill.classList.toggle('done', seconds >= goal);

        if (seconds >= goal) {
          var over = seconds - goal;
          status.textContent = over >= 60
            ? 'Objectif atteint, et ' + human(over) + ' de plus. Continue autant que tu veux.'
            : 'Objectif du jour atteint. Tu peux continuer, tout reste compté.';
        } else {
          status.textContent = 'Encore ' + human(goal - seconds) + ' pour atteindre l’objectif.';
        }

        main.textContent = running ? '⏸ Mettre en pause' : '▶ Démarrer';
        main.classList.toggle('timer-btn-stop', running);

        var longRun = running && seconds > LONG_SESSION;
        warn.hidden = !longRun;
        if (longRun) {
          warn.textContent = '⚠️ Le minuteur tourne depuis plus de ' + human(LONG_SESSION) +
            ' aujourd’hui. Si tu as oublié de l’arrêter, mets-le en pause et corrige avec « −15 min ».';
        }

        renderHistory();
      }

      main.addEventListener('click', function () {
        if (self.isRunning()) self.stop(); else self.start();
        render();
      });

      plus.addEventListener('click', function () { self.adjust(900); render(); });
      minus.addEventListener('click', function () { self.adjust(-900); render(); });

      goalBtn.addEventListener('click', function () {
        var open = goalEdit.hidden;
        goalEdit.hidden = !open;
        goalBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          goalInput.value = (self.state.goal / 3600).toFixed(1).replace(/\.0$/, '');
          goalInput.focus();
        }
      });

      goalApply.addEventListener('click', function () {
        var hours = parseFloat(goalInput.value);
        if (!isFinite(hours) || hours <= 0) {
          window.alert('Indique un objectif en heures, par exemple 3.');
          return;
        }
        self.setGoal(hours * 3600);
        goalEdit.hidden = true;
        goalBtn.setAttribute('aria-expanded', 'false');
        render();
      });

      // le temps courant est reversé régulièrement : rien n'est perdu si l'onglet se ferme
      var sinceCommit = 0;
      setInterval(function () {
        if (self.isRunning() && ++sinceCommit >= COMMIT_EVERY) {
          sinceCommit = 0;
          self.commit();
        }
        render();
      }, 1000);

      // une autre page du site a pu modifier le même compteur
      window.addEventListener('storage', function (e) {
        if (e.key === self.key) { self.state = self.read(); render(); }
      });

      self.commit();
      render();
    }
  };
})();
