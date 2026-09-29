#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fabrique business-produire-local.html à partir de la source à marqueurs.

Aucun calcul n'est refait ici : les chiffres sont demandés à
business-produire-local.js, qui est la source unique du modèle et qui tourne
aussi bien dans le navigateur que sous node. Ce script ne fait que mettre en
forme ce que le modèle lui répond, et dessiner les schémas.

    python3 substitution.py          # résumé à l'écran
    python3 substitution.py inject   # écrit la page
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import figs

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(__file__).parent / "business-produire-local.src.html"
OUT = ROOT / "business-produire-local.html"
NB = " "   # espace fine insécable, comme dans le module JS

INK, MUT, LINE = figs.INK, figs.MUT, figs.LINE
VERT = "#15803d"
COL = [VERT, "#0f766e", "#4338ca", "#b45309", "#be123c", "#475569"]


# ───────────────────────── le modèle, interrogé une fois ─────────────────────────

def modele():
    """Demande à node l'état complet du modèle avec les hypothèses d'origine."""
    js = """
      const L = require(%s);""" % json.dumps(str(ROOT / "business-produire-local.js")) + """
      const p = L.DEFAULTS;
      process.stdout.write(JSON.stringify({
        params: L.PARAMS, groupes: L.GROUPES, defaults: p,
        fiches: L.FICHES.map(f => ({
          cle: f.cle, n: f.n, palier: f.palier, titre: f.titre, court: f.court,
          geste: f.geste, soustitre: f.soustitre, tags: f.tags,
          unite: f.unite, unites: f.unites, notes: f.notes, heures: f.heures,
          bloque: f.bloque, risques: f.risques, phases: f.phases,
          vol: f.vol, prud: f.prud, perte: f.perte
        })),
        paliers: L.PALIERS, pistes: L.PISTES,
        d: L.compute(p), v: L.values(p), figs: L.figures(p)
      }));
    """
    r = subprocess.run(["node", "-e", js], capture_output=True, text=True)
    if r.returncode:
        sys.exit("!! le modèle n'a pas répondu :\n" + r.stderr)
    return json.loads(r.stdout)


M = modele()
D, V, F = M["d"], M["v"], M["fiches"]
PAL, PIS = M["paliers"], M["pistes"]


def ar(n):
    return f"{int(round(n)):,}".replace(",", NB)


def mar(n):
    """Même règle que mAr() du module JS : « 2 Md » plutôt que « 2,00 Md »."""
    def court(v):
        return f"{round(v):d}" if abs(v - round(v)) < 0.05 else f"{v:.1f}".replace(".", ",")
    v = n / 1_000_000
    return court(v / 1000) + " Md" if abs(v) >= 1000 else court(v) + " M"


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def sp(cle):
    """<span data-v> lié au modèle : la valeur figée ici est celle que le JS
       recalculera, puisque les deux viennent du même appel."""
    if cle not in V:
        sys.exit(f"!! clé inconnue du modèle : {cle}")
    return f'<span data-v="{cle}">{V[cle]}</span>'


def lex(cle, texte):
    return f'<a href="#lex-{cle}" class="lex" data-lex="{cle}">{texte}</a>'


# ═════════════════════════ schémas propres à cette page ═════════════════════════

def escalier():
    """Les quatre paliers, en marches. Le schéma qui porte tout le document."""
    w, h = 460, 300
    l, b, t = 6, 46, 14
    pw, ph = w - l - 8, h - t - b
    n = len(PAL)
    sw = pw / n
    out = [f'<svg viewBox="0 0 {w} {h}" role="img" '
           f'aria-label="Les quatre paliers de capital">']
    for i, (num, geste, lo, hi, quoi, gain) in enumerate(PAL):
        x = l + i * sw
        mh = ph * (i + 1) / n
        y = t + ph - mh
        col = COL[i % len(COL)]
        out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{sw - 6:.1f}" height="{mh:.1f}" '
                   f'fill="{col}" opacity="0.12" rx="3"/>')
        out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{sw - 6:.1f}" height="3" '
                   f'fill="{col}" rx="1.5"/>')
        cx = x + (sw - 6) / 2
        out.append(f'<text x="{cx:.1f}" y="{y + 20:.1f}" text-anchor="middle" font-size="11.5" '
                   f'font-weight="700" fill="{col}">{esc(geste)}</text>')
        out.append(f'<text x="{cx:.1f}" y="{y + 35:.1f}" text-anchor="middle" font-size="9.5" '
                   f'fill="{MUT}">{mar(lo)} – {mar(hi)}</text>')
        out.append(f'<circle cx="{cx:.1f}" cy="{t + ph + 16}" r="10" fill="{col}"/>')
        out.append(f'<text x="{cx:.1f}" y="{t + ph + 20}" text-anchor="middle" font-size="10.5" '
                   f'font-weight="700" fill="white">{num}</text>')
    out.append(f'<line x1="{l}" y1="{t + ph}" x2="{l + pw}" y2="{t + ph}" '
               f'stroke="{LINE}" stroke-width="1.5"/>')
    out.append(f'<text x="{l}" y="{h - 8}" font-size="9.5" fill="{MUT}">'
               f'La marge monte à chaque marche — et le capital aussi</text>')
    out.append("</svg>")
    return "".join(out)


