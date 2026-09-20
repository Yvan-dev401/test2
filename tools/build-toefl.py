#!/usr/bin/env python3
"""Génère roadmap-toefl.html à partir de roadmap-allemand.html.

La page allemande porte déjà tout le moteur : rendu des phases, cases à cocher
persistantes, barre de replanification et minuteur. On n'en change que les données,
l'habillage et les clés de stockage — aucune mécanique n'est réécrite.

Les libellés de jours sont calculés depuis la date de départ, donc impossible de les
désynchroniser du calendrier.
"""

import io
import re
import sys
from datetime import date, timedelta

START = date(2026, 9, 20)          # dimanche
JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

R, E = 'rest', 'exam'              # marqueurs de jour

# ── 12 semaines × 7 jours ────────────────────────────────────────────────────
# (texte, marqueur) — le marqueur colore la ligne comme sur les autres roadmaps

PHASES = [
 ("Phase 1 — Diagnostic & socle académique", "#DBEAFE", "#1D4ED8", [
  ("Semaine 1 — Diagnostic & format", "Diagnostic", [
   ("<b>Test diagnostic complet</b> : un TOEFL iBT entier en conditions réelles (ETS TOEFL Practice Test, gratuit). Note le score des 4 sections séparément. C'est ta ligne de base — mesure-la, ne la juge pas.", E),
   ("Dépouillement du diagnostic : pour chaque section, classe tes erreurs par <b>type</b> (vocabulaire, inférence, détail manqué, temps). L'écart à combler vers 28/30 se lit là, pas dans le score global.", None),
   ("<b>Format Reading</b> : 2 passages, 20 questions, 35 min. Apprends les 10 types de questions et ce que chacun teste réellement. Guide officiel ETS, gratuit.", None),
   ("<b>Format Listening</b> : 3 cours + 2 conversations, 36 min. Mets en place ton système de prise de notes (symboles, abréviations, deux colonnes). Teste-le sur 1 cours.", None),
   ("<b>Format Speaking</b> : les 4 tâches et leur chronométrage exact (15–30 s de préparation, 45–60 s de réponse). Enregistre-toi sur une Task 1 — la première réécoute pique, c'est normal.", None),
   ("<b>Format Writing</b> : Integrated (20 min) puis Academic Discussion (10 min). Écris une Academic Discussion en 10 min chrono, sans t'arrêter pour corriger.", None),
   ("🌿 Repos actif : un épisode de podcast académique (TED Talks Daily, Science Friday) en écoute libre, sans notes.", R),
  ]),
  ("Semaine 2 — Vocabulaire académique & notes", "Socle", [
   ("Installe un deck Anki de l'<b>Academic Word List</b> (570 familles). À partir d'aujourd'hui : 25 nouveaux mots par jour, tous les jours, en dehors des 2 h. C'est le socle des 4 sections.", None),
   ("Reading : 1 passage chronométré (18 min). Chaque mot inconnu part dans Anki. Analyse : combien d'erreurs viennent du vocabulaire, combien de la logique ?", None),
   ("Listening : 2 cours avec prise de notes. Compare ensuite tes notes au transcript et souligne tout ce que tu n'as pas capté — c'est ta liste de travail.", None),
   ("Speaking Task 1 : 5 réponses enregistrées sur des sujets variés. Réécoute et compte les hésitations. Objectif de la semaine : passer sous 5 par réponse.", None),
   ("Writing Integrated : 1 sujet complet. Structure imposée : la thèse du texte, puis les 3 objections de l'audio, une par paragraphe.", None),
   ("<b>Section Reading complète chronométrée</b> (35 min, 2 passages). Score, puis classement des erreurs par type de question.", None),
   ("🌿 Repos actif : une série ou un film en anglais, sous-titres anglais. Note 5 expressions idiomatiques, rien de plus.", R),
  ]),
  ("Semaine 3 — Premiers automatismes", "Socle", [
   ("Reading ciblé : questions <b>Vocabulary in Context</b> et <b>Reference</b>. 20 questions de chaque type, sans chrono — la précision avant la vitesse.", None),
   ("Listening : 2 conversations de campus. Repère la structure type — problème, options, décision. Ces questions se jouent sur l'intention, pas sur le détail.", None),
   ("Speaking Task 2 (Campus Announcement) : lecture 45 s, écoute, réponse 60 s. 3 passages enregistrés. Travaille la transition « The man/woman thinks… because… ».", None),
   ("Writing Academic Discussion : 3 réponses de 10 min. Objectif : 100 mots minimum, une position claire, un exemple concret à chaque fois.", None),
   ("Reading ciblé : questions <b>Inference</b> et <b>Rhetorical Purpose</b>, les deux plus discriminantes du test. 20 de chaque.", None),
   ("<b>Section Listening complète chronométrée</b> (36 min). Compare le score à celui du diagnostic.", None),
   ("🌿 Repos actif : Anki et un TED Talk. Bilan de la phase 1 — tes 3 points faibles sont-ils les mêmes qu'au jour 1 ?", R),
  ]),
 ]),
 ("Phase 2 — Reading & Listening vers 28+", "#D1FAE5", "#047857", [
  ("Semaine 4 — Reading en profondeur", "R & L", [
   ("Reading : <b>Sentence Simplification</b>. La règle est de garder la relation logique, pas les mots. 15 questions, puis réécris chaque phrase à ta façon.", None),
   ("Listening : 2 cours scientifiques (biologie, astronomie). Le vocabulaire technique est toujours expliqué dans l'audio — entraîne-toi à le capter au vol.", None),
   ("Reading : <b>Insert Text</b> et <b>Prose Summary</b>, 10 de chaque. Le Prose Summary vaut 2 points à lui seul : ne le bâcle jamais.", None),
   ("Speaking Task 3 (Reading + Lecture) : 3 réponses. La structure est fixe — le concept, puis les 2 exemples du cours. Chronomètre à 60 s pile.", None),
   ("Listening : 2 cours d'histoire de l'art ou de littérature. Ces sujets tombent souvent et leur lexique est le plus dense.", None),
   ("<b>Section Reading complète</b> (35 min). Objectif : 17/20 minimum. En dessous, reprends demain les types d'erreurs dominants.", None),
   ("🌿 Repos actif : lecture plaisir en anglais (un article long, Aeon ou The Atlantic). Sans dictionnaire.", R),
  ]),
  ("Semaine 5 — Listening en profondeur", "R & L", [
   ("Listening : questions <b>Attitude</b> et <b>Function</b>. Elles portent sur le ton, pas sur le contenu. 15 questions, puis réécoute les extraits ratés.", None),
   ("Reading : 2 passages chronométrés à 17 min chacun — plus serré que l'examen. S'entraîner sous pression rend le jour J confortable.", None),
   ("Speaking Task 4 (Academic Lecture) : 3 réponses. Résumer un cours de 2 min en 60 s : la densité prime sur l'élégance.", None),
   ("Writing Integrated : 2 sujets. Chronomètre la lecture (3 min) séparément de la rédaction (17 min).", None),
   ("Listening : 1 section complète en une seule écoute, sans pause. Puis analyse des notes — ce qui manque est exactement ce qu'il faut travailler.", None),
   ("<b>Section Listening complète</b> (36 min). Objectif : 24/28 minimum.", None),
   ("🌿 Repos actif : un podcast au choix et la révision Anki. Rien d'autre.", R),
  ]),
  ("Semaine 6 — Consolidation R & L", "R & L", [
   ("Reading puis Listening enchaînés (35 + 36 min) sans pause entre les deux. L'endurance est une compétence à part entière.", None),
   ("Analyse de l'enchaînement d'hier : le score de la 2e section baisse-t-il ? Si oui, c'est la fatigue qu'il faut entraîner, pas la technique.", None),
   ("Speaking : les 4 tâches d'affilée, enregistrées, en conditions réelles (16 min au total).", None),
   ("Writing : les 2 tâches d'affilée (29 min). Garde 2 min de relecture à la fin — les fautes d'accord coûtent cher.", None),
   ("Reading : reprends les 20 questions les plus ratées depuis la semaine 1 et refais-les. Ce qui résiste encore devient ta priorité.", None),
   ("<b>Sections Reading + Listening chronométrées</b>. Compare au diagnostic : l'écart doit être net.", None),
   ("🌿 Repos actif. Bilan de la phase 2 — Reading et Listening sont-ils au niveau visé ?", R),
  ]),
 ]),
 ("Phase 3 — Speaking & Writing vers 28+", "#EDE9FE", "#5B21B6", [
  ("Semaine 7 — Speaking : la fluidité", "S & W", [
   ("Speaking Task 1 : 8 réponses enregistrées. Un seul critère aujourd'hui — <b>aucun silence de plus de 2 s</b>. Le contenu passe après.", None),
   ("Construis ta banque de transitions (First of all, What's more, The reason being…). 15 formules apprises par cœur, réutilisables partout.", None),
   ("Speaking Task 2 : 5 réponses. Travaille la prise de notes pendant les 45 s de lecture — c'est là que la réponse se gagne.", None),
   ("Reading : 1 passage d'entretien. Puis Speaking Task 1 : 5 réponses. Une section entretenue ne redescend pas.", None),
   ("Réécoute 10 de tes enregistrements de la semaine. Note les 3 tics qui reviennent le plus souvent, et traque-les à partir de demain.", None),
   ("<b>Section Speaking complète chronométrée</b> (4 tâches, 16 min). Auto-évalue avec la grille officielle ETS, 0 à 4 par tâche.", None),
   ("🌿 Repos actif : shadowing détendu sur un TED Talk de 10 min — répète en même temps que l'orateur.", R),
  ]),
  ("Semaine 8 — Writing : structure et densité", "S & W", [
   ("Writing Integrated : 2 sujets. Le piège est de résumer le texte : c'est le <b>contraste</b> entre texte et audio qui est noté. Chaque paragraphe doit opposer les deux.", None),
   ("Academic Discussion : 3 réponses de 10 min. Objectif porté à 150 mots, avec une position nuancée (« While X argues…, I'd add that… »).", None),
   ("Listening : 1 section d'entretien. Puis Writing Integrated : 1 sujet complet.", None),
   ("Travail de la langue écrite : réécris 3 de tes paragraphes en remplaçant chaque mot générique par un mot de l'AWL. La densité lexicale fait le score.", None),
   ("Speaking Tasks 3 et 4 : 3 réponses chacune. Ce sont les tâches intégrées, les plus dures — elles méritent le double de temps.", None),
   ("<b>Section Writing complète chronométrée</b> (29 min). Relis-toi à froid demain, pas aujourd'hui.", None),
   ("🌿 Repos actif : lecture en anglais et Anki. Relis les productions d'hier à froid et corrige-les.", R),
  ]),
  ("Semaine 9 — Consolidation S & W", "S & W", [
   ("Speaking : les 4 tâches en conditions réelles. Compare à ton enregistrement de la semaine 7 — la différence doit s'entendre.", None),
   ("Writing : les 2 tâches en conditions réelles (29 min). Fais relire ton Academic Discussion par quelqu'un, ou passe-le à un correcteur.", None),
   ("Reading et Listening d'entretien, 1 section chacune. Puis 5 réponses Speaking Task 1.", None),
   ("Travail ciblé sur ta section la plus faible des 4 — celle que le dernier test désigne, pas celle que tu crois.", None),
   ("Speaking : 10 réponses courtes sur des sujets tirés au hasard. L'improvisation se travaille comme le reste.", None),
   ("<b>Sections Speaking + Writing chronométrées</b> d'affilée (45 min).", None),
   ("🌿 Repos actif. Bilan de la phase 3 — les 4 sections sont-elles au-dessus de 26 ?", R),
  ]),
 ]),
 ("Phase 4 — Intégration & tests blancs", "#FEF3C7", "#B45309", [
  ("Semaine 10 — Premier blanc complet", "Blancs", [
   ("🎯 <b>TOEFL blanc n° 1</b>, complet et en conditions réelles : même heure que ton examen, sans pause hors celle prévue, sans dictionnaire.", E),
   ("Correction intégrale du blanc n° 1. Pour chaque erreur : le type, la cause, et l'action qui l'évitera. Un tableau, pas une impression.", None),
   ("Travail ciblé n° 1 : la faiblesse la plus coûteuse identifiée hier. Des exercices uniquement sur elle.", None),
   ("Travail ciblé n° 2 : la deuxième faiblesse, même méthode.", None),
   ("Speaking : 4 tâches enregistrées, puis réécoute critique avec la grille ETS.", None),
   ("<b>Sections Reading + Listening chronométrées</b>. Vérifie que le travail ciblé a payé.", None),
   ("🌿 Repos actif : Anki et écoute libre. La récupération fait partie du plan, elle n'est pas du temps perdu.", R),
  ]),
  ("Semaine 11 — Deuxième blanc", "Blancs", [
   ("🎯 <b>TOEFL blanc n° 2</b>, complet, conditions réelles. Objectif : dépasser le blanc n° 1 d'au moins 5 points.", E),
   ("Correction du blanc n° 2 et comparaison avec le n° 1, section par section : ce qui a progressé, ce qui stagne.", None),
   ("Writing : 2 tâches complètes, en soignant particulièrement la relecture finale.", None),
   ("Speaking : 4 tâches, puis travail sur la faiblesse qui persiste depuis la phase 3.", None),
   ("Reading : 2 passages chronométrés. Puis révision des 100 mots AWL les moins sûrs.", None),
   ("<b>Ta section la plus faible</b>, complète et chronométrée. Une dernière passe technique dessus.", None),
   ("🌿 Repos actif. Prépare la logistique : lieu d'examen, pièce d'identité, trajet, horaire de convocation.", R),
  ]),
  ("Semaine 12 — Dernier blanc & examen", "🎯 Examen", [
   ("🎯 <b>TOEFL blanc n° 3</b>, complet, à l'horaire exact de ton examen. C'est la répétition générale.", E),
   ("Correction légère du blanc n° 3. Ne t'attaque qu'aux erreurs corrigeables en 5 jours — le reste attendra l'après-examen.", None),
   ("Révision : tes formules de transition Speaking, tes structures Writing, et tes 50 mots AWL les plus fragiles.", None),
   ("Une section de chaque, à mi-régime. Entretien, pas performance.", None),
   ("Speaking et Writing légers : 2 tâches chacune. Relis tes meilleures productions pour te rappeler ton niveau réel.", None),
   ("Révision très légère, 30 min au maximum, puis arrêt. Prépare tes affaires et couche-toi tôt : le sommeil vaut plus que la révision.", None),
   ("🎯 <b>JOUR D'EXAMEN — TOEFL iBT.</b> 84 jours de travail pour ce moment. Good luck!", E),
  ]),
 ]),
]


