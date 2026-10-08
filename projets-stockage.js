/* Mes projets — où le coffre est rangé.
 *
 * C'EST LE SEUL FICHIER À CHANGER le jour où l'on choisira un stockage distant (JSONBin,
 * Supabase ou autre). Le reste de l'application ne connaît que ces quatre fonctions, toutes
 * asynchrones pour qu'un serveur puisse les remplacer sans rien toucher ailleurs :
 *
 *     charger()            → l'enveloppe chiffrée, ou null s'il n'y a pas encore de coffre
 *     enregistrer(env)     → range l'enveloppe
 *     effacer()            → supprime le coffre de cet emplacement
 *     decrire()            → ce qu'il faut afficher à l'utilisateur sur l'emplacement
 *
 * Ce qui transite ici est TOUJOURS l'enveloppe chiffrée produite par projets-coffre.js,
 * jamais les projets en clair. Un futur serveur ne verra donc que de l'illisible.
 *
 * Aujourd'hui : le stockage du navigateur. Conséquence à connaître — les données restent
 * sur cet appareil. La sauvegarde chiffrée sert à les transporter sur un autre.
 */
(function (root) {
  'use strict';

  var CLE = 'mes-projets:coffre:v1';

  function lire() {
    try { return localStorage.getItem(CLE); } catch (e) { return null; }
  }

  root.Stockage = {
    nom: 'Stockage du navigateur',

    charger: function () {
      return new Promise(function (ok, ko) {
        var brut = lire();
        if (!brut) return ok(null);
        try { ok(JSON.parse(brut)); } catch (e) { ko(new Error('Le coffre enregistré est illisible.')); }
      });
    },

    enregistrer: function (enveloppe) {
      return new Promise(function (ok, ko) {
        try {
          localStorage.setItem(CLE, JSON.stringify(enveloppe));
          ok();
        } catch (e) {
          /* quota plein ou navigation privée : on le dit, on ne fait pas semblant */
          ko(new Error('Le navigateur refuse d’enregistrer (stockage plein ou navigation privée).'));
        }
      });
    },

    effacer: function () {
      return new Promise(function (ok) {
        try { localStorage.removeItem(CLE); } catch (e) { /* rien à effacer */ }
        ok();
      });
    },

    decrire: function () {
      var brut = lire();
      return {
        type: 'local',
        titre: 'Sur cet appareil uniquement',
        detail: 'Le coffre est rangé dans ce navigateur. Il n’apparaît pas sur tes autres ' +
          'appareils : pour l’y retrouver, télécharge une sauvegarde et importe-la là-bas.',
        taille: brut ? brut.length : 0
      };
    }
  };
})(typeof self !== 'undefined' ? self : this);