def arbre():
    """Les cinq questions à poser devant n'importe quel produit importé."""
    qs = [
        ("Est-il vraiment importé, et en quantité ?",
         "Si personne ne l’importe, il n’y a pas de marché à reprendre."),
        ("La matière première est-elle ici ?",
         "Sinon tu importes la matière : tu déplaces le problème, tu ne le résous pas."),
        ("Le fret et la douane pèsent-ils lourd ?",
         "C’est ton avance de départ. Un produit léger et cher ne t’en donne aucune."),
        ("Sais-tu le faire à qualité constante ?",
         "Moins cher ne suffit jamais. Irrégulier, le client revient à l’import."),
        ("Peux-tu tenir le prix si le cours baisse ?",
         "Le jour où l’import casse ses prix, il faut pouvoir encaisser."),
    ]
    w = 460
    rowh = 54
    h = 16 + len(qs) * rowh
    x0 = 24
    out = [f'<svg viewBox="0 0 {w} {h}" role="img" '
           f'aria-label="Les cinq questions avant de se lancer">']
    out.append(f'<line x1="{x0}" y1="18" x2="{x0}" y2="{h - 30}" '
               f'stroke="{LINE}" stroke-width="2"/>')
    for i, (q, pourquoi) in enumerate(qs):
        y = 20 + i * rowh
        out.append(f'<circle cx="{x0}" cy="{y}" r="11" fill="{VERT}"/>')
        out.append(f'<text x="{x0}" y="{y + 4}" text-anchor="middle" font-size="11" '
                   f'font-weight="700" fill="white">{i + 1}</text>')
        out.append(f'<text x="{x0 + 22}" y="{y - 1}" font-size="11.5" font-weight="700" '
                   f'fill="{INK}">{esc(q)}</text>')
        out.append(f'<text x="{x0 + 22}" y="{y + 14}" font-size="10" fill="{MUT}">'
                   f'{esc(pourquoi)}</text>')
    out.append(f'<text x="{x0 - 18}" y="{h - 8}" font-size="9.5" fill="{MUT}">'
               f'Cinq oui : c’est une piste. Un seul non : passe au produit suivant.</text>')
    out.append("</svg>")
    return "".join(out)


def frise_dangote():
    return figs.timeline([
        ("Fin des années 1970 — le négoce",
         "Un prêt familial, des camions, du ciment importé revendu au détail."),
        ("Les années 1980 — l’échelle",
         "Sucre, farine, sel : il élargit ce qu’il distribue et accumule du capital."),
        ("Les années 1990 — le basculement",
         "Il arrête de revendre ce qu’il importe et construit ses propres unités."),
        ("Les années 2000 — le ciment",
         "Cimenteries au Nigeria, puis dans une quinzaine de pays africains."),
        ("Aujourd’hui — la position",
         "Premier producteur de ciment du continent : il fixe le prix au lieu de le subir."),
    ])


def imports_madagascar():
    """Les familles de produits que Madagascar achète dehors. Ordres de grandeur
       de la structure des importations, pas un relevé statistique : d'où les
       largeurs en parts relatives et non en chiffres."""
    rows = [
        ("Produits pétroliers", 100, "incompressible"),
        ("Riz et céréales", 62, "attaquable"),
        ("Machines et véhicules", 58, "hors de portée"),
        ("Médicaments", 44, "très encadré"),
        ("Huiles alimentaires", 38, "attaquable"),
        ("Engrais et intrants", 33, "attaquable"),
        ("Fer, acier, ciment", 31, "en partie"),
        ("Plastiques et emballages", 28, "attaquable"),
        ("Sucre", 22, "attaquable"),
        ("Lait et produits laitiers", 18, "attaquable"),
        ("Friperie et textile", 15, "attaquable"),
    ]
    couleurs = {"attaquable": VERT, "en partie": "#0f766e",
                "incompressible": "#9ca3af", "hors de portée": "#9ca3af",
                "très encadré": "#b45309"}
    w, labw = 460, 150
    barx = labw + 8
    barw = w - barx - 110
    top, rowh, gap = 8, 24, 6
    h = top + len(rows) * (rowh + gap)
    out = [f'<svg viewBox="0 0 {w} {h}" role="img" '
           f'aria-label="Ce que Madagascar achète à l’étranger, en parts relatives">']
    for i, (lab, val, verdict) in enumerate(rows):
        y = top + i * (rowh + gap)
        bw = max(2, barw * val / 100)
        col = couleurs[verdict]
        out.append(f'<text x="0" y="{y + 16}" font-size="10.5" fill="{INK}">{esc(lab)}</text>')
        out.append(f'<rect x="{barx}" y="{y + 3}" width="{bw:.1f}" height="{rowh - 6}" '
                   f'fill="{col}" rx="2"/>')
        out.append(f'<text x="{barx + bw + 7:.1f}" y="{y + 16}" font-size="9.5" '
                   f'fill="{MUT}">{esc(verdict)}</text>')
    out.append("</svg>")
    return "".join(out)