def esc(text):
    return text.replace('\\', '\\\\').replace('"', '\\"')


def build_phases_js():
    cursor = START
    out = ['    const phases = [']
    total = 0

    for name, bg, color, weeks in PHASES:
        out.append('      {')
        out.append('        name: "%s", bg: "%s", color: "%s", lbg: "%s", lc: "%s",'
                   % (name, bg, color, bg, color))
        out.append('        weeks: [')
        for wname, level, days in weeks:
            first, last = cursor, cursor + timedelta(days=len(days) - 1)
            if first.month == last.month:
                span = '%d–%d %s' % (first.day, last.day, MOIS[last.month - 1])
            else:
                span = '%d %s – %d %s' % (first.day, MOIS[first.month - 1],
                                          last.day, MOIS[last.month - 1])
            out.append('          {')
            out.append('            name: "%s", dates: "%s", level: "%s", days: ['
                       % (wname, span, level))
            for text, flag in days:
                label = '%s %d' % (JOURS[cursor.weekday()], cursor.day)
                extra = {R: ', rest: true', E: ', exam: true'}.get(flag, '')
                out.append('              {d: "%s", t: "%s"%s},' % (label, esc(text), extra))
                cursor += timedelta(days=1)
                total += 1
            out.append('            ]')
            out.append('          },')
        out.append('        ]')
        out.append('      },')
    out.append('    ];')
    return '\n'.join(out), total, cursor - timedelta(days=1)


