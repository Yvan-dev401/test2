/* Mes projets — le coffre.
 *
 * Le site est public : tout son code est lisible par n'importe qui. Un mot de passe
 * simplement vérifié par le navigateur ne protégerait donc rien — il suffirait d'ouvrir
 * les outils de développement. Ici le mot de passe ne sert pas à « autoriser » : il sert
 * à fabriquer la clé qui chiffre les données. Sans lui, ce qui est enregistré est illisible,
 * et il n'existe aucun moyen de le contourner — y compris pour l'auteur du site.
 *
 *   mot de passe ──PBKDF2-SHA256, 600 000 tours──▶ clé AES-256 ──GCM──▶ bloc chiffré
 *
 * - PBKDF2 rend chaque essai de mot de passe coûteux : c'est ce qui freine qui tenterait de
 *   deviner le mot de passe à partir d'une copie du bloc. Le nombre de tours est inscrit dans
 *   l'enveloppe, pour pouvoir l'augmenter plus tard sans casser les coffres existants.
 * - GCM authentifie autant qu'il chiffre : un mauvais mot de passe, ou un seul octet modifié
 *   dans le bloc, et l'ouverture échoue. Rien de faux ne peut être déchiffré « à moitié ».
 * - La clé n'est jamais exportable : elle vit en mémoire, le temps que le coffre est ouvert.
 *
 * WebCrypto natif, rien d'importé. Tourne aussi sous node pour les tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Coffre = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMAT = 'mes-projets-coffre';
  var VERSION = 1;
  var TOURS = 600000;           // recommandation OWASP pour PBKDF2-HMAC-SHA256
  var LONGUEUR_MIN = 10;

  var cryptoObj = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto
    : (typeof require === 'function' ? require('crypto').webcrypto : null);
  var subtle = cryptoObj && cryptoObj.subtle;

  function ErreurCoffre(code, message) {
    var e = new Error(message);
    e.name = 'ErreurCoffre';
    e.code = code;
    return e;
  }

  /* ───────── encodage ───────── */

  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function versB64(octets) {
    var s = '', i, b = new Uint8Array(octets);
    for (i = 0; i < b.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function depuisB64(texte) {
    var s = atob(texte), b = new Uint8Array(s.length), i;
    for (i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  function aleatoire(n) {
    var b = new Uint8Array(n);
    cryptoObj.getRandomValues(b);
    return b;
  }

  /* L'en-tête est lié au chiffrement : modifier le format ou la version dans l'enveloppe
     fait échouer l'ouverture, au lieu de laisser passer une enveloppe trafiquée. */
  function donneesAssociees() {
    return enc.encode(FORMAT + '/v' + VERSION);
  }

  /* ───────── dérivation et chiffrement ───────── */

  function deriver(motDePasse, sel, tours) {
    return subtle.importKey('raw', enc.encode(motDePasse), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return subtle.deriveKey(
          { name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations: tours },
          base,
          { name: 'AES-GCM', length: 256 },
          false,                                   // jamais exportable
          ['encrypt', 'decrypt']);
      });
  }

  /** Scelle des données avec une clé déjà dérivée. Un vecteur neuf à chaque fois : deux
   *  enregistrements identiques ne produisent jamais le même bloc. */
  function sceller(session, donnees) {
    var iv = aleatoire(12);
    var clair = enc.encode(JSON.stringify(donnees));
    return subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: donneesAssociees() },
      session.cle, clair)
      .then(function (chiffre) {
        return {
          format: FORMAT,
          v: VERSION,
          kdf: { algo: 'PBKDF2-SHA256', tours: session.tours, sel: versB64(session.sel) },
          aes: { algo: 'AES-256-GCM', iv: versB64(iv), donnees: versB64(chiffre) },
          scelleLe: new Date().toISOString()
        };
      });
  }

  /** Crée un coffre neuf. Rend la session (à garder en mémoire) et la première enveloppe. */
  function creer(motDePasse, donnees, tours) {
    var verdict = solidite(motDePasse);
    if (!verdict.acceptable) return Promise.reject(ErreurCoffre('faible', verdict.message));
    var sel = aleatoire(16);
    tours = tours || TOURS;
    return deriver(motDePasse, sel, tours).then(function (cle) {
      var session = { cle: cle, sel: sel, tours: tours };
      return sceller(session, donnees).then(function (enveloppe) {
        return { session: session, enveloppe: enveloppe };
      });
    });
  }

  function verifierEnveloppe(e) {
    if (!e || e.format !== FORMAT) throw ErreurCoffre('format', 'Ce fichier n’est pas un coffre Mes projets.');
    if (e.v !== VERSION) throw ErreurCoffre('version', 'Ce coffre vient d’une version que cette page ne sait pas lire.');
    if (!e.kdf || !e.aes || !e.kdf.sel || !e.aes.iv || !e.aes.donnees || !(e.kdf.tours > 0)) {
      throw ErreurCoffre('format', 'Le coffre est incomplet ou abîmé.');
    }
  }

  /** Ouvre un coffre. Un mauvais mot de passe et un coffre altéré échouent de la même
   *  façon : GCM ne permet pas de distinguer les deux, et c'est voulu. */
  function ouvrir(enveloppe, motDePasse) {
    try { verifierEnveloppe(enveloppe); } catch (e) { return Promise.reject(e); }
    var sel = depuisB64(enveloppe.kdf.sel);
    var tours = enveloppe.kdf.tours;
    return deriver(motDePasse, sel, tours).then(function (cle) {
      return subtle.decrypt(
        { name: 'AES-GCM', iv: depuisB64(enveloppe.aes.iv), additionalData: donneesAssociees() },
        cle, depuisB64(enveloppe.aes.donnees))
        .then(function (clair) {
          return { session: { cle: cle, sel: sel, tours: tours }, donnees: JSON.parse(dec.decode(clair)) };
        }, function () {
          throw ErreurCoffre('refus', 'Mot de passe incorrect, ou coffre altéré.');
        });
    });
  }

  /* ───────── solidité du mot de passe ─────────
     Une estimation, pas une garantie : elle écarte les mots de passe courts et répétitifs,
     et pousse vers la phrase de passe, qui est à la fois longue et facile à retenir. */

  var COURANTS = ['motdepasse', 'password', 'azerty', 'qwerty', '123456', 'soleil', 'bonjour',
    'madagascar', 'antananarivo', 'admin', 'projet', 'projets', 'iloveyou'];

  function solidite(mdp) {
    mdp = String(mdp || '');
    var classes = 0, pool = 0;
    if (/[a-z]/.test(mdp)) { classes++; pool += 26; }
    if (/[A-Z]/.test(mdp)) { classes++; pool += 26; }
    if (/[0-9]/.test(mdp)) { classes++; pool += 10; }
    if (/[^a-zA-Z0-9]/.test(mdp)) { classes++; pool += 33; }
    var bits = mdp.length && pool ? mdp.length * Math.log(pool) / Math.LN2 : 0;
    var bas = mdp.toLowerCase().replace(/[^a-z0-9]/g, '');
    var courant = COURANTS.some(function (c) { return bas.indexOf(c) >= 0; });
    var repete = /(.)\1{3,}/.test(mdp) || /^(.{1,3})\1+$/.test(mdp);
    var suite = /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|azer)/i.test(mdp);
    if (courant || repete || suite) bits = Math.min(bits, 28);
    var mots = mdp.trim().split(/[\s\-_.]+/).filter(function (m) { return m.length >= 3; }).length;

    var score, message;
    if (mdp.length < LONGUEUR_MIN) {
      score = 0;
      message = 'Au moins ' + LONGUEUR_MIN + ' caractères. Une phrase de quatre mots fait mieux qu’un mot compliqué.';
    } else if (courant || repete || suite) {
      score = 1;
      message = 'Contient un mot ou une suite trop courants : c’est la première chose qu’on essaie.';
    } else if (bits < 50) {
      score = 1;
      message = 'Encore faible. Allonge-le : ajoute un ou deux mots.';
    } else if (bits < 65) {
      score = 2;
      message = 'Correct. Quelques caractères de plus le rendraient solide.';
    } else if (bits < 85 && mots < 4) {
      score = 3;
      message = 'Solide.';
    } else {
      score = 4;
      message = 'Très solide.';
    }
    return { score: score, bits: Math.round(bits), acceptable: score >= 2, message: message };
  }

  return {
    FORMAT: FORMAT, VERSION: VERSION, TOURS: TOURS, LONGUEUR_MIN: LONGUEUR_MIN,
    creer: creer, ouvrir: ouvrir, sceller: sceller, solidite: solidite,
    verifierEnveloppe: verifierEnveloppe, disponible: !!subtle
  };
});