def matrice():
    """Capital engagé contre rendement annuel — les cinq fiches et les dix pistes."""
    pts = []
    for i, f in enumerate(D["fiches"]):
        pts.append((f["court"], f["investTotal"], f["rendement"], COL[i % len(COL)]))
    w, h = 460, 300
    l, r, t, b = 46, 14, 16, 40
    pw, ph = w - l - r, h - t - b
    xmax = max(p[1] for p in pts) * 1.15
    ymax = max(p[2] for p in pts) * 1.15
    out = [f'<svg viewBox="0 0 {w} {h}" role="img" '
           f'aria-label="Capital engagé et rendement annuel">']
    out.append(f'<rect x="{l}" y="{t}" width="{pw}" height="{ph}" fill="#f9fafb" '
               f'stroke="{LINE}"/>')
    for k in (0.25, 0.5, 0.75):
        out.append(f'<line x1="{l + pw * k}" y1="{t}" x2="{l + pw * k}" y2="{t + ph}" '
                   f'stroke="{LINE}" stroke-dasharray="3 4"/>')
        out.append(f'<line x1="{l}" y1="{t + ph * k}" x2="{l + pw}" y2="{t + ph * k}" '
                   f'stroke="{LINE}" stroke-dasharray="3 4"/>')
    for nom, x, y, col in pts:
        px = l + pw * x / xmax
        py = t + ph - ph * y / ymax
        out.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="7" fill="{col}"/>')
        anc = "end" if px > l + pw * 0.62 else "start"
        dx = -11 if anc == "end" else 11
        out.append(f'<text x="{px + dx:.1f}" y="{py + 4:.1f}" text-anchor="{anc}" '
                   f'font-size="10" font-weight="600" fill="{INK}">{esc(nom)}</text>')
    out.append(f'<text x="{l + pw / 2}" y="{h - 12}" text-anchor="middle" font-size="10" '
               f'fill="{MUT}">Capital engagé →</text>')
    out.append(f'<text transform="translate(13,{t + ph / 2}) rotate(-90)" text-anchor="middle" '
               f'font-size="10" fill="{MUT}">Rendement annuel →</text>')
    out.append("</svg>")
    return "".join(out)


# ═════════════════════════ fragments de texte ═════════════════════════

def fig(svg, legende, cle=None):
    """Une figure : le dessin, puis ce qu'il faut y lire."""
    attr = f' data-fig="{cle}"' if cle else ""
    return (f'<div class="fig"><div class="fig-chart"{attr}>{svg}</div>'
            f'<p class="fig-cap">{legende}</p></div>')


def lignes(items, total_lbl, total_cle, prefixe):
    """Tableau de lignes chiffrées, avec sa ligne de total liée au modèle."""
    out = ['<div class="table-wrap"><table class="tbl"><tbody>']
    for i, (lab, _val) in enumerate(items):
        out.append(f'<tr><td>{lab}</td><td class="num">{sp(prefixe + str(i))} Ar</td></tr>')
    out.append(f'<tr class="total"><td>{total_lbl}</td>'
               f'<td class="num">{sp(total_cle)} Ar</td></tr>')
    out.append("</tbody></table></div>")
    return "".join(out)


def tableau_12(f, d):
    """Le prévisionnel des douze mois. Chaque cellule est liée au modèle."""
    n = f["n"]
    notes = {int(k): v for k, v in f["notes"].items()}
    out = ['<div class="table-wrap"><table class="tbl"><thead><tr>'
           '<th>Mois</th>'
           f'<th class="num">{esc(f["unites"].capitalize())}</th>'
           f'<th class="num">{lex("chiffre-affaires", "Chiffre d’affaires")}</th>'
           f'<th class="num">{lex("cout-variable", "Coût variable")}</th>'
           f'<th class="num">{lex("charges-fixes", "Charges fixes")}</th>'
           '<th class="num">Net du mois</th>'
           f'<th class="num">{lex("tresorerie", "Trésorerie cumulée")}</th>'
           '</tr></thead><tbody>']
    for i in range(12):
        m = i + 1
        lab = str(m) + (f" — {notes[m]}" if m in notes else "")
        k = f"f{n}_m{m}_"
        out.append(
            f'<tr><td>{lab}</td>'
            f'<td class="num">{sp(k + "q")}</td>'
            f'<td class="num">{sp(k + "ca")}</td>'
            f'<td class="num">{sp(k + "cv")}</td>'
            f'<td class="num">{sp(k + "fx")}</td>'
            f'<td class="num">{sp(k + "net")}</td>'
            f'<td class="num">{sp(k + "cum")}</td></tr>')
    k = f"f{n}_"
    out.append(f'<tr class="total"><td>Total 12 mois</td>'
               f'<td class="num">{sp(k + "tq")}</td>'
               f'<td class="num">{sp(k + "tca")}</td>'
               f'<td class="num">{sp(k + "tcv")}</td>'
               f'<td class="num">{sp(k + "tfx")}</td>'
               f'<td class="num">{sp(k + "tnet")}</td>'
               f'<td class="num">{sp(k + "tcum")}</td></tr>')
    out.append("</tbody></table></div>")
    return "".join(out)