# ── ressources, reprises du bloc de la page mandarin ─────────────────────────

RES_MARKUP = '''    <div class="res">
      <div class="res-head" id="resHead" role="button" tabindex="0">
        <h2>📚 Ressources — à installer avant le <span id="hdrDay1">Dim 20</span></h2>
        <span class="res-sub">Afficher / masquer ▾</span>
      </div>

      <div class="res-body open" id="resBody">
        <div class="res-grid">

          <div class="res-card">
            <h3>Officiel ETS (à utiliser en priorité)</h3>
            <ul>
              <li><a href="https://www.ets.org/toefl/test-takers/ibt/prepare.html" target="_blank" rel="noopener">TOEFL iBT Free Practice Test</a>
                <span class="note">Le test blanc officiel gratuit. Sert de diagnostic et de référence.</span></li>
              <li><a href="https://www.ets.org/toefl/test-takers/ibt/prepare/test-prep-course.html" target="_blank" rel="noopener">TOEFL Test Ready</a>
                <span class="note">Plateforme officielle : exercices et blancs supplémentaires.</span></li>
              <li><a href="https://www.ets.org/pdfs/toefl/toefl-ibt-free-practice-test.pdf" target="_blank" rel="noopener">Guide officiel (PDF)</a>
                <span class="note">Format exact, barèmes et grilles de notation Speaking / Writing.</span></li>
            </ul>
          </div>

          <div class="res-card">
            <h3>Vocabulaire (tous les jours)</h3>
            <ul>
              <li><a href="https://apps.ankiweb.net/" target="_blank" rel="noopener">Anki</a> + deck Academic Word List
                <span class="note">570 familles de mots. 25 par jour, hors des 2 h comptabilisées.</span></li>
              <li><a href="https://www.wgtn.ac.nz/lals/resources/academicwordlist" target="_blank" rel="noopener">Academic Word List (source)</a>
                <span class="note">La liste de référence, par sous-listes de fréquence.</span></li>
            </ul>
          </div>

          <div class="res-card">
            <h3>Listening & écoute longue</h3>
            <ul>
              <li><a href="https://www.ted.com/talks" target="_blank" rel="noopener">TED Talks</a>
                <span class="note">Transcripts disponibles : idéal pour vérifier ses notes.</span></li>
              <li><a href="https://www.sciencefriday.com/" target="_blank" rel="noopener">Science Friday</a>
                <span class="note">Registre académique, exactement celui des cours du test.</span></li>
              <li><a href="https://ocw.mit.edu/" target="_blank" rel="noopener">MIT OpenCourseWare</a>
                <span class="note">De vrais cours universitaires, le format des lectures TOEFL.</span></li>
            </ul>
          </div>

          <div class="res-card">
            <h3>Speaking</h3>
            <ul>
              <li>Enregistreur vocal du téléphone
                <span class="note">Le seul outil indispensable. Réécouter est ce qui fait progresser.</span></li>
              <li><a href="https://www.italki.com/" target="_blank" rel="noopener">italki</a>
                <span class="note">Un tuteur une fois par semaine si le budget le permet — le retour humain est décisif à 110+.</span></li>
            </ul>
          </div>

          <div class="res-card">
            <h3>Writing</h3>
            <ul>
              <li><a href="https://www.deepl.com/write" target="_blank" rel="noopener">DeepL Write</a> · <a href="https://languagetool.org/" target="_blank" rel="noopener">LanguageTool</a>
                <span class="note">Pour la correction de surface. Ne remplace pas une relecture humaine.</span></li>
              <li>Grilles ETS Writing (dans le guide officiel)
                <span class="note">Auto-évalue chaque production sur 5 — c'est le barème réel.</span></li>
            </ul>
          </div>

          <div class="res-card">
            <h3>Reading</h3>
            <ul>
              <li><a href="https://aeon.co/" target="_blank" rel="noopener">Aeon</a> · <a href="https://www.theatlantic.com/" target="_blank" rel="noopener">The Atlantic</a>
                <span class="note">Articles longs et argumentés, proches des passages du test.</span></li>
              <li><a href="https://www.nature.com/news" target="_blank" rel="noopener">Nature News</a>
                <span class="note">Vulgarisation scientifique dense, très proche des passages de biologie.</span></li>
            </ul>
          </div>

        </div>

        <div class="res-tips">
          <h3>Trois règles pour tenir les 12 semaines</h3>
          <ol>
            <li><b>Les jours de blanc dépassent les 2 h</b> — un test complet fait déjà 2 h sans la correction. Le minuteur compte au-delà de l'objectif, c'est prévu.</li>
            <li><b>Speaking et Writing tous les jours</b> — ce sont les sections les plus lentes à bouger depuis un B2, et celles qui bloquent un 110.</li>
            <li><b>Analyser vaut plus que refaire</b> — une section corrigée en profondeur apprend plus que trois sections enchaînées sans relecture.</li>
          </ol>
        </div>
      </div>
    </div>
'''

