/* Lexique des pages business — explication dépliable sur place.
 *
 * Le lexique en fin de page est la SOURCE UNIQUE : ce fichier ne contient
 * aucune définition, il va lire celles qui sont déjà dans le document. Rien
 * n'est donc écrit deux fois, et la page reste juste sans JavaScript — les
 * termes sont alors de simples liens vers le lexique.
 */
(function () {
  'use strict';

  function init() {
    var entrees = {};
    Array.prototype.forEach.call(document.querySelectorAll('.lex-entry'), function (e) {
      entrees[e.id.replace(/^lex-/, '')] = e;
    });
    var termes = document.querySelectorAll('a.lex[data-lex]');
    if (!termes.length) return;

    var manquants = [];
    var n = 0;

    /* Où poser le panneau. Un <div> ne peut pas suivre un <li>, et l'insérer
       au milieu d'une grille casserait la mise en page : on choisit donc selon
       le contexte plutôt qu'aveuglément. */
    function hote(el) {
      /* dans un tableau, il n'existe aucun endroit valide où poser un <div> :
         le terme y reste un simple lien vers le lexique */
      if (el.closest('table')) return null;
      var k = el.closest('.kpi');
      if (k) return { node: k.closest('.kpis') || k, mode: 'after' };
      /* un titre de section vit dans une boîte flex : le panneau se pose après
         elle, sinon il se retrouve aligné à côté du titre */
      var h = el.closest('.sec-h');
      if (h) return { node: h, mode: 'after' };
      var p = el.closest('p, h3, h4');
      if (p) return { node: p, mode: 'after' };
      var li = el.closest('li');
      if (li) return { node: li, mode: 'in' };
      var b = el.closest('.block, .risk, .phase, .key, .note, .warn');
      if (b) return { node: b, mode: 'in' };
      return null;
    }

    function fermer(btn) {
      var p = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', 'false');
      if (p) p.hidden = true;
    }

    Array.prototype.forEach.call(termes, function (lien) {
      var cle = lien.getAttribute('data-lex');
      var entree = entrees[cle];
      if (!entree) { manquants.push(cle); return; }

      var h = hote(lien);
      if (!h) return;

      var id = 'lexp-' + cle + '-' + (++n);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lex-q';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', id);
      btn.setAttribute('aria-label', 'Ce que veut dire : ' + lien.textContent.trim());
      btn.textContent = '?';
      lien.insertAdjacentElement('afterend', btn);

      var panneau = document.createElement('div');
      panneau.className = 'lex-panel';
      panneau.id = id;
      panneau.hidden = true;
      var titre = entree.querySelector('h3');
      var html = '<p class="lex-titre">' + (titre ? titre.innerHTML : cle) + '</p>';
      Array.prototype.forEach.call(entree.querySelectorAll('.lex-def, .lex-calc, .lex-ex, .lex-piege'),
        function (p) { html += p.outerHTML; });
      html += '<a class="lex-voir" href="#lex-' + cle + '">Voir dans le lexique ↓</a>';
      panneau.innerHTML = html;

      if (h.mode === 'after') h.node.insertAdjacentElement('afterend', panneau);
      else h.node.appendChild(panneau);

      function bascule(e) {
        e.preventDefault();
        var ouvert = btn.getAttribute('aria-expanded') === 'true';
        if (ouvert) { fermer(btn); return; }
        btn.setAttribute('aria-expanded', 'true');
        panneau.hidden = false;
      }
      btn.addEventListener('click', bascule);
      /* le lien reste un lien vers le lexique sans JavaScript ; avec, il ouvre
         l'explication sur place, ce qui évite de perdre sa lecture */
      lien.addEventListener('click', bascule);
    });

    if (manquants.length && window.console) {
      console.warn('lexique : terme sans entrée — ' + manquants.join(', '));
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      Array.prototype.forEach.call(
        document.querySelectorAll('.lex-q[aria-expanded="true"]'), fermer);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