def kpis(f, d):
    n = f["n"]
    pal = PAL[f["palier"] - 1]
    cases = [
        ("Investissement", sp(f"f{n}_inv") + " Ar",
         f'Palier {pal[0]} — {esc(pal[1].lower())}'),
        (lex("point-mort", "Retour sur la mise"), sp(f"f{n}_retour"),
         "En scénario prudent : " + sp(f"f{n}_retourp")),
        (lex("plafond", "Bénéfice mensuel au plafond"), sp(f"f{n}_plafond") + " Ar",
         "Une fois la montée en charge finie"),
        (lex("rendement", "Rendement annuel"), sp(f"f{n}_rendement"),
         "Par ariary investi, au rythme de croisière"),
    ]
    out = ['<div class="kpis">']
    for lab, val, sub in cases:
        out.append(f'<div class="kpi"><div class="kpi-lbl">{lab}</div>'
                   f'<div class="kpi-val">{val}</div>'
                   f'<div class="kpi-sub">{sub}</div></div>')
    out.append("</div>")
    return "".join(out)


def risques(f):
    """Contrat de business-plan.css : <b> pour le titre, puis .parade — la feuille
       ajoute elle-même le préfixe « Parade — », qu'il ne faut donc pas réécrire."""
    out = []
    for titre, quoi, parade in f["risques"]:
        out.append(f'<div class="risk"><b>{esc(titre)}</b>{quoi} '
                   f'<span class="parade">{parade}</span></div>')
    return "".join(out)


def phases(f):
    """Contrat : .when pour le moment, <h4> pour ce qu'on y fait."""
    out = ['<div class="phases">']
    for quand, quoi in f["phases"]:
        titre, sep, suite = quoi.partition(". ")
        # sans séparateur, partition renvoie la phrase entière : elle porte déjà son point
        if sep:
            titre += "."
        out.append(f'<div class="phase"><div class="when">{esc(quand)}</div>'
                   f'<h4>{titre}</h4>'
                   + (f'<p>{suite}</p>' if suite else "") + '</div>')
    out.append("</div>")
    return "".join(out)


def comparatif():
    out = ['<div class="table-wrap"><table class="tbl"><thead><tr>'
           '<th>Business</th><th>Palier</th>'
           '<th class="num">Investissement</th>'
           f'<th class="num">{lex("seuil", "Seuil")}</th>'
           f'<th class="num">{lex("point-mort", "Retour")}</th>'
           f'<th class="num">{lex("plafond", "Au plafond")}</th>'
           f'<th class="num">{lex("rendement", "Rendement / an")}</th>'
           '</tr></thead><tbody>']
    for f in D["fiches"]:
        n = f["n"]
        out.append(
            f'<tr><td><b>{esc(f["court"])}</b></td>'
            f'<td>{f["palier"]} — {esc(PAL[f["palier"] - 1][1].lower())}</td>'
            f'<td class="num">{sp(f"f{n}_inv")} Ar</td>'
            f'<td class="num">{sp(f"f{n}_seuil")} {esc(f["unites"])} / mois</td>'
            f'<td class="num">{sp(f"f{n}_retour")}</td>'
            f'<td class="num">{sp(f"f{n}_plafond")} Ar</td>'
            f'<td class="num">{sp(f"f{n}_rendement")}</td></tr>')
    out.append('</tbody></table></div>')
    return "".join(out)


def table_paliers():
    out = ['<div class="table-wrap"><table class="tbl"><thead><tr>'
           '<th>Palier</th><th>Le geste</th><th class="num">Capital</th>'
           '<th>Ce que tu y gagnes</th></tr></thead><tbody>']
    for num, geste, lo, hi, quoi, gain in PAL:
        out.append(f'<tr><td><b>{num}</b></td><td><b>{esc(geste)}</b><br>'
                   f'<span class="muted">{esc(quoi)}</span></td>'
                   f'<td class="num">{mar(lo)} – {mar(hi)} Ar</td>'
                   f'<td>{esc(gain)}</td></tr>')
    out.append("</tbody></table></div>")
    return "".join(out)