RES_SCRIPT = '''
    const resHead = document.getElementById('resHead');
    const resBody = document.getElementById('resBody');
    function toggleRes() { resBody.classList.toggle('open'); }
    resHead.addEventListener('click', toggleRes);
    resHead.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRes(); }
    });
'''


def main():
    src = io.open('roadmap-allemand.html', encoding='utf-8').read()
    mandarin = io.open('roadmap-mandarin.html', encoding='utf-8').read()

    def once(text, old, new, where):
        if text.count(old) != 1:
            sys.exit('%s : %d occurrence(s)' % (where, text.count(old)))
        return text.replace(old, new)

    phases_js, total, last = build_phases_js()
    if total != 84:
        sys.exit('%d jours générés au lieu de 84' % total)
    if last != date(2026, 12, 12):
        sys.exit('dernier jour = %s, attendu 2026-12-12' % last)

    # CSS du bloc ressources, repris tel quel de la page mandarin.
    # Attention : .hdr y précède .res, la tranche va donc de .res à .daily.
    res_css = mandarin[mandarin.index('    .res {'):mandarin.index('    .daily {')]
    if '.res-card' not in res_css or '.res-tips' not in res_css:
        sys.exit('extraction du CSS ressources incomplète (%d caractères)' % len(res_css))
    src = once(src, '    .hdr {', res_css + '    .hdr {', 'css ressources')

    src = once(src, '<title>Roadmap Allemand B1 – 14 semaines</title>',
               '<title>Roadmap TOEFL iBT – 12 semaines</title>', 'title')
    src = once(src, '      Roadmap allemand B1 – 14 semaines',
               '      Roadmap TOEFL iBT – 12 semaines, objectif 110+', 'h2 masqué')
    src = once(src, '<h1>Roadmap Allemand B1 — 14 semaines</h1>',
               '<h1>Roadmap TOEFL iBT — 12 semaines</h1>', 'h1')
    src = once(src,
               '<p>Début : <span id="hdrStart">21 juillet 2026</span> · Examen : '
               '<span id="hdrEnd">octobre 2026</span> · 3–4h/jour</p>',
               '<p>Début : <span id="hdrStart">20 septembre 2026</span> · Examen : '
               '<span id="hdrEnd">12 décembre 2026</span> · 2h/jour · '
               'Niveau de départ B2 · Objectif 110+</p>', 'sous-titre')

    # le bloc ressources se place entre le minuteur et la légende
    src = once(src, '    <div class="legend">', RES_MARKUP + '\n    <div class="legend">',
               'markup ressources')

    # données
    start = src.index('    const phases = [')
    end = src.index('\n    ];', start) + len('\n    ];')
    src = src[:start] + phases_js + src[end:]

    # clés de stockage et paramètres
    src = once(src, "const storageKey = 'roadmap-b1-checklist';",
               "const storageKey = 'roadmap-toefl-checklist';", 'clé progression')
    src = once(src, "      key: 'roadmap-allemand-start',",
               "      key: 'roadmap-toefl-start',", 'clé dates')
    src = once(src, "      defaultStart: '2026-07-21',",
               "      defaultStart: '2026-09-20',", 'date de départ')
    src = once(src, "      key: 'roadmap-allemand-timer',",
               "      key: 'roadmap-toefl-timer',", 'clé minuteur')
    src = once(src, '      defaultGoal: 3 * 3600', '      defaultGoal: 2 * 3600', 'objectif')

    # l'examen tombe un jour précis : date complète plutôt que mois seul
    src = once(src,
               "document.getElementById('hdrEnd').textContent = RoadmapDates.formatMonth(RoadmapDates.lastDate());",
               "document.getElementById('hdrEnd').textContent = RoadmapDates.formatLong(RoadmapDates.lastDate());\n"
               "      document.getElementById('hdrDay1').textContent = RoadmapDates.dayLabel(RoadmapDates.dateFor(0));",
               'en-tête dynamique')

    src = once(src, '\n  </script>', RES_SCRIPT + '  </script>', 'script ressources')

    io.open('roadmap-toefl.html', 'w', encoding='utf-8').write(src)
    print('roadmap-toefl.html : %d jours, du %s au %s' % (total, START, last))


if __name__ == '__main__':
    main()
