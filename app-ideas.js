/* Rendu partagé du hub App Ideas et des pages de niveau.
   Les données viennent de app-ideas-data.js (window.APP_IDEAS). */

(function () {
  'use strict';

  var DATA = window.APP_IDEAS;
  var STORAGE_KEY = 'app-ideas-progress';

  if (!DATA) {
    document.getElementById('root').textContent =
      'Données indisponibles : app-ideas-data.js n’a pas pu être chargé.';
    return;
  }

  var TIERS = {};
  DATA.tiers.forEach(function (t) { TIERS[t.id] = t; });

  // ─────────────────────────────── progression ───────────────────────────────

  var progress = read();

  function read() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
    catch (e) { /* quota / mode privé : la page reste utilisable */ }
  }

  function ticked(slug, kind) {
    var entry = progress[slug];
    return (entry && entry[kind]) || [];
  }

  function isTicked(slug, kind, index) {
    return ticked(slug, kind).indexOf(index) !== -1;
  }

  function setTicked(slug, kind, index, on) {
    var entry = progress[slug] || (progress[slug] = {});
    var list = entry[kind] || (entry[kind] = []);
    var at = list.indexOf(index);
    if (on && at === -1) list.push(index);
    if (!on && at !== -1) list.splice(at, 1);
    entry[kind] = list.sort(function (a, b) { return a - b; });
    var empty = (!entry.s || !entry.s.length) && (!entry.b || !entry.b.length);
    if (empty) delete progress[slug];
    save();
  }

  function setAll(project, on) {
    var entry = progress[project.slug] || (progress[project.slug] = {});
    entry.s = on ? project.stories.map(function (_, i) { return i; }) : [];
    entry.b = on ? project.bonus.map(function (_, i) { return i; }) : [];
    save();
  }

  /** Avancement d'un projet : les user stories font foi, les bonus sont un plus. */
  function stat(project) {
    var s = ticked(project.slug, 's').length;
    var b = ticked(project.slug, 'b').length;
    var total = project.stories.length;
    return {
      stories: s,
      bonus: b,
      total: total,
      pct: total ? Math.round((s / total) * 100) : 0,
      complete: total > 0 && s >= total,
      started: s + b > 0
    };
  }

  // ──────────────────────────────── utilitaires ───────────────────────────────

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function bar(pct, extraClass) {
    var track = el('div', 'bar' + (extraClass ? ' ' + extraClass : ''));
    var fill = el('div', 'bar-fill');
    fill.style.width = pct + '%';
    track.appendChild(fill);
    return track;
  }

  function md(html, cls) {
    var node = el('div', 'md' + (cls ? ' ' + cls : ''));
    node.innerHTML = html;
    node.querySelectorAll('a[href]').forEach(function (a) {
      a.target = '_blank';
      a.rel = 'noopener';
    });
    return node;
  }

  function normalize(text) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function plural(n, one, many) {
    return n + ' ' + (n > 1 ? many : one);
  }

  // ──────────────────────────────────── hub ───────────────────────────────────

  function renderHub() {
    var root = document.getElementById('root');
    var statsBox = document.getElementById('stats');
    var cards = [];

    var totals = {
      projects: DATA.projects.length,
      stories: DATA.projects.reduce(function (n, p) { return n + p.stories.length; }, 0)
    };

    // Bandeau de statistiques
    var tiles = [
      { id: 'done', label: 'Projets terminés' },
      { id: 'started', label: 'Projets commencés' },
      { id: 'stories', label: 'User stories cochées' }
    ].map(function (t) {
      var box = el('div', 'stat');
      var val = el('div', 'stat-val', '—');
      val.id = 'stat-' + t.id;
      box.appendChild(val);
      box.appendChild(el('div', 'stat-lbl', t.label));
      statsBox.appendChild(box);
      return val;
    });
    var globalBar = bar(0, 'bar-lg');
    statsBox.parentNode.insertBefore(globalBar, statsBox.nextSibling);

    // Une section par niveau
    DATA.tiers.forEach(function (tier) {
      var list = DATA.projects.filter(function (p) { return p.tier === tier.id; });
      var block = el('div', 'tier-block t-' + tier.id);
      block.dataset.tier = tier.id;

      var head = el('div', 'tier-head');
      head.appendChild(el('h2', null, tier.label));
      head.appendChild(el('span', 'count', plural(list.length, 'projet', 'projets')));
      var open = el('a', null, 'Ouvrir la page →');
      open.href = tier.page;
      head.appendChild(open);
      block.appendChild(head);
      block.appendChild(el('p', 'tier-desc', tier.desc));

      var grid = el('div', 'grid');
      list.forEach(function (project) {
        var card = el('a', 'pcard');
        card.href = tier.page + '#' + project.slug;
        card.dataset.slug = project.slug;
        card.dataset.search = normalize(project.title);

        card.appendChild(el('div', 'pcard-title', project.title));
        var meta = el('div', 'pcard-meta');
        meta.appendChild(el('span', null, plural(project.stories.length, 'story', 'stories')));
        if (project.bonus.length) {
          meta.appendChild(el('span', null, plural(project.bonus.length, 'bonus', 'bonus')));
        }
        var state = el('span', 'check');
        meta.appendChild(state);
        card.appendChild(meta);
        card.appendChild(bar(0));

        grid.appendChild(card);
        cards.push({ project: project, node: card, state: state, tier: tier.id });
      });

      block.appendChild(grid);
      block.appendChild(el('p', 'empty', 'Aucun projet ne correspond à cette recherche.'));
      block.lastChild.style.display = 'none';
      root.appendChild(block);
    });

    // Bloc « Reprendre »
    var resume = el('div', 'tier-block');
    var resumeHead = el('div', 'tier-head');
    resumeHead.appendChild(el('h2', null, '▶ Reprendre'));
    resume.appendChild(resumeHead);
    var resumeGrid = el('div', 'grid');
    resume.appendChild(resumeGrid);
    root.insertBefore(resume, root.firstChild);

    function refresh() {
      var doneCount = 0, startedCount = 0, storiesDone = 0;
      var inProgress = [];

      cards.forEach(function (entry) {
        var s = stat(entry.project);
        if (s.complete) doneCount++;
        if (s.started && !s.complete) inProgress.push({ entry: entry, stat: s });
        if (s.started) startedCount++;
        storiesDone += s.stories;

        entry.node.classList.toggle('done', s.complete);
        entry.node.querySelector('.bar-fill').style.width = s.pct + '%';
        entry.state.textContent = s.complete ? '✓ terminé' : (s.started ? s.pct + '%' : '');
      });

      tiles[0].textContent = doneCount + ' / ' + totals.projects;
      tiles[1].textContent = String(startedCount);
      tiles[2].textContent = storiesDone + ' / ' + totals.stories;
      globalBar.querySelector('.bar-fill').style.width =
        (totals.stories ? (storiesDone / totals.stories) * 100 : 0) + '%';

      resumeGrid.innerHTML = '';
      inProgress
        .sort(function (a, b) { return b.stat.pct - a.stat.pct; })
        .slice(0, 6)
        .forEach(function (item) {
          var tier = TIERS[item.entry.project.tier];
          var card = el('a', 'pcard t-' + tier.id);
          card.href = tier.page + '#' + item.entry.project.slug;
          card.appendChild(el('div', 'pcard-title', item.entry.project.title));
          var meta = el('div', 'pcard-meta');
          meta.appendChild(el('span', null, tier.label));
          meta.appendChild(el('span', null, item.stat.stories + ' / ' + item.stat.total));
          card.appendChild(meta);
          card.appendChild(bar(item.stat.pct));
          resumeGrid.appendChild(card);
        });
      hasInProgress = inProgress.length > 0;
      updateResume();
    }

    // Recherche + filtres par niveau
    var search = document.getElementById('search');
    var activeTier = 'all';
    var hasInProgress = false;

    /** « Reprendre » n'a de sens que sur la vue complète, sans recherche ni filtre. */
    function updateResume() {
      var neutral = !search.value.trim() && activeTier === 'all';
      resume.style.display = (hasInProgress && neutral) ? '' : 'none';
    }

    function applyFilters() {
      var query = normalize(search.value.trim());
      var visible = {};
      cards.forEach(function (entry) {
        var ok = (activeTier === 'all' || entry.tier === activeTier) &&
          (!query || entry.node.dataset.search.indexOf(query) !== -1);
        entry.node.style.display = ok ? '' : 'none';
        if (ok) visible[entry.tier] = true;
      });
      DATA.tiers.forEach(function (tier) {
        var block = root.querySelector('.tier-block[data-tier="' + tier.id + '"]');
        var shown = activeTier === 'all' || activeTier === tier.id;
        block.style.display = shown ? '' : 'none';
        block.querySelector('.empty').style.display = visible[tier.id] ? 'none' : '';
      });
      updateResume();
    }

    search.addEventListener('input', applyFilters);

    var chipBox = document.getElementById('chips');
    [{ id: 'all', label: 'Tous les niveaux' }].concat(DATA.tiers.map(function (t) {
      return { id: t.id, label: t.label };
    })).forEach(function (option, index) {
      var chip = el('button', 'chip' + (index === 0 ? ' on' : ''), option.label);
      chip.type = 'button';
      chip.addEventListener('click', function () {
        activeTier = option.id;
        chipBox.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('on'); });
        chip.classList.add('on');
        applyFilters();
      });
      chipBox.appendChild(chip);
    });

    refresh();
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY) { progress = read(); refresh(); }
    });
  }

  // ─────────────────────────────── page de niveau ─────────────────────────────

  function renderTier(tierId) {
    var tier = TIERS[tierId];
    var list = DATA.projects.filter(function (p) { return p.tier === tierId; });
    var root = document.getElementById('root');
    var toc = document.getElementById('toc');
    var entries = [];

    document.body.classList.add('t-' + tierId);
    document.getElementById('tier-desc').textContent = tier.desc;

    list.forEach(function (project, index) {
      var section = el('section', 'proj');
      section.id = project.slug;
      section.dataset.search = normalize(project.title);

      var head = el('div', 'proj-head');
      head.setAttribute('role', 'button');
      head.tabIndex = 0;
      head.appendChild(el('span', 'proj-num', String(index + 1).padStart(2, '0')));
      head.appendChild(el('span', 'proj-title', project.title));
      var pct = el('span', 'proj-pct', '');
      head.appendChild(pct);
      head.appendChild(el('span', 'proj-chevron', '▾'));
      section.appendChild(head);

      var headbar = el('div', 'proj-headbar');
      headbar.appendChild(bar(0));
      section.appendChild(headbar);

      var body = el('div', 'proj-body');
      section.appendChild(body);

      var entry = {
        project: project, section: section, body: body, pct: pct,
        fill: headbar.querySelector('.bar-fill'), built: false, tocLink: null
      };
      entries.push(entry);

      function toggle() {
        if (!entry.built) { buildBody(entry); entry.built = true; }
        section.classList.toggle('open');
      }
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
      entry.open = function () {
        if (!entry.built) { buildBody(entry); entry.built = true; }
        section.classList.add('open');
      };

      root.appendChild(section);

      var link = el('a', null, project.title);
      link.href = '#' + project.slug;
      toc.appendChild(link);
      entry.tocLink = link;
    });

    /** Le corps d'une fiche n'est construit qu'à la première ouverture. */
    function buildBody(entry) {
      var project = entry.project;
      var body = entry.body;

      if (project.intro) body.appendChild(md(project.intro));

      project.extra.forEach(function (section) {
        body.appendChild(el('h3', null, section.title));
        body.appendChild(md(section.html));
      });

      appendChecklist(body, project, 's', 'User stories', project.storyNotes);
      if (project.bonus.length) {
        appendChecklist(body, project, 'b', 'Bonus', project.bonusNotes);
      }
      if (project.links) {
        body.appendChild(el('h3', null, 'Ressources utiles'));
        body.appendChild(md(project.links));
      }
      if (project.examples) {
        body.appendChild(el('h3', null, 'Exemples de réalisations'));
        body.appendChild(md(project.examples));
      }

      var actions = el('div', 'proj-actions');
      var all = el('button', 'btn', 'Tout cocher');
      all.type = 'button';
      all.addEventListener('click', function () {
        setAll(project, true);
        syncBoxes(entry);
        refresh();
      });
      var none = el('button', 'btn', 'Réinitialiser');
      none.type = 'button';
      none.addEventListener('click', function () {
        setAll(project, false);
        syncBoxes(entry);
        refresh();
      });
      var source = el('a', 'btn', 'Voir la fiche d’origine ↗');
      source.href = DATA.source + '/blob/master/Projects';
      source.target = '_blank';
      source.rel = 'noopener';
      actions.appendChild(all);
      actions.appendChild(none);
      actions.appendChild(source);
      body.appendChild(actions);
    }

    function appendChecklist(body, project, kind, title, notes) {
      var items = kind === 's' ? project.stories : project.bonus;
      body.appendChild(el('h3', null, title));
      if (notes) body.appendChild(md(notes));

      var group = null;
      items.forEach(function (item, index) {
        if (item.group && item.group !== group) {
          group = item.group;
          body.appendChild(el('div', 'group-lbl', item.group));
        }
        var label = el('label', 'story' + (kind === 'b' ? ' story-bonus' : ''));
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = isTicked(project.slug, kind, index);
        box.dataset.kind = kind;
        box.dataset.index = index;
        label.classList.toggle('checked', box.checked);
        label.appendChild(box);
        label.appendChild(md(item.html));
        box.addEventListener('change', function () {
          setTicked(project.slug, kind, index, box.checked);
          label.classList.toggle('checked', box.checked);
          refresh();
        });
        body.appendChild(label);
      });
    }

    function syncBoxes(entry) {
      entry.body.querySelectorAll('input[type="checkbox"]').forEach(function (box) {
        var on = isTicked(entry.project.slug, box.dataset.kind, Number(box.dataset.index));
        box.checked = on;
        box.parentNode.classList.toggle('checked', on);
      });
    }

    var headCount = document.getElementById('tier-count');

    function refresh() {
      var done = 0;
      entries.forEach(function (entry) {
        var s = stat(entry.project);
        if (s.complete) done++;
        entry.fill.style.width = s.pct + '%';
        entry.pct.textContent = s.complete ? '✓' : (s.started ? s.pct + '%' : '');
        entry.section.dataset.state = s.complete ? 'done' : (s.started ? 'wip' : 'todo');
        entry.tocLink.classList.toggle('done', s.complete);
      });
      headCount.textContent = done + ' / ' + entries.length + ' projets terminés';
      document.getElementById('tier-bar').querySelector('.bar-fill').style.width =
        (entries.length ? (done / entries.length) * 100 : 0) + '%';
    }

    // Recherche + filtres d'état
    var search = document.getElementById('search');
    var activeState = 'all';
    var emptyMsg = el('p', 'empty', 'Aucun projet ne correspond.');
    emptyMsg.style.display = 'none';
    root.appendChild(emptyMsg);

    function applyFilters() {
      var query = normalize(search.value.trim());
      var shown = 0;
      entries.forEach(function (entry) {
        var state = entry.section.dataset.state;
        var ok = (activeState === 'all' || activeState === state) &&
          (!query || entry.section.dataset.search.indexOf(query) !== -1);
        entry.section.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      emptyMsg.style.display = shown ? 'none' : '';
    }

    search.addEventListener('input', applyFilters);

    var chipBox = document.getElementById('chips');
    [
      { id: 'all', label: 'Tous' },
      { id: 'todo', label: 'À commencer' },
      { id: 'wip', label: 'En cours' },
      { id: 'done', label: 'Terminés' }
    ].forEach(function (option, index) {
      var chip = el('button', 'chip' + (index === 0 ? ' on' : ''), option.label);
      chip.type = 'button';
      chip.addEventListener('click', function () {
        activeState = option.id;
        chipBox.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('on'); });
        chip.classList.add('on');
        applyFilters();
      });
      chipBox.appendChild(chip);
    });

    function openFromHash() {
      var slug = decodeURIComponent(location.hash.replace('#', ''));
      if (!slug) return;
      var target = entries.filter(function (e) { return e.project.slug === slug; })[0];
      if (!target) return;
      target.open();
      target.section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    refresh();
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY) {
        progress = read();
        entries.forEach(function (entry) { if (entry.built) syncBoxes(entry); });
        refresh();
      }
    });
  }

  // ────────────────────────────────── amorçage ────────────────────────────────

  if (document.body.dataset.page === 'hub') {
    renderHub();
  } else {
    renderTier(document.body.dataset.tier);
  }
})();