def table_pistes():
    out = ['<div class="table-wrap"><table class="tbl"><thead><tr>'
           '<th>Piste</th><th>Secteur</th><th class="num">Ordre de grandeur</th>'
           '<th>Ce que ça remplace</th></tr></thead><tbody>']
    for nom, secteur, capital, palier, quoi in PIS:
        out.append(f'<tr><td><b>{esc(nom)}</b></td><td>{esc(secteur)}</td>'
                   f'<td class="num">{mar(capital)} Ar<br>'
                   f'<span class="muted">palier {palier}</span></td>'
                   f'<td>{esc(quoi)}</td></tr>')
    out.append("</tbody></table></div>")
    return "".join(out)


# ═════════════════════════ lexique ═════════════════════════

def entree(cle, titre, definition, calcul, exemple, piege):
    return (f'<article class="lex-entry" id="lex-{cle}"><h3>{titre}</h3>'
            f'<p class="lex-def">{definition}</p>'
            f'<p class="lex-calc"><b>Le calcul —</b> {calcul}</p>'
            f'<p class="lex-ex"><b>Sur cette page —</b> {exemple}</p>'
            f'<p class="lex-piege"><b>Le piège —</b> {piege}</p></article>')


def lexique():
    f2 = D["fiches"][1]
    e = [
        entree("valeur-caf", "Valeur CAF",
               "Le prix de la marchandise <b>rendue au port</b> : le prix sorti d’usine, plus le "
               "transport et l’assurance. C’est sur elle que la douane calcule.",
               "Prix usine + fret + assurance.",
               f'Le sac d’engrais : {sp("fobAr")} Ar sorti d’usine, {sp("fretAr")} Ar de fret, '
               f'donc {sp("caf")} Ar de valeur CAF.',
               "La douane ne taxe jamais le prix d’achat, mais la valeur CAF. Un fret bon marché "
               "réduit donc aussi les droits, deux fois plutôt qu’une."),
        entree("droits", "Droits de douane",
               "Ce que l’État prélève à l’entrée d’une marchandise sur le territoire.",
               "Valeur CAF × taux. Le taux dépend de la position tarifaire du produit.",
               f'{sp("droitsPct")} sur {sp("caf")} Ar, soit {sp("droitsAr")} Ar par sac.',
               "C’est la part que le producteur local <b>ne paie pas</b>. Avec le fret, elle "
               f'représente {sp("evitePct")} du prix au marché : c’est ton avance de départ, '
               "et elle est acquise avant même d’avoir produit quoi que ce soit."),
        entree("prix-revient", "Prix de revient",
               "Ce que la marchandise te coûte réellement, une fois <b>tout</b> payé : achat, "
               "transport, taxes, manutention.",
               "Pour l’importateur : valeur CAF + droits + TVA. Pour toi qui produis : matières "
               "+ main-d’œuvre + énergie + part des charges fixes.",
               f'L’importateur revient à {sp("revientImp")} Ar sur un sac parti à '
               f'{sp("fobAr")} Ar d’usine.',
               "Le prix usine n’en est que la moitié. Comparer un prix usine étranger à ton coût "
               "de production, c’est se tromper de bataille : compare au prix de revient rendu."),
        entree("coefficient", "Coefficient",
               "De combien le prix a été multiplié entre la sortie d’usine à l’étranger et "
               "l’étalage.",
               "Prix au marché ÷ prix usine.",
               f'{sp("rayon")} ÷ {sp("fobAr")} = <b>{sp("coefImport")}</b>.',
               "Un gros coefficient ne veut pas dire que l’importateur s’enrichit : l’essentiel "
               "part en fret, en douane et en TVA. Mais il mesure l’espace dans lequel un "
               "producteur local peut se glisser."),
        entree("chiffre-affaires", "Chiffre d’affaires",
               "Tout l’argent que les clients te versent sur le mois, avant d’avoir payé quoi que "
               "ce soit.",
               "Nombre de ventes × prix de vente, pertes et invendus déduits.",
               f'L’engrais organique au douzième mois : {sp("f2_m12_ca")} Ar. Il en reste '
               f'{sp("f2_m12_net")} Ar une fois tout payé.',
               "Ce n’est pas ce que tu gagnes. C’est l’erreur la plus fréquente et la plus chère."),
        entree("cout-variable", "Coût variable",
               "Ce que te coûte <b>chaque unité produite</b> : la matière, l’emballage, l’énergie "
               "de la machine. Produire zéro ne coûte rien.",
               "Coût variable unitaire × nombre d’unités.",
               f'Un sac d’engrais organique coûte {sp("f2_var")} Ar à produire, pour un prix de '
               f'vente de {sp("f2_prix")} Ar.',
               "Il monte avec les ventes : il ne se « rattrape » jamais au volume. Seules les "
               "charges fixes se diluent quand tu produis plus."),
        entree("charges-fixes", "Charges fixes",
               "Ce que tu payes <b>même en ne produisant rien</b> : salaires, loyer, électricité "
               "d’abonnement, gardiennage.",
               "Un total par mois, indépendant du volume produit.",
               f'La provende paye {sp("f4_fixes")} Ar par mois, que le broyeur tourne ou non.',
               "Plus le palier est haut, plus elles écrasent. C’est pour ça qu’une usine à "
               "l’arrêt saigne beaucoup plus vite qu’un dépôt fermé."),
        entree("marge", "Marge",
               "Ce qui reste sur <b>une</b> vente une fois son coût variable payé. C’est elle qui "
               "sert à couvrir les charges fixes.",
               "Prix de vente − coût variable, pertes déduites.",
               f'Un parpaing se vend {sp("f3_prix")} Ar et coûte {sp("f3_var")} Ar : il reste '
               f'{sp("f3_marge")} Ar, soit {sp("f3_margePct")} du prix.',
               "Une marge par unité n’est pas un bénéfice. Sur les parpaings il en faut "
               f'{sp("f3_seuil")} par mois avant de gagner le premier ariary.'),
        entree("seuil", "Seuil de rentabilité",
               "Le nombre d’unités qu’il faut produire et vendre <b>dans le mois</b> pour ne pas "
               "perdre d’argent ce mois-là.",
               "Charges fixes ÷ marge par unité.",
               f'La provende : {sp("f4_fixes")} Ar ÷ {sp("f4_marge")} Ar = '
               f'<b>{sp("f4_seuil")} sacs par mois</b>.',
               "Il se compte en unités, pas en ariary — c’est ce qui le rend vérifiable le soir "
               "en comptant les sacs. Et l’atteindre ne veut pas dire avoir récupéré sa mise."),
        entree("point-mort", "Retour sur la mise",
               "Le moment où tu as <b>récupéré tout l’argent investi</b>. À partir de là, "
               "l’affaire a remboursé son installation.",
               "Le premier mois où la trésorerie cumulée repasse au-dessus de zéro. Au-delà du "
               "douzième mois, le calcul se prolonge au rythme de croisière.",
               f'Le dépôt d’intrants : {sp("f1_retour")}. La rizerie : {sp("f5_retour")}.',
               "Plus le palier est haut, plus il est long — c’est normal et ce n’est pas un "
               "défaut. Ce qui doit t’alerter, c’est la colonne du scénario prudent : les "
               f'parpaings n’y remboursent {sp("f3_retourp")}.'),
        entree("tresorerie", "Trésorerie cumulée",
               "L’argent réellement disponible depuis le premier jour : l’investissement en "
               "négatif, puis chaque bénéfice mensuel ajouté.",
               "Trésorerie du mois précédent + net du mois. Elle démarre à moins le montant "
               "investi.",
               f'La rizerie démarre à − {sp("f5_inv")} Ar. La profondeur de ce trou dit de combien '
               "d’argent il faut disposer avant que l’affaire ne se porte elle-même.",
               "C’est elle qui met en faillite, pas le bénéfice. On peut être rentable chaque "
               "mois et manquer d’argent en caisse — c’est exactement ce qui arrive aux rizeries "
               "en campagne d’achat."),
        entree("fonds-roulement", "Fonds de roulement",
               "L’argent qu’il faut <b>avancer</b> avant d’encaisser quoi que ce soit : le stock, "
               "la matière première, le premier cycle de production.",
               "Ce qu’un cycle complet consomme avant sa première vente.",
               "La rizerie en prévoit 120 millions d’ariary de paddy : le riz s’achète en trois "
               "mois et se vend en douze.",
               "Il figure à l’investissement parce qu’il faut l’<b>avoir</b>, mais ce n’est pas "
               "une dépense : c’est ce qui finance le trou du départ. Le sous-estimer est la "
               "première cause d’arrêt d’une unité de production."),
        entree("plafond", "Plafond",
               "Le bénéfice mensuel maximal que l’affaire atteint <b>seule</b>, une fois lancée. "
               "Au-delà, il faut une machine de plus ou une équipe de plus.",
               "Le net du mois en régime de croisière, quand les volumes ne montent plus.",
               f'Le dépôt plafonne à {sp("f1_plafond")} Ar par mois ; la rizerie à '
               f'{sp("f5_plafond")} Ar.',
               "C’est la colonne qui dit ce que l’affaire <b>rapporte</b>, quand le rendement dit "
               "seulement ce qu’elle rapporte <b>par ariary investi</b>. Les deux ne classent pas "
               "les business dans le même ordre."),
        entree("rendement", "Rendement annuel",
               "Ce que rapporte chaque ariary investi en une année pleine, une fois la montée en "
               "charge terminée.",
               "Bénéfice mensuel au plafond × 12 ÷ investissement.",
               f'Le dépôt : {sp("f1_rendement")}. La rizerie : {sp("f5_rendement")}.',
               f'Le dépôt écrase la rizerie en rendement et pourtant la rizerie rapporte '
               f'<b>bien davantage</b> : {sp("f5_plafond")} Ar par mois contre '
               f'{sp("f1_plafond")} Ar. Un rendement énorme signale souvent un petit capital, '
               "pas une bonne affaire. C’est toute la différence entre bien placer son argent et "
               "construire quelque chose."),
    ]
    return '<div class="lex-list">' + "".join(e) + "</div>"


