/* Page « Produire ici ce que Madagascar importe » — hypothèses et recalcul.
 *
 * Ce fichier est la source unique des chiffres de la page. Il tourne dans le
 * navigateur, et aussi sous node : le script qui fabrique la page interroge ce
 * même code pour figer les valeurs dans le HTML. Aucun calcul n'est donc écrit
 * deux fois, et la page sans JavaScript affiche exactement ce que le JavaScript
 * recalculerait.
 *
 * Pourquoi des hypothèses modifiables : personne ici ne connaît le prix du sac
 * de ciment à Toamasina cette semaine, ni le droit de douane exact sur l'engrais.
 * Plutôt que d'inventer, la page pose ses hypothèses à découvert et les rend
 * modifiables. Tu relèves les vrais prix, tu les saisis, tout se recalcule.
 *
 * Rien n'est importé : ni bibliothèque, ni requête réseau.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Local = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NB = ' ';           // espace fine insécable, séparateur de milliers
  var STORE = 'business-produire-local:params:v1';

  /* ───────────────────────── les 15 hypothèses ───────────────────────── */

  var PARAMS = [
    // clé, libellé, défaut, unité, min, max, pas, groupe
    ['arUsd', 'Ariary pour 1 $', 4500, 'Ar', 500, 50000, 10, 'import'],
    ['fret', 'Fret et assurance', 12, '% du prix usine', 0, 200, 0.5, 'import'],
    ['droits', 'Droits de douane', 20, '%', 0, 100, 0.5, 'import'],
    ['tva', 'TVA', 20, '%', 0, 100, 0.5, 'import'],
    ['margeImp', 'Marge de l’importateur et du réseau', 35, '%', 0, 300, 1, 'import'],
    ['fobEngrais', 'Engrais NPK, prix usine étranger', 22, '$ / sac 50 kg', 1, 500, 0.5, 'import'],

    ['salaire', 'Salaire mensuel, un ouvrier', 350000, 'Ar', 0, 10000000, 10000, 'prod'],
    ['kwh', 'Électricité', 700, 'Ar / kWh', 0, 20000, 10, 'prod'],
    ['loyer', 'Local ou terrain de production', 450000, 'Ar / mois', 0, 50000000, 10000, 'prod'],
    ['gasoil', 'Gasoil', 5400, 'Ar / L', 0, 100000, 100, 'prod'],

    ['prixPaddy', 'Paddy au producteur', 2000, 'Ar / kg', 0, 100000, 50, 'matieres'],
    ['prixMais', 'Maïs local', 2200, 'Ar / kg', 0, 100000, 50, 'matieres'],
    ['prixTourteau', 'Tourteau protéique', 3800, 'Ar / kg', 0, 100000, 50, 'matieres'],
    ['sacCiment', 'Ciment, sac de 50 kg', 42000, 'Ar', 0, 5000000, 500, 'matieres'],
    ['prixBiomasse', 'Fumier et biomasse, rendus sur site', 90000, 'Ar / t', 0, 10000000, 5000, 'matieres']
  ];

  var GROUPES = [
    ['import', 'La chaîne de l’import',
      'Ce qui sépare le prix sorti d’usine à l’étranger du prix payé au marché. C’est cet écart qui fait la place du producteur local — et ce sont des valeurs que seuls la douane ou un transitaire peuvent te confirmer.'],
    ['prod', 'Ce que coûte produire ici',
      'Les charges que tout atelier supporte, quel que soit le secteur.'],
    ['matieres', 'Les matières premières',
      'Les prix qui commandent la marge de chaque fiche. Relève-les chez ton fournisseur : ce sont eux qui décident si l’affaire tient.']
  ];

  var DEFAULTS = {};
  var SPEC = {};
  PARAMS.forEach(function (x) {
    DEFAULTS[x[0]] = x[2];
    SPEC[x[0]] = { lab: x[1], def: x[2], unite: x[3], min: x[4], max: x[5], pas: x[6], grp: x[7] };
  });

  /* ───────────────────────── mise en forme ───────────────────────── */

  function ar(n) {
    var s = String(Math.round(Math.abs(n)));
    var out = '', i;
    for (i = 0; i < s.length; i++) {
      if (i && (s.length - i) % 3 === 0) out += NB;
      out += s.charAt(i);
    }
    return (n < 0 ? '− ' : '') + out;
  }

  function mAr(n) {
    var v = n / 1000000;
    if (Math.abs(v) >= 1000) return court(v / 1000) + ' Md';
    return court(v) + ' M';
  }

  /** « 2 » plutôt que « 2,00 » quand la décimale n'apporte rien. */
  function court(v) {
    return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : dec(v, 1);
  }

  function dec(n, d) {
    return n.toFixed(d === undefined ? 1 : d).replace('.', ',');
  }

  function pct(n, d) {
    return dec(n, d === undefined ? 0 : d) + ' %';
  }

  function sgn(n) {
    return (n < 0 ? '− ' : '+ ') + ar(Math.abs(n));
  }

  /* ───────────────────────── les cinq fiches ─────────────────────────
     Chaque fiche dit : ce qu'elle achète (invest), ce qu'elle paie tous les mois
     (fixes), le prix auquel elle vend, ce que lui coûte une unité (var), et la
     montée en charge des douze premiers mois. Les fonctions reçoivent d, qui
     porte déjà la chaîne de l'import, pour que tout suive les hypothèses. */

  var FICHES = [
    {
      n: 1, cle: 'depot', palier: 1,
      titre: 'Dépôt d’intrants agricoles',
      court: 'Dépôt d’intrants',
      geste: 'Revendre',
      soustitre: 'Acheter l’engrais importé par palettes auprès du grossiste, le revendre au sac ' +
        'aux riziculteurs et maraîchers de ta zone. Tu ne produis rien encore : tu apprends le ' +
        'marché, tu te constitues un carnet de clients et une trésorerie.',
      tags: [['risk-low', 'Risque faible'], ['', 'Négoce'], ['', 'Le premier barreau']],
      unite: 'sac', unites: 'sacs',
      notes: { 1: 'ouverture, premiers clients', 4: 'point mort' },
      heures: '40 – 50 h',
      bloque: 'La trésorerie immobilisée dans le stock, et le nombre de paysans à portée de brouette',
      invest: function (d, p) {
        return [
          ['Stock de départ : 30 sacs d’engrais', Math.round(30 * d.achatDepot)],
          ['Caution et aménagement du local de stockage', 1800000],
          ['Bascule, brouette, palettes, bâches', 900000],
          ['Patente, enregistrement, agrément revendeur <em>(estimation)</em>', 450000],
          ['Réserve de trésorerie', 1200000]
        ];
      },
      fixes: function (d, p) {
        return [
          ['Loyer du local', Math.round(p.loyer * 0.45)],
          ['Gardiennage', Math.round(p.salaire * 0.6)],
          ['Transport et livraisons', 250000],
          ['Divers, imprévus', 120000]
        ];
      },
      prix: function (d, p) { return d.rayon; },
      varia: function (d, p) { return d.achatDepot; },
      perte: 2,
      vol: [20, 40, 60, 75, 90, 100, 110, 110, 110, 110, 110, 110],
      prud: [10, 20, 30, 38, 45, 50, 55, 55, 55, 55, 55, 55],
      risques: [
        ['Le stock dort', 'Trente sacs immobilisent la moitié de ta mise. Si la campagne agricole décale d’un mois, ton argent est couché dans le hangar.',
          'N’achète jamais plus de six semaines de vente. Commande petit et souvent, même si le prix unitaire est un peu moins bon.'],
        ['Le prix bouge sous toi', 'Le prix du sac suit le dollar et la douane. Un stock acheté cher se revend mal si le cours redescend.',
          'Répercute vite à la baisse, plus lentement à la hausse, et garde une marge d’un cran au-dessus de la concurrence plutôt que de brader.'],
        ['Le crédit aux paysans', 'On te demandera de livrer avant la récolte. C’est ainsi que meurent la plupart des dépôts.',
          'Pas de crédit la première année. Ensuite, un plafond par client, jamais plus d’un sac, et seulement pour ceux qui ont déjà payé comptant trois fois.']
      ],
      phases: [
        ['Mois 1', 'Local, patente, premier stock. Tu visites les fokontany et tu notes qui cultive quoi, sur combien d’ares.'],
        ['Mois 2 – 3', 'Tu vends, et surtout tu écoutes : quel engrais, à quelle période, à quel prix chez le concurrent.'],
        ['Mois 4 – 6', 'Tu élargis à la semence et au petit outillage. Le point mort est passé.'],
        ['Mois 7 – 12', 'Tu constitues la réserve du palier suivant, et tu sais désormais ce que ta zone consomme.']
      ]
    },

    {
      n: 2, cle: 'compost', palier: 2,
      titre: 'Engrais organique conditionné',
      court: 'Engrais organique',
      geste: 'Produire',
      soustitre: 'Le même client que le dépôt, mais tu ne revends plus : tu fabriques. Fumier de ' +
        'zébu, balle de riz, déchets de marché — compostés, criblés, ensachés sous ta marque, ' +
        'vendus à une fraction du prix de l’engrais importé.',
      tags: [['risk-mid', 'Risque moyen'], ['', 'Agro-industrie légère'], ['', 'La matière ne coûte presque rien']],
      unite: 'sac', unites: 'sacs',
      notes: { 1: 'premier compost en maturation', 5: 'point mort' },
      heures: '50 – 60 h',
      bloque: 'Le volume de biomasse que tu sais collecter et retourner, pas la demande',
      invest: function (d, p) {
        return [
          ['Hangar et aire de compostage bétonnée', 18000000],
          ['Camionnette d’occasion pour la collecte', 15000000],
          ['Broyeur de biomasse', 12000000],
          ['Retourneur et malaxeur', 6500000],
          ['Ensacheuse et couseuse de sacs', 4200000],
          ['Premier cycle de biomasse : 50 t', Math.round(50 * p.prixBiomasse)],
          ['Analyses, homologation, agrément <em>(estimation)</em>', 2500000],
          ['Bascule et petit outillage', 1300000],
          ['Réserve de trésorerie', 5000000]
        ];
      },
      fixes: function (d, p) {
        return [
          ['Carburant de collecte : 220 L', Math.round(220 * p.gasoil)],
          ['Trois ouvriers', Math.round(3 * p.salaire)],
          ['Un commercial', Math.round(p.salaire)],
          ['Terrain', p.loyer],
          ['Entretien du matériel', 200000],
          ['Électricité', 180000],
          ['Divers, imprévus', 150000]
        ];
      },
      /* Un sac de compost ne vaut pas un sac de NPK : il porte bien moins d'unités
         fertilisantes. Il se vend autour du tiers du prix de l'importé. */
      prix: function (d, p) { return Math.round(d.rayon * 0.30); },
      varia: function (d, p) {
        /* 250 kg de matière brute pour 50 kg de compost fini : l'eau part en
           fermentation, et le criblage écarte encore une part du volume. */
        return Math.round(0.25 * p.prixBiomasse + 1800 + 7500 + 3000 + 1 * p.kwh);
      },
      perte: 6,
      vol: [0, 120, 200, 280, 340, 390, 420, 420, 420, 420, 420, 420],
      prud: [0, 60, 100, 140, 170, 195, 210, 210, 210, 210, 210, 210],
      risques: [
        ['L’engrais importé est parfois subventionné', 'Quand une campagne d’appui distribue du NPK à prix cassé, ton produit devient cher du jour au lendemain.',
          'Ne vends jamais sur le seul prix. Vends l’effet sur la terre au bout de trois saisons, et garde les maraîchers — qui achètent sans subvention — comme socle.'],
        ['La matière première est gratuite mais lourde', 'Le fumier ne coûte rien ; le transporter coûte tout. C’est le poste qui tue les composteurs.',
          'Installe-toi à moins de 15 km des parcs à zébus et des rizeries. Négocie l’enlèvement gratuit contre le débarras.'],
        ['La qualité n’est pas visible à l’œil', 'Un compost mal mûri brûle les cultures. Une seule mauvaise saison et ta réputation est faite.',
          'Un thermomètre à compost, un registre de retournement par andain, et une analyse par trimestre. C’est peu cher et c’est ton assurance.'],
        ['Le paysan n’a pas d’argent avant la récolte', 'La demande existe, la trésorerie du client non.',
          'Vends aux coopératives et aux gros maraîchers, qui paient comptant, avant de descendre au petit producteur.']
      ],
      phases: [
        ['Mois 1', 'Aire bétonnée, premiers andains. Rien ne se vend : le compost mûrit entre six et dix semaines.'],
        ['Mois 2 – 4', 'Premières ventes aux maraîchers. Tu ajustes la formule et le temps de maturation.'],
        ['Mois 5 – 8', 'Le point mort est passé. Tu signes avec deux coopératives et tu fiabilises la collecte.'],
        ['Mois 9 – 12', 'Homologation obtenue, marque installée. Tu sais ce que coûte vraiment une tonne collectée.']
      ]
    },

    {
      n: 3, cle: 'beton', palier: 2,
      titre: 'Parpaings et pavés en béton',
      court: 'Parpaings et pavés',
      geste: 'Transformer',
      soustitre: 'Tu ne fabriques pas le ciment — c’est une usine à plusieurs dizaines de millions ' +
        'de dollars. Tu fabriques ce qu’on en fait : blocs creux, pavés autobloquants, bordures, ' +
        'hourdis. La valeur ajoutée est petite par pièce, énorme au volume.',
      tags: [['risk-mid', 'Risque moyen'], ['', 'Matériaux'], ['', 'Marge fine, volume gros']],
      unite: 'parpaing', unites: 'parpaings',
      notes: { 1: 'installation, premières coulées', 6: 'point mort' },
      heures: '55 – 65 h',
      bloque: 'La surface de séchage et le nombre de chantiers dans un rayon de 20 km',
      invest: function (d, p) {
        return [
          ['Pondeuse à parpaings', 22000000],
          ['Aire de séchage bétonnée', 12000000],
          ['Bétonnière', 9000000],
          ['Stock de départ : 120 sacs de ciment, sable, gravillon', Math.round(120 * p.sacCiment + 3000000)],
          ['Jeux de moules : blocs, pavés, bordures', 6000000],
          ['Terrain : caution et viabilisation', 6000000],
          ['Vibreur, brouettes, pelles, seaux', 3000000],
          ['Réserve de trésorerie', 6000000]
        ];
      },
      fixes: function (d, p) {
        return [
          ['Quatre ouvriers', Math.round(4 * p.salaire)],
          ['Livraisons', 700000],
          ['Électricité', Math.round(850 * p.kwh)],
          ['Terrain', p.loyer],
          ['Entretien, moules et pièces d’usure', 250000],
          ['Eau', 180000],
          ['Divers, imprévus', 150000]
        ];
      },
      prix: function (d, p) { return 2000; },
      varia: function (d, p) {
        /* un sac de 50 kg donne environ 35 blocs creux de 15 au dosage courant */
        return Math.round(p.sacCiment / 35 + 150 + 200 + 15);
      },
      perte: 5,
      vol: [0, 6000, 9500, 12000, 14000, 16000, 18000, 18000, 18000, 18000, 18000, 18000],
      prud: [0, 3000, 4800, 6000, 7000, 8000, 9000, 9000, 9000, 9000, 9000, 9000],
      risques: [
        ['La marge par pièce est minuscule', 'Quelques centaines d’ariary. Une hausse du ciment de 10 % efface la moitié de ton bénéfice.',
          'Indexe ton prix sur le sac de ciment, ouvertement, et annonce-le à tes clients dès le premier devis. Le champ « ciment » de cette page est là pour que tu refasses le calcul en trente secondes.'],
        ['Le béton mal dosé revient en boomerang', 'Économiser un dixième de sac par gâchée se voit au premier mur fissuré, et se sait dans tout le quartier.',
          'Un dosage écrit, affiché, et la même personne qui gâche tous les jours. Le contrôle, c’est une pesée au hasard par semaine.'],
        ['Le chantier ne paie pas', 'Les gros chantiers commandent beaucoup et règlent tard.',
          'Cinquante pour cent à la commande, solde à l’enlèvement. Tu ne charges pas le camion d’un impayé.'],
        ['La saison des pluies', 'Le séchage s’allonge, la surface disponible sature, la production tombe.',
          'Prévois l’aire couverte dès la construction, et constitue du stock en saison sèche : c’est la seule trésorerie qui te fera passer janvier et février.']
      ],
      phases: [
        ['Mois 1', 'Terrain, aire de séchage, montage de la pondeuse. Premières coulées d’essai, dosage figé.'],
        ['Mois 2 – 4', 'Les maçons du quartier deviennent tes prescripteurs. Tu ajoutes les pavés, plus rémunérateurs.'],
        ['Mois 5 – 8', 'Point mort passé. Tu vises les petites entreprises de construction plutôt que les particuliers.'],
        ['Mois 9 – 12', 'Second jeu de moules, stock de saison sèche, et devis aux collectivités pour les pavés.']
      ]
    },

    {
      n: 4, cle: 'provende', palier: 3,
      titre: 'Provende pour volaille',
      court: 'Provende',
      geste: 'Transformer',
      soustitre: 'Maïs, son de riz, tourteau et complément minéral, broyés et mélangés à la ' +
        'formule. Tu remplaces à la fois la provende importée et les matières premières que ' +
        'les éleveurs achètent séparément sans savoir doser.',
      tags: [['risk-mid', 'Risque moyen'], ['', 'Alimentation animale'], ['', 'Le client rachète chaque semaine']],
      unite: 'sac', unites: 'sacs',
      notes: { 1: 'installation, formulation', 6: 'point mort' },
      heures: '55 – 65 h',
      bloque: 'L’approvisionnement en maïs, et la capacité du broyeur',
      invest: function (d, p) {
        return [
          ['Broyeur-mélangeur', 45000000],
          ['Hangar et silos de stockage', 40000000],
          ['Stock de matières premières : campagne de maïs', 35000000],
          ['Camionnette de collecte et de livraison', 25000000],
          ['Réserve de trésorerie', 14000000],
          ['Groupe électrogène et raccordement', 12000000],
          ['Ensacheuse et couseuse', 8000000],
          ['Formulation, analyses, agrément <em>(estimation)</em>', 8000000],
          ['Bascule et petit matériel', 3000000]
        ];
      },
      fixes: function (d, p) {
        return [
          ['Cinq ouvriers', Math.round(5 * p.salaire)],
          ['Carburant : 300 L', Math.round(300 * p.gasoil)],
          ['Électricité', Math.round(2000 * p.kwh)],
          ['Un technicien de formulation', Math.round(2 * p.salaire)],
          ['Terrain et hangar', Math.round(2 * p.loyer)],
          ['Entretien du broyeur', 500000],
          ['Divers, imprévus', 300000]
        ];
      },
      prix: function (d, p) { return 165000; },
      varia: function (d, p) {
        /* formule ponte : 55 % maïs, 22 % tourteau, 18 % son de riz, 5 % complément */
        return Math.round(27.5 * p.prixMais + 11 * p.prixTourteau + 9 * 900 + 2.5 * 9000
          + 1800 + 2500 + 3 * p.kwh);
      },
      perte: 3,
      vol: [0, 200, 350, 500, 650, 780, 900, 900, 900, 900, 900, 900],
      prud: [0, 100, 175, 250, 325, 390, 450, 450, 450, 450, 450, 450],
      risques: [
        ['Le maïs commande tout', 'Il pèse près de la moitié du coût du sac. Sa récolte est saisonnière, son prix monte de 40 % en soudure.',
          'Achète toute ta campagne à la récolte, quitte à emprunter pour le faire : le silo est moins cher que la soudure. C’est à cela que sert la ligne « stock de matières premières » de l’investissement.'],
        ['Une formule fausse tue les poulets', 'Et ton nom avec. En alimentation animale, la réputation se perd en une bande.',
          'Un technicien formulateur dès le premier jour, une analyse par lot de matière, et un échantillon de chaque fabrication gardé trois mois.'],
        ['La marge est étroite', 'Quinze pour cent, pas davantage. C’est un métier de volume et de rigueur, pas de coup.',
          'Ne descends jamais le prix pour prendre un client : descends le coût en achetant mieux la matière. Et suis ton coût de revient par lot, pas par mois.'],
        ['Les éleveurs disparaissent par vagues', 'Une épizootie, et la moitié de tes clients arrête pour six mois.',
          'Diversifie tôt : pondeuses, chair, porcs, poissons. Quatre formules valent mieux qu’une clientèle unique.']
      ],
      phases: [
        ['Mois 1', 'Montage, raccordement, mise au point des formules avec le technicien. Aucun sac vendu.'],
        ['Mois 2 – 4', 'Premiers éleveurs, en direct. Tu suis leurs résultats semaine après semaine — c’est ta seule publicité.'],
        ['Mois 5 – 8', 'Point mort. Tu ouvres la formule chair et tu prends deux revendeurs de province.'],
        ['Mois 9 – 12', 'Campagne de maïs : tu achètes l’année entière. Le silo devient ton avantage sur les concurrents.']
      ]
    },

    {
      n: 5, cle: 'rizerie', palier: 4,
      titre: 'Rizerie moderne',
      court: 'Rizerie',
      geste: 'Produire la matière',
      soustitre: 'Le pays cultive le riz et en importe pourtant chaque année. Le trou n’est pas ' +
        'au champ, il est entre le champ et l’assiette : séchage, décorticage, étuvage, tri, ' +
        'conditionnement. C’est là que se perd la valeur, et c’est là qu’on la reprend.',
      tags: [['risk-high', 'Risque élevé'], ['', 'Agro-industrie'], ['', 'Le symbole du pays']],
      unite: 'sac de 25 kg', unites: 'sacs de 25 kg',
      notes: { 1: 'installation et essais', 6: 'point mort' },
      heures: 'équipe complète',
      bloque: 'La collecte du paddy et la trésorerie de campagne, jamais la demande',
      invest: function (d, p) {
        return [
          ['Ligne complète : décortiqueuse, blanchisseur, trieur', 180000000],
          ['Fonds de roulement : collecte de paddy de campagne', 120000000],
          ['Hangar, magasin et aire de séchage', 120000000],
          ['Camion de 10 t d’occasion', 70000000],
          ['Étuveuse', 65000000],
          ['Séchoir mécanique', 55000000],
          ['Groupe électrogène et raccordement moyenne tension', 45000000],
          ['Pont-bascule', 35000000],
          ['Réserve de trésorerie', 25000000],
          ['Statut, certification, analyses <em>(estimation)</em>', 12000000]
        ];
      },
      fixes: function (d, p) {
        return [
          ['Quatorze ouvriers, deux équipes', Math.round(14 * p.salaire)],
          ['Électricité', Math.round(9000 * p.kwh)],
          ['Trois cadres : production, collecte, qualité', Math.round(6 * p.salaire)],
          ['Carburant : 900 L', Math.round(900 * p.gasoil)],
          ['Entretien de la ligne', 2200000],
          ['Terrain', Math.round(3 * p.loyer)],
          ['Assurance', 900000],
          ['Divers, imprévus', 800000]
        ];
      },
      prix: function (d, p) { return 95000; },
      varia: function (d, p) {
        /* 38,5 kg de paddy pour 25 kg de riz blanc — rendement 65 %.
           Le son et les brisures se revendent : ils viennent en déduction. */
        return Math.round(38.5 * p.prixPaddy + 1500 + 1800 + 2500 + 4 * p.kwh - 6000);
      },
      perte: 4,
      vol: [0, 1000, 1800, 2600, 3400, 4200, 5000, 5000, 5000, 5000, 5000, 5000],
      prud: [0, 500, 900, 1300, 1700, 2100, 2500, 2500, 2500, 2500, 2500, 2500],
      risques: [
        ['La trésorerie de campagne', 'Le paddy s’achète en trois mois et se vend en douze. Il faut porter des mois de stock. C’est ce qui met à genoux les rizeries, jamais le marché.',
          'La ligne « fonds de roulement » est la plus importante de tout l’investissement. Si elle n’est pas financée, l’usine tourne trois mois puis s’arrête, moulin plein et caisse vide.'],
        ['Le riz importé fixe le plafond', 'Tu ne peux pas vendre durablement plus cher que le riz d’import à qualité égale.',
          'Ne joue pas sur ce terrain : joue le riz local identifié, étuvé, propre, au grain régulier. C’est un autre produit, et il se paie.'],
        ['Le séchage décide de tout', 'Un paddy rentré trop humide casse au décorticage. Le taux de brisures fait la différence entre un bon et un mauvais mois.',
          'Le séchoir mécanique n’est pas un luxe : il est ce qui rend la collecte possible en saison des pluies, quand le paddy est le moins cher.'],
        ['La dépendance aux collecteurs', 'S’ils te contournent, l’usine est vide.',
          'Paie comptant, au poids juste, sur un pont-bascule que le paysan voit. Le pont-bascule est un outil commercial autant qu’un outil de pesée.']
      ],
      phases: [
        ['Mois 1', 'Montage, raccordement, essais. Réglage du blanchisseur sur les variétés locales.'],
        ['Mois 2 – 4', 'Première collecte, premiers lots. Tu mesures ton taux de brisures à chaque réglage.'],
        ['Mois 5 – 8', 'Point mort. La marque prend en grande surface et chez les grossistes.'],
        ['Mois 9 – 12', 'Grande campagne : tu immobilises la totalité de ton fonds de roulement en paddy. L’année suivante se joue là.']
      ]
    }
  ];

  var PALIERS = [
    [1, 'Revendre', 3000000, 15000000,
      'Tu achètes ce qui est importé et tu le revends. Aucune machine, aucun procédé : du stock, un local, et la connaissance du terrain.',
      'Tu découvres qui achète quoi, quand, et à quel prix — le renseignement que personne ne peut te vendre.'],
    [2, 'Conditionner', 15000000, 80000000,
      'Tu transformes peu mais tu transformes : tu composes, tu ensaches, tu mets en forme sous ta marque.',
      'La marge cesse d’être une commission et devient une vraie valeur ajoutée.'],
    [3, 'Transformer', 80000000, 300000000,
      'Un procédé, des machines, une équipe, une formule. Le produit sortant n’a plus la forme du produit entrant.',
      'Tu n’es plus substituable : le client revient pour ce que toi seul fais dans la zone.'],
    [4, 'Produire la matière', 300000000, 2000000000,
      'Tu remontes jusqu’à la matière première elle-même. C’est le barreau de Dangote, celui des cimenteries.',
      'Tu fixes le prix au lieu de le subir, et tout ce qui est en aval dépend de toi.']
  ];

  var PISTES = [
    ['Huilerie : arachide, coprah, tournesol', 'Agro-alimentaire', 120000000, 3,
      'L’huile alimentaire est massivement importée alors que les oléagineux poussent ici.'],
    ['Savonnerie et détergents', 'Chimie légère', 45000000, 2,
      'Base d’huile locale, parfum et soude importés : la valeur ajoutée reste sur place.'],
    ['Emballage : cartons, pots, étiquettes', 'Emballage', 90000000, 3,
      'Tout producteur local importe son emballage. Vendre les pelles à ceux qui creusent.'],
    ['Laiterie : collecte, pasteurisation, yaourt', 'Agro-alimentaire', 140000000, 3,
      'Le lait en poudre importé remplit les rayons au-dessus d’un cheptel bien réel.'],
    ['Aliment pour poissons', 'Alimentation animale', 75000000, 2,
      'La pisciculture grandit et achète aujourd’hui un aliment venu de l’étranger.'],
    ['Confection : uniformes et vêtements de travail', 'Textile', 35000000, 2,
      'Le pays coud pour l’export pendant que le marché intérieur s’habille en friperie.'],
    ['Jus et boissons de fruits locaux', 'Agro-alimentaire', 60000000, 2,
      'Le fruit est ici, le concentré vient de loin. L’écart est la marge.'],
    ['Quincaillerie transformée : treillis, ferraillage', 'Métallurgie légère', 110000000, 3,
      'On importe la barre, on peut façonner sur place ce que le chantier utilise vraiment.'],
    ['Sucre roux et sirops artisanaux', 'Agro-alimentaire', 55000000, 2,
      'La canne pousse, les sucreries industrielles ont vacillé, l’import a pris la place.'],
    ['Allumettes, bougies, produits d’entretien', 'Biens de consommation', 25000000, 2,
      'Des produits simples, à faible valeur unitaire, que le fret rend chers à importer.']
  ];

  /* ───────────────────────── calcul ───────────────────────── */

  function nets(f, d, p, volumes) {
    var prix = f.prix(d, p);
    var v = f.varia(d, p);
    var marge = prix * (1 - f.perte / 100) - v;
    var fixes = somme(f.fixes(d, p));
    var out = [];
    for (var i = 0; i < 12; i++) {
      var q = volumes[i];
      var ca = Math.round(q * prix * (1 - f.perte / 100));
      var cv = Math.round(q * v);
      out.push({ q: q, ca: ca, cv: cv, fixes: fixes, net: ca - cv - fixes });
    }
    return { prix: prix, varia: v, marge: marge, fixes: fixes, mois: out };
  }

  function somme(lignes) {
    var t = 0;
    lignes.forEach(function (l) { t += l[1]; });
    return t;
  }

  /** Premier mois où la trésorerie cumulée repasse au-dessus de zéro.
   *
   *  Les douze mois du prévisionnel ne suffisent pas aux paliers hauts : une unité
   *  de production se rembourse en années, pas en mois, et c'est normal. Au-delà du
   *  douzième mois on prolonge donc au rythme de croisière — le net du mois 12, qui
   *  ne bouge plus — au lieu de renvoyer « jamais », ce qui serait faux.
   *  PLAFOND_MOIS borne la recherche à dix ans : au-delà, l'affaire ne rembourse pas. */
  var PLAFOND_MOIS = 120;

  function pointMort(inv, mois) {
    var c = -inv, i;
    for (i = 0; i < mois.length; i++) {
      c += mois[i].net;
      if (c >= 0) return i + 1;
    }
    var croisiere = mois[mois.length - 1].net;
    if (croisiere <= 0) return 0;          // 0 = perd de l'argent tous les mois
    for (i = mois.length; i < PLAFOND_MOIS; i++) {
      c += croisiere;
      if (c >= 0) return i + 1;
    }
    return -1;                             // -1 = rembourse, mais au-delà de dix ans
  }

  function cumul(inv, mois) {
    var c = -inv, out = [];
    for (var i = 0; i < mois.length; i++) { c += mois[i].net; out.push(c); }
    return out;
  }

  function compute(p) {
    var d = {};

    /* ── la chaîne de l'import, sur le sac d'engrais pris comme exemple ── */
    d.fobAr = Math.round(p.fobEngrais * p.arUsd);
    d.fretAr = Math.round(d.fobAr * p.fret / 100);
    d.caf = d.fobAr + d.fretAr;
    d.droitsAr = Math.round(d.caf * p.droits / 100);
    d.tvaAr = Math.round((d.caf + d.droitsAr) * p.tva / 100);
    d.revientImp = d.caf + d.droitsAr + d.tvaAr;
    d.margeImpAr = Math.round(d.revientImp * p.margeImp / 100);
    d.rayon = d.revientImp + d.margeImpAr;
    /* ce que le producteur local n'a pas à payer : le transport international et
       la douane. La TVA, elle, dépend de son régime — c'est à vérifier sur place. */
    d.evite = d.fretAr + d.droitsAr;
    d.evitePct = d.rayon ? d.evite / d.rayon * 100 : 0;
    d.coefImport = d.fobAr ? d.rayon / d.fobAr : 0;
    /* le dépôt achète au grossiste : prix de revient importateur plus une marge de gros */
    d.achatDepot = Math.round(d.revientImp * 1.15);

    /* ── les cinq fiches ── */
    d.fiches = FICHES.map(function (f) {
      var inv = f.invest(d, p);
      var fx = f.fixes(d, p);
      var invT = somme(inv);
      var r = nets(f, d, p, f.vol);
      var rp = nets(f, d, p, f.prud);
      var ben = 0;
      r.mois.forEach(function (m) { ben += m.net; });
      var plafond = r.mois[11].net;
      return {
        cle: f.cle, n: f.n, palier: f.palier, titre: f.titre, court: f.court,
        geste: f.geste, unite: f.unite, unites: f.unites,
        invest: inv, investTotal: invT,
        fixesLignes: fx, fixes: r.fixes,
        prix: r.prix, varia: r.varia, marge: r.marge,
        seuil: r.marge > 0 ? Math.ceil(r.fixes / r.marge) : 0,
        mois: r.mois, moisPrud: rp.mois,
        cumul: cumul(invT, r.mois), cumulPrud: cumul(invT, rp.mois),
        pm: pointMort(invT, r.mois), pmp: pointMort(invT, rp.mois),
        benefice: ben, plafond: plafond,
        /* Ce que rapporte une année pleine une fois la montée en charge finie.
           C'est la seule mesure comparable d'un palier à l'autre : les douze
           premiers mois d'une usine mélangent l'installation et la production. */
        annuel: plafond * 12,
        rendement: invT ? plafond * 12 / invT * 100 : 0,
        margePct: r.prix ? r.marge / r.prix * 100 : 0
      };
    });

    d.investMin = Math.min.apply(null, d.fiches.map(function (f) { return f.investTotal; }));
    d.investMax = Math.max.apply(null, d.fiches.map(function (f) { return f.investTotal; }));
    return d;
  }

  /** « 8 mois » · « 3,3 ans » · « plus de 10 ans » · « jamais » — cette dernière
   *  voulant dire que le mois de croisière lui-même est déficitaire. */
  function retourTxt(m) {
    if (m === 0) return 'jamais';
    if (m < 0) return 'plus de 10 ans';
    return m <= 18 ? m + ' mois' : dec(m / 12, 1) + ' ans';
  }

  /* ───────── les valeurs affichées, par clé <span data-v> ───────── */

  function values(p) {
    var d = compute(p);
    var v = {};

    v.fobUsd = dec(p.fobEngrais, 1) + ' $';
    v.arUsd = ar(p.arUsd);
    v.fobAr = ar(d.fobAr);
    v.fretPct = pct(p.fret, 1);
    v.fretAr = ar(d.fretAr);
    v.caf = ar(d.caf);
    v.droitsPct = pct(p.droits, 1);
    v.droitsAr = ar(d.droitsAr);
    v.tvaPct = pct(p.tva, 1);
    v.tvaAr = ar(d.tvaAr);
    v.revientImp = ar(d.revientImp);
    v.margeImpPct = pct(p.margeImp, 0);
    v.margeImpAr = ar(d.margeImpAr);
    v.rayon = ar(d.rayon);
    v.evite = ar(d.evite);
    v.evitePct = pct(d.evitePct, 0);
    v.coefImport = dec(d.coefImport, 2);
    v.achatDepot = ar(d.achatDepot);
    v.investMin = mAr(d.investMin);
    v.investMax = mAr(d.investMax);

    d.fiches.forEach(function (f) {
      var k = 'f' + f.n + '_';
      v[k + 'inv'] = ar(f.investTotal);
      v[k + 'invM'] = mAr(f.investTotal);
      v[k + 'fixes'] = ar(f.fixes);
      v[k + 'prix'] = ar(f.prix);
      v[k + 'var'] = ar(f.varia);
      v[k + 'marge'] = ar(f.marge);
      v[k + 'margePct'] = pct(f.margePct, 0);
      v[k + 'seuil'] = ar(f.seuil);
      v[k + 'pm'] = String(f.pm);
      v[k + 'pmp'] = f.pmp ? String(f.pmp) : '> 12';
      v[k + 'ben'] = ar(f.benefice);
      v[k + 'benM'] = mAr(f.benefice);
      v[k + 'plafond'] = ar(f.plafond);
      v[k + 'annuel'] = ar(f.annuel);
      v[k + 'annuelM'] = mAr(f.annuel);
      v[k + 'rendement'] = pct(Math.round(f.rendement / 5) * 5, 0);
      v[k + 'retour'] = retourTxt(f.pm);
      v[k + 'retourp'] = retourTxt(f.pmp);
      f.invest.forEach(function (l, i) { v[k + 'i' + i] = ar(l[1]); });
      f.fixesLignes.forEach(function (l, i) { v[k + 'x' + i] = ar(l[1]); });
      f.mois.forEach(function (m, i) {
        var q = k + 'm' + (i + 1) + '_';
        v[q + 'q'] = ar(m.q);
        v[q + 'ca'] = ar(m.ca);
        v[q + 'cv'] = ar(m.cv);
        v[q + 'fx'] = ar(m.fixes);
        v[q + 'net'] = sgn(m.net);
        v[q + 'cum'] = sgn(f.cumul[i]);
      });
      var tq = 0, tca = 0, tcv = 0, tfx = 0;
      f.mois.forEach(function (m) { tq += m.q; tca += m.ca; tcv += m.cv; tfx += m.fixes; });
      v[k + 'tq'] = ar(tq);
      v[k + 'tca'] = ar(tca);
      v[k + 'tcv'] = ar(tcv);
      v[k + 'tfx'] = ar(tfx);
      v[k + 'tnet'] = sgn(f.benefice);
      v[k + 'tcum'] = sgn(f.cumul[11]);
    });

    return v;
  }

  /* ───────────────────────── schémas recalculés ───────────────────────── */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var INK = '#111827', MUT = '#6b7280', LINE = '#e5e7eb';
  var COL = ['#15803d', '#0f766e', '#4338ca', '#b45309', '#be123c', '#475569'];

  /** La cascade du prix de l'import : ce que le producteur local n'a pas à payer. */
  function figCascade(p, d) {
    var steps = [
      ['Prix usine', d.fobAr, 'base'],
      ['Fret', d.fretAr, 'add'],
      ['Douane', d.droitsAr, 'add'],
      ['TVA', d.tvaAr, 'add'],
      ['Marge réseau', d.margeImpAr, 'add'],
      ['Prix au marché', d.rayon, 'total']
    ];
    var w = 460, h = 300, l = 8, r = 8, t = 26, b = 58;
    var pw = w - l - r, ph = h - t - b;
    var slot = pw / steps.length, bw = slot * 0.6;
    var ymax = d.rayon * 1.12 || 1;
    var H = function (val) { return ph * val / ymax; };
    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Décomposition du prix d’un sac d’engrais importé">'];
    var acc = 0;
    steps.forEach(function (s, i) {
      var x = l + i * slot + (slot - bw) / 2;
      var val = s[1], kind = s[2], y, hh = H(val);
      if (kind === 'total') { y = t + ph - H(val); acc = val; }
      else if (kind === 'base') { y = t + ph - H(val); acc = val; }
      else { y = t + ph - H(acc + val); acc += val; }
      var col = kind === 'total' ? INK : (kind === 'base' ? COL[0] : COL[3]);
      out.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.max(1, hh).toFixed(1) + '" fill="' + col + '" rx="2"/>');
      out.push('<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) +
        '" text-anchor="middle" font-size="9.5" font-weight="700" fill="' + INK + '">' +
        ar(val) + '</text>');
      var mots = s[0].split(' ');
      out.push('<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (t + ph + 15) +
        '" text-anchor="middle" font-size="9.5" fill="' + MUT + '">' + esc(mots[0]) + '</text>');
      if (mots[1]) {
        out.push('<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (t + ph + 26) +
          '" text-anchor="middle" font-size="9.5" fill="' + MUT + '">' + esc(mots.slice(1).join(' ')) + '</text>');
      }
    });
    out.push('<line x1="' + l + '" y1="' + (t + ph) + '" x2="' + (l + pw) + '" y2="' + (t + ph) +
      '" stroke="' + LINE + '" stroke-width="1.5"/>');
    out.push('<text x="' + l + '" y="14" font-size="10" fill="' + MUT + '">Un sac d’engrais de 50 kg, en ariary</text>');
    out.push('</svg>');
    return out.join('');
  }

  /** Ce que chaque fiche immobilise, à l'échelle. */
  function figCapital(p, d) {
    var w = 460, labw = 150, barx = labw + 8, barw = w - barx - 96;
    var rows = d.fiches.map(function (f) { return [f.court, f.investTotal, mAr(f.investTotal) + ' Ar']; });
    var mx = Math.max.apply(null, rows.map(function (r) { return r[1]; }));
    var top = 8, rowh = 26, gap = 8;
    var h = top + rows.length * (rowh + gap);
    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Capital de départ de chaque business">'];
    rows.forEach(function (row, i) {
      var y = top + i * (rowh + gap);
      var bw = Math.max(2, barw * row[1] / mx);
      out.push('<text x="0" y="' + (y + 17) + '" font-size="10.5" fill="' + INK + '">' + esc(row[0]) + '</text>');
      out.push('<rect x="' + barx + '" y="' + (y + 4) + '" width="' + bw.toFixed(1) +
        '" height="' + (rowh - 8) + '" fill="' + COL[i % COL.length] + '" rx="2"/>');
      out.push('<text x="' + (barx + bw + 7).toFixed(1) + '" y="' + (y + 17) +
        '" font-size="10" font-weight="700" fill="' + INK + '">' + esc(row[2]) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  /** Marge par unité rapportée au prix : où se loge vraiment la valeur ajoutée. */
  function figMarges(p, d) {
    var w = 460, labw = 150, barx = labw + 8, barw = w - barx - 96;
    var top = 8, rowh = 26, gap = 8;
    var h = top + d.fiches.length * (rowh + gap);
    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Part de la marge dans le prix de vente">'];
    d.fiches.forEach(function (f, i) {
      var y = top + i * (rowh + gap);
      var bw = Math.max(2, barw * Math.max(0, f.margePct) / 100);
      out.push('<text x="0" y="' + (y + 17) + '" font-size="10.5" fill="' + INK + '">' + esc(f.court) + '</text>');
      out.push('<rect x="' + barx + '" y="' + (y + 4) + '" width="' + barw +
        '" height="' + (rowh - 8) + '" fill="#f3f4f6" rx="2"/>');
      out.push('<rect x="' + barx + '" y="' + (y + 4) + '" width="' + bw.toFixed(1) +
        '" height="' + (rowh - 8) + '" fill="' + COL[i % COL.length] + '" rx="2"/>');
      out.push('<text x="' + (barx + barw + 7) + '" y="' + (y + 17) +
        '" font-size="10" font-weight="700" fill="' + INK + '">' + pct(f.margePct, 0) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  function figures(p) {
    var d = compute(p);
    return { cascade: figCascade(p, d), capital: figCapital(p, d), marges: figMarges(p, d) };
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
    } catch (e) { /* stockage indisponible : les valeurs par défaut suffisent */ }
    return p;
  }

  function save(p) {
    try {
      var diff = {}, n = 0, k;
      for (k in DEFAULTS) if (p[k] !== DEFAULTS[k]) { diff[k] = p[k]; n++; }
      if (n) localStorage.setItem(STORE, JSON.stringify(diff));
      else localStorage.removeItem(STORE);
    } catch (e) { /* la page reste juste, elle n'est simplement pas mémorisée */ }
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

    var html = '<button type="button" class="params-toggle" id="params-toggle" aria-expanded="false" aria-controls="params-body">'
      + '<span class="params-title">Tes chiffres</span>'
      + '<span class="params-sub" id="params-count"></span>'
      + '<span class="params-chevron" aria-hidden="true">▾</span></button>'
      + '<div class="params-body" id="params-body"><div class="params-inner">'
      + '<p class="params-intro">Cette page ne connaît pas le prix du ciment chez ton fournisseur, '
      + 'ni le droit de douane exact sur l’engrais. Elle pose donc ses hypothèses à découvert. '
      + 'Relève les vrais chiffres, saisis-les ici : <strong>tout le document se recalcule</strong>, '
      + 'tableaux et schémas compris.</p>';

    GROUPES.forEach(function (g) {
      html += '<div class="params-grp"><div class="params-grp-t">' + esc(g[1]) + '</div>'
        + '<p class="params-grp-d">' + esc(g[2]) + '</p><div class="params-fields">';
      PARAMS.filter(function (x) { return x[7] === g[0]; }).forEach(function (x) {
        html += '<label class="params-f" for="pf-' + x[0] + '">'
          + '<span class="params-lab">' + esc(x[1]) + '</span>'
          + '<span class="params-in"><input type="number" id="pf-' + x[0] + '" data-p="' + x[0]
          + '" step="' + x[6] + '" min="' + x[4] + '" max="' + x[5] + '" value="' + p[x[0]] + '">'
          + '<span class="params-u">' + esc(x[3]) + '</span></span></label>';
      });
      html += '</div></div>';
    });

    html += '<div class="params-actions">'
      + '<button type="button" class="params-reset" id="params-reset">Revenir aux hypothèses d’origine</button>'
      + '</div></div></div>';
    host.innerHTML = html;

    var toggle = document.getElementById('params-toggle');
    var body = document.getElementById('params-body');
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      body.classList.toggle('open', !open);
    });

    function apply() {
      var v = values(p);
      var missing = [];
      Array.prototype.forEach.call(document.querySelectorAll('[data-v]'), function (el) {
        var k = el.getAttribute('data-v');
        if (v[k] === undefined) { missing.push(k); return; }
        el.textContent = v[k];
      });
      if (missing.length && window.console) {
        console.warn('data-v sans valeur : ' + missing.join(', '));
      }
      var f = figures(p);
      Array.prototype.forEach.call(document.querySelectorAll('[data-fig]'), function (el) {
        var k = el.getAttribute('data-fig');
        if (f[k]) el.innerHTML = f[k];
      });
      var n = modifies(p);
      var c = document.getElementById('params-count');
      if (c) {
        c.textContent = n === 0 ? 'hypothèses d’origine'
          : (n === 1 ? '1 hypothèse modifiée' : n + ' hypothèses modifiées');
      }
      host.classList.toggle('params-custom', n > 0);
    }

    Array.prototype.forEach.call(host.querySelectorAll('input[data-p]'), function (input) {
      function commit() {
        var k = input.getAttribute('data-p');
        var n = clamp(SPEC[k], input.value);
        if (n === null) { input.value = p[k]; return; }
        p[k] = n;
        input.value = n;
        save(p);
        apply();
      }
      input.addEventListener('change', commit);
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); });
    });

    document.getElementById('params-reset').addEventListener('click', function () {
      for (var k in DEFAULTS) p[k] = DEFAULTS[k];
      save(p);
      Array.prototype.forEach.call(host.querySelectorAll('input[data-p]'), function (i) {
        i.value = p[i.getAttribute('data-p')];
      });
      apply();
    });

    apply();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return {
    PARAMS: PARAMS, SPEC: SPEC, DEFAULTS: DEFAULTS, GROUPES: GROUPES, STORE: STORE,
    FICHES: FICHES, PALIERS: PALIERS, PISTES: PISTES,
    compute: compute, values: values, figures: figures, init: init,
    fmt: { ar: ar, mAr: mAr, pct: pct, dec: dec, sgn: sgn, NB: NB }
  };
});