# ═════════════════════════ assemblage ═════════════════════════

def fragments():
    d = {}
    f0 = D["fiches"]

    d["frise"] = fig(
        frise_dangote(),
        "<b>Le parcours, et non le montant.</b> Les sommes de départ qui circulent sur les "
        "réseaux se contredisent d’une version à l’autre, et la plupart viennent d’une conversion "
        "malmenée de nairas des années 1970 : elles ne valent pas la peine d’être répétées. Ce qui "
        "est solide, c’est la <b>forme</b> — revendre d’abord ce qui est importé, apprendre le "
        "marché en le faisant, puis remonter jusqu’à produire la matière. C’est reproductible ; "
        "un chiffre de départ ne l’est pas.")

    d["imports"] = fig(
        imports_madagascar(),
        "<b>Les familles de produits que Madagascar achète dehors</b>, en parts relatives et non "
        "en valeur — cette page ne dispose pas des relevés de la douane et ne fera pas semblant. "
        "Ce qui compte ici est le <b>tri</b> : le pétrole et les machines ne se substituent pas, "
        "le médicament est trop encadré pour ce document, mais le riz, l’huile, l’engrais, "
        "l’emballage, le sucre et le lait sont à portée d’un atelier ou d’une petite usine. "
        "Vérifie l’ordre auprès de l’INSTAT avant d’engager quoi que ce soit.")

    d["cascade"] = fig(
        M["figs"]["cascade"],
        f'<b>Un sac d’engrais de 50 kg, de l’usine étrangère au marché.</b> Parti à '
        f'{sp("fobAr")} Ar, il arrive à {sp("rayon")} Ar — soit '
        f'<b>{sp("coefImport")} fois</b> son prix de départ. Le producteur local ne paie ni le '
        f'fret ni les droits de douane : {sp("evite")} Ar par sac, '
        f'<b>{sp("evitePct")} du prix final</b>, acquis avant d’avoir produit la moindre unité. '
        "C’est dans cet espace que tout ce document travaille. La TVA, elle, dépend de ton régime "
        "fiscal : à vérifier auprès du centre fiscal, c’est l’une des hypothèses modifiables.",
        cle="cascade")

    d["arbre"] = fig(
        arbre(),
        "<b>La grille à passer avant de s’enthousiasmer.</b> La question 2 élimine le plus de "
        "fausses bonnes idées : assembler ici des composants importés, ce n’est pas substituer un "
        "import, c’est en créer un autre. Et la question 5 est celle qu’on oublie — le jour où "
        "l’importateur casse ses prix pour te sortir du marché, il faut pouvoir tenir.")

    d["escalier"] = fig(
        escalier(),
        "<b>Chaque marche finance la suivante.</b> C’est le seul chemin qu’a réellement emprunté "
        "Dangote, et c’est celui que ce document décrit : on ne saute pas du palier 1 au palier 4. "
        "On revend, on apprend qui achète quoi, on accumule, puis on produit.")

    d["paliers"] = table_paliers()
    d["comparatif"] = comparatif()
    d["pistes"] = table_pistes()
    d["lexique"] = lexique()

    d["capital"] = fig(
        M["figs"]["capital"],
        f'<b>Ce que chaque business immobilise avant le premier ariary encaissé.</b> De '
        f'{sp("investMin")} Ar à {sp("investMax")} Ar : un rapport de plus de soixante entre le '
        "premier barreau et le dernier. Ces montants suivent tes hypothèses — change le prix du "
        "ciment ou du paddy et les barres se redessinent.",
        cle="capital")

    d["marges"] = fig(
        M["figs"]["marges"],
        "<b>La part de la marge dans le prix de vente.</b> Elle dit à quel point l’affaire "
        f'supporte un imprévu. L’engrais organique respire à {sp("f2_margePct")} ; les parpaings '
        f'vivent à {sp("f3_margePct")}, ce qui veut dire qu’une hausse du ciment de dix pour cent '
        "efface la moitié du bénéfice. Ce n’est pas un défaut du métier : c’est ce qui oblige à "
        "faire du volume et à tenir ses coûts au gramme.",
        cle="marges")

    d["matrice"] = fig(
        matrice(),
        "<b>Capital engagé contre rendement annuel.</b> La pente est nette et c’est la leçon "
        "principale du document : <b>plus on monte l’échelle, moins chaque ariary rapporte — et "
        "plus le gain total est grand</b>. Le dépôt d’intrants affiche le meilleur rendement de "
        f'tous, {sp("f1_rendement")}, et ne dégagera jamais plus de {sp("f1_plafond")} Ar par '
        f'mois. La rizerie rend {sp("f5_rendement")} et rapporte {sp("f5_plafond")} Ar. Choisir, '
        "c’est décider lequel des deux on cherche.")

    # ── par fiche
    for i, f in enumerate(F):
        n = f["n"]
        dd = f0[i]
        k = f"f{n}:"
        d[k + "invest"] = lignes(dd["invest"], "Total à engager", f"f{n}_inv", f"f{n}_i")
        d[k + "fixes"] = lignes(dd["fixesLignes"], "Total par mois", f"f{n}_fixes", f"f{n}_x")
        d[k + "kpis"] = kpis(f, dd)
        d[k + "tableau"] = tableau_12(f, dd)
        d[k + "risques"] = risques(f)
        d[k + "phases"] = phases(f)
        d[k + "soustitre"] = f["soustitre"]
        d[k + "titre"] = esc(f["titre"])
        d[k + "tags"] = "".join(
            f'<span class="tag {c}">{esc(t)}</span>' for c, t in f["tags"])
        d[k + "bloque"] = esc(f["bloque"])

        segs = [(lab, val) for lab, val in dd["invest"]]
        d[k + "donut"] = fig(
            figs.donut([(re.sub(r"<[^>]+>", "", l).split(":")[0].strip(), v) for l, v in segs],
                       dd["investTotal"], f'Investissement — {f["titre"]}'),
            f'<b>Où part la mise.</b> {sp(f"f{n}_inv")} Ar au total.')

        d[k + "cash"] = fig(
            figs.cash_lines([("Prévu", dd["cumul"]), ("Prudent", dd["cumulPrud"])]),
            f'<b>La trésorerie cumulée, mois par mois.</b> Elle démarre à '
            f'− {sp(f"f{n}_inv")} Ar. Le retour sur la mise tombe à '
            f'{sp(f"f{n}_retour")} au rythme prévu, {sp(f"f{n}_retourp")} si les volumes sont '
            "deux fois plus lents.")

    return d


def remplir(src):
    """Réécrit le contenu de chaque <span data-v> avec la valeur du modèle.

    La prose de la source contient des valeurs tapées à la main — c'est plus
    lisible à écrire. Mais une valeur tapée est une valeur qui se périme dès
    que le modèle bouge. On les remplace donc toutes, sans exception : ainsi
    la page statique ne peut pas diverger de ce que le JavaScript recalcule.

    Le \\s+ après <span n'est pas décoratif : sans lui, un retour à la ligne
    entre la balise et l'attribut laisse passer la valeur sans la corriger.
    """
    motif = re.compile(r'(<span\s+data-v="([a-zA-Z0-9_]+)"\s*>)(.*?)(</span>)', re.S)
    inconnues = []
    remplacees = [0]

    def sub(m):
        cle = m.group(2)
        if cle not in V:
            inconnues.append(cle)
            return m.group(0)
        if m.group(3) != V[cle]:
            remplacees[0] += 1
        return m.group(1) + V[cle] + m.group(4)

    src = motif.sub(sub, src)
    if inconnues:
        sys.exit("!! data-v sans valeur dans le modèle : " + ", ".join(sorted(set(inconnues))))
    if remplacees[0]:
        print(f"  {remplacees[0]} valeur(s) écrite(s) à la main corrigée(s) depuis le modèle")
    return src


def inject():
    d = fragments()
    if not SRC.exists():
        sys.exit(f"!! source absente : {SRC}")
    src = SRC.read_text(encoding="utf-8")
    noms = re.findall(r"<!--MOD:([a-zA-Z0-9:_\-]+)-->", src)
    inconnus = sorted(set(n for n in noms if n not in d))
    if inconnus:
        sys.exit("!! marqueurs inconnus dans la source : " + ", ".join(inconnus))
    for n in set(noms):
        src = src.replace(f"<!--MOD:{n}-->", d[n])
    src = remplir(src)
    OUT.write_text(src, encoding="utf-8")
    print(f"{OUT.name} : {len(noms)} fragments injectés ({len(set(noms))} distincts)")
    inutiles = sorted(set(d) - set(noms))
    if inutiles:
        print(f"  non utilisés : {len(inutiles)} — " + ", ".join(inutiles[:10])
              + (" …" if len(inutiles) > 10 else ""))


def resume():
    print(f'{"fiche":<26}{"palier":>7}{"invest":>10}{"fixes":>9}'
          f'{"marge/u":>10}{"seuil":>9}{"plafond":>10}{"retour":>15}{"rdt/an":>8}')
    for i, f in enumerate(F):
        x = D["fiches"][i]
        n = f["n"]
        print(f'{str(n) + ". " + f["court"]:<26}{f["palier"]:>7}'
              f'{mar(x["investTotal"]):>10}{mar(x["fixes"]):>9}'
              f'{ar(x["marge"]).replace(NB, " "):>10}'
              f'{ar(x["seuil"]).replace(NB, " "):>9}'
              f'{mar(x["plafond"]):>10}'
              f'{V[f"f{n}_retour"]:>15}{V[f"f{n}_rendement"]:>8}')
    print(f'\n{len(V)} valeurs liées au modèle')


if __name__ == "__main__":
    resume()
    if len(sys.argv) > 1 and sys.argv[1] == "inject":
        inject()
