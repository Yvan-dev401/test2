#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Génère les schémas SVG des deux pages business et les injecte à la place
des marqueurs <!--FIG:nom--> dans les fichiers HTML."""

import math
import re
import sys
from pathlib import Path

ROOT = Path("/home/user/test2")

P = ["#b45309", "#0f766e", "#4338ca", "#be123c", "#a16207",
     "#475569", "#0891b2", "#7c3aed", "#65a30d", "#7e22ce"]

INK = "#111827"
MUT = "#6b7280"
FAINT = "#9ca3af"
LINE = "#e5e7eb"
OK = "#15803d"
KO = "#b91c1c"


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def ar(n):
    """1234567 -> '1 234 567' avec espaces insécables fines."""
    s = f"{int(round(n)):,}".replace(",", " ")
    return s


def mar(n):
    """En millions d'ariary, court."""
    v = n / 1_000_000
    if abs(v - round(v)) < 0.05:
        return f"{round(v):d} M"
    return f"{v:.1f}".replace(".", ",") + " M"


# ───────────────────────── anneau d'investissement ─────────────────────────

def donut(segments, total, title):
    """segments: [(label, value)] ; renvoie un bloc .fig-row complet."""
    r, cx, cy, sw = 58, 78, 78, 24
    C = 2 * math.pi * r
    out = [f'<div class="fig-row"><div class="chart">',
           f'<svg viewBox="0 0 156 156" role="img" aria-label="{esc(title)}">',
           f'<title>{esc(title)}</title>',
           f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{LINE}" stroke-width="{sw}"/>']
    acc = 0.0
    for i, (lab, val) in enumerate(segments):
        frac = val / total
        ln = C * frac
        off = -C * acc
        col = P[i % len(P)]
        out.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{col}" '
            f'stroke-width="{sw}" stroke-dasharray="{ln:.2f} {C - ln:.2f}" '
            f'stroke-dashoffset="{off:.2f}" transform="rotate(-90 {cx} {cy})"/>')
        acc += frac
    out.append(
        f'<text x="{cx}" y="{cy - 4}" text-anchor="middle" font-size="9" '
        f'font-weight="600" fill="{MUT}">TOTAL</text>'
        f'<text x="{cx}" y="{cy + 14}" text-anchor="middle" font-size="17" '
        f'font-weight="700" fill="{INK}">{mar(total)}</text>'
        f'<text x="{cx}" y="{cy + 28}" text-anchor="middle" font-size="9" '
        f'fill="{FAINT}">ariary</text>')
    out.append("</svg></div>")
    out.append('<div class="legend-col"><ul class="legend-list">')
    for i, (lab, val) in enumerate(segments):
        col = P[i % len(P)]
        pct = round(100 * val / total)
        out.append(
            f'<li><i style="background:{col}"></i>'
            f'<span class="ll-lbl">{esc(lab)}</span>'
            f'<span class="ll-amt">{ar(val)} Ar<em>{pct} %</em></span></li>')
    out.append("</ul></div></div>")
    return "\n".join(out)


# ───────────────────────── barres horizontales ─────────────────────────

def bars(rows, unit="", width=460, note_max=None, colors=None, labw=148):
    """rows: [(label, value, display)] — une barre par ligne."""
    top, rowh, gap = 8, 26, 8
    barx = labw + 8
    barw = width - barx - 86
    mx = note_max or max(v for _, v, _ in rows)
    h = top + len(rows) * (rowh + gap)
    out = [f'<svg viewBox="0 0 {width} {h}" role="img">']
    for i, (lab, val, disp) in enumerate(rows):
        y = top + i * (rowh + gap)
        w = max(2, barw * val / mx)
        col = (colors[i] if colors else P[i % len(P)])
        out.append(
            f'<text x="{labw}" y="{y + 17}" text-anchor="end" font-size="11.5" '
            f'fill="{INK}">{esc(lab)}</text>')
        out.append(
            f'<rect x="{barx}" y="{y + 3}" width="{barw}" height="{rowh - 6}" '
            f'rx="4" fill="#f3f4f6"/>')
        out.append(
            f'<rect x="{barx}" y="{y + 3}" width="{w:.1f}" height="{rowh - 6}" '
            f'rx="4" fill="{col}"/>')
        out.append(
            f'<text x="{barx + barw + 8}" y="{y + 17}" font-size="11.5" '
            f'font-weight="600" fill="{INK}">{esc(disp)}</text>')
    out.append("</svg>")
    return f'<svg-wrap>{"".join(out)}</svg-wrap>'.replace("<svg-wrap>", "").replace("</svg-wrap>", "")


# ────────────────── barres groupées : point mort médian / prudent ──────────────────

def grouped_bars(rows, width=460, maxm=19):
    """rows: [(label, median, prudent, prudent_is_beyond)]"""
    top, grp, gap = 22, 30, 12
    labw = 150
    barx = labw + 8
    barw = width - barx - 86
    h = top + len(rows) * (grp + gap) + 6
    out = [f'<svg viewBox="0 0 {width} {h}" role="img">']
    # échelle : dérivée de l'horizon, pas figée — sinon on affiche des mois
    # qui sortent du cadre
    for m in range(3, maxm, 3):
        x = barx + barw * m / maxm
        out.append(f'<line x1="{x:.1f}" y1="{top - 6}" x2="{x:.1f}" y2="{h - 6}" '
                   f'stroke="{LINE}" stroke-width="1"/>')
        out.append(f'<text x="{x:.1f}" y="{top - 10}" text-anchor="middle" '
                   f'font-size="9.5" fill="{FAINT}">M{m}</text>')
    for i, (lab, med, pru, beyond) in enumerate(rows):
        y = top + i * (grp + gap)
        out.append(f'<text x="{labw}" y="{y + 12}" text-anchor="end" font-size="11" '
                   f'fill="{INK}">{esc(lab)}</text>')
        wm = barw * med / maxm
        out.append(f'<rect x="{barx}" y="{y + 1}" width="{wm:.1f}" height="12" rx="3" '
                   f'fill="{P[0]}"/>')
        out.append(f'<text x="{barx + wm + 5}" y="{y + 11}" font-size="10" '
                   f'font-weight="600" fill="{P[0]}">M{med}</text>')
        wp = barw * min(pru, maxm) / maxm
        out.append(f'<rect x="{barx}" y="{y + 16}" width="{wp:.1f}" height="12" rx="3" '
                   f'fill="#d1d5db"/>')
        lbl = f"&gt; {maxm - 1} mois" if beyond else f"M{pru}"
        out.append(f'<text x="{barx + wp + 5}" y="{y + 26}" font-size="10" '
                   f'font-weight="600" fill="{MUT}">{lbl}</text>')
    out.append("</svg>")
    return "".join(out)


# ───────────────────────── courbes de trésorerie ─────────────────────────

def cash_lines(series, width=460, height=270):
    """series: [(nom, [cumul m1..m12])]"""
    l, r, t, b = 52, 12, 14, 34
    pw, ph = width - l - r, height - t - b
    allv = [v for _, ys in series for v in ys]
    ymin, ymax = min(allv + [0]), max(allv + [0])
    pad = (ymax - ymin) * 0.08
    ymin, ymax = ymin - pad, ymax + pad

    def X(m):
        return l + pw * (m - 1) / 11

    def Y(v):
        return t + ph * (ymax - v) / (ymax - ymin)

    out = [f'<svg viewBox="0 0 {width} {height}" role="img">']
    # grille horizontale
    step = 10_000_000
    g = math.floor(ymin / step) * step
    while g <= ymax:
        y = Y(g)
        if y < t - 0.5 or y > t + ph + 0.5:   # hors du cadre : on ne trace pas
            g += step
            continue
        out.append(f'<line x1="{l}" y1="{y:.1f}" x2="{width - r}" y2="{y:.1f}" '
                   f'stroke="{LINE}" stroke-width="1"/>')
        out.append(f'<text x="{l - 6}" y="{y + 3.5:.1f}" text-anchor="end" '
                   f'font-size="9.5" fill="{FAINT}">{mar(g) if g else "0"}</text>')
        g += step
    # ligne zéro
    out.append(f'<line x1="{l}" y1="{Y(0):.1f}" x2="{width - r}" y2="{Y(0):.1f}" '
               f'stroke="{INK}" stroke-width="1.5"/>')
    # mois
    for m in range(1, 13):
        out.append(f'<text x="{X(m):.1f}" y="{height - 16}" text-anchor="middle" '
                   f'font-size="9" fill="{FAINT}">{m}</text>')
    out.append(f'<text x="{l + pw / 2:.1f}" y="{height - 3}" text-anchor="middle" '
               f'font-size="9.5" fill="{MUT}">mois d’activité</text>')
    for i, (name, ys) in enumerate(series):
        col = P[i % len(P)]
        pts = " ".join(f"{X(m):.1f},{Y(v):.1f}" for m, v in enumerate(ys, 1))
        out.append(f'<polyline points="{pts}" fill="none" stroke="{col}" '
                   f'stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>')
        # point mort : premier mois où le cumul passe au-dessus de zéro
        for m, v in enumerate(ys, 1):
            if v > 0:
                out.append(f'<circle cx="{X(m):.1f}" cy="{Y(v):.1f}" r="4" '
                           f'fill="white" stroke="{col}" stroke-width="2.2"/>')
                break
    out.append("</svg>")
    return "".join(out)


# ───────────────────────── matrice risque / rendement ─────────────────────────

def matrix(points, width=460, height=300,
           xlab="Risque →", ylab="Rendement →",
           quad=("", "", "", "")):
    l, r, t, b = 40, 14, 16, 34
    pw, ph = width - l - r, height - t - b
    out = [f'<svg viewBox="0 0 {width} {height}" role="img">']
    out.append(f'<rect x="{l}" y="{t}" width="{pw}" height="{ph}" fill="#f9fafb" '
               f'stroke="{LINE}"/>')
    out.append(f'<line x1="{l + pw / 2}" y1="{t}" x2="{l + pw / 2}" y2="{t + ph}" '
               f'stroke="{LINE}" stroke-dasharray="4 4"/>')
    out.append(f'<line x1="{l}" y1="{t + ph / 2}" x2="{l + pw}" y2="{t + ph / 2}" '
               f'stroke="{LINE}" stroke-dasharray="4 4"/>')
    qpos = [(l + 8, t + 14, "start"), (l + pw - 8, t + 14, "end"),
            (l + 8, t + ph - 8, "start"), (l + pw - 8, t + ph - 8, "end")]
    for (qx, qy, anch), txt in zip(qpos, quad):
        if txt:
            out.append(f'<text x="{qx}" y="{qy}" text-anchor="{anch}" font-size="9" '
                       f'fill="{FAINT}" font-style="italic">{esc(txt)}</text>')
    for i, (lab, x, y, dx, dy) in enumerate(points):
        px = l + pw * x
        py = t + ph * (1 - y)
        col = P[i % len(P)]
        out.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="7" fill="{col}" '
                   f'fill-opacity="0.9"/>')
        out.append(f'<text x="{px:.1f}" y="{py + 3.5:.1f}" text-anchor="middle" '
                   f'font-size="9" font-weight="700" fill="white">{i + 1}</text>')
        anch = "start" if dx >= 0 else "end"
        out.append(f'<text x="{px + dx:.1f}" y="{py + dy:.1f}" text-anchor="{anch}" '
                   f'font-size="10" font-weight="600" fill="{INK}">{esc(lab)}</text>')
    out.append(f'<text x="{l + pw / 2}" y="{height - 6}" text-anchor="middle" '
               f'font-size="10" fill="{MUT}">{esc(xlab)}</text>')
    out.append(f'<text x="12" y="{t + ph / 2}" text-anchor="middle" font-size="10" '
               f'fill="{MUT}" transform="rotate(-90 12 {t + ph / 2})">{esc(ylab)}</text>')
    out.append("</svg>")
    return "".join(out)


# ───────────────────────── cascade prix de revient ─────────────────────────

def waterfall(steps, width=460, height=300):
    """steps: [(label, delta, kind)] kind: 'base'|'add'|'total'"""
    l, r, t, b = 8, 8, 26, 58
    pw, ph = width - l - r, height - t - b
    n = len(steps)
    slot = pw / n
    bw = slot * 0.6
    total = sum(d for _, d, k in steps if k != "total")
    ymax = total * 1.12

    def H(v):
        return ph * v / ymax

    out = [f'<svg viewBox="0 0 {width} {height}" role="img">']
    acc = 0.0
    for i, (lab, delta, kind) in enumerate(steps):
        cx = l + slot * i + slot / 2
        x = cx - bw / 2
        if kind == "total":
            h = H(total)
            y = t + ph - h
            col = INK
            out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" '
                       f'height="{h:.1f}" rx="3" fill="{col}"/>')
            out.append(f'<text x="{cx:.1f}" y="{y - 6:.1f}" text-anchor="middle" '
                       f'font-size="10.5" font-weight="700" fill="{INK}">'
                       f'{ar(total)}</text>')
        else:
            h = H(delta)
            y = t + ph - H(acc + delta)
            col = P[0] if kind == "base" else P[i % len(P)]
            out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" '
                       f'height="{max(h, 2):.1f}" rx="3" fill="{col}"/>')
            out.append(f'<text x="{cx:.1f}" y="{y - 5:.1f}" text-anchor="middle" '
                       f'font-size="9.5" font-weight="600" fill="{INK}">'
                       f'+{ar(delta)}</text>' if kind == "add" else
                       f'<text x="{cx:.1f}" y="{y - 5:.1f}" text-anchor="middle" '
                       f'font-size="9.5" font-weight="600" fill="{INK}">'
                       f'{ar(delta)}</text>')
            if i + 1 < n and steps[i + 1][2] != "total":
                nx = l + slot * (i + 1) + slot / 2 - bw / 2
                out.append(f'<line x1="{x + bw:.1f}" y1="{y:.1f}" x2="{nx:.1f}" '
                           f'y2="{y:.1f}" stroke="{FAINT}" stroke-width="1" '
                           f'stroke-dasharray="3 3"/>')
            acc += delta
        # étiquette sous l'axe, sur deux lignes si besoin
        words = lab.split(" ")
        l1, l2 = [], []
        for w in words:
            (l1 if len(" ".join(l1 + [w])) <= 13 else l2).append(w)
        out.append(f'<text x="{cx:.1f}" y="{t + ph + 14}" text-anchor="middle" '
                   f'font-size="9" fill="{MUT}">{esc(" ".join(l1))}</text>')
        if l2:
            out.append(f'<text x="{cx:.1f}" y="{t + ph + 25}" text-anchor="middle" '
                       f'font-size="9" fill="{MUT}">{esc(" ".join(l2))}</text>')
    out.append(f'<line x1="{l}" y1="{t + ph}" x2="{width - r}" y2="{t + ph}" '
               f'stroke="{INK}" stroke-width="1.5"/>')
    out.append("</svg>")
    return "".join(out)


# ───────────────────────── frise de phases ─────────────────────────

def timeline(items, width=460):
    """items: [(titre, sous-titre)] — frise horizontale numérotée."""
    n = len(items)
    rowh = 52
    height = 14 + n * rowh
    out = [f'<svg viewBox="0 0 {width} {height}" role="img">']
    x0 = 26
    out.append(f'<line x1="{x0}" y1="18" x2="{x0}" y2="{height - 26}" '
               f'stroke="{LINE}" stroke-width="2"/>')
    for i, (ttl, sub) in enumerate(items):
        y = 18 + i * rowh
        col = P[i % len(P)]
        out.append(f'<circle cx="{x0}" cy="{y}" r="11" fill="{col}"/>')
        out.append(f'<text x="{x0}" y="{y + 4}" text-anchor="middle" font-size="11" '
                   f'font-weight="700" fill="white">{i + 1}</text>')
        out.append(f'<text x="{x0 + 22}" y="{y - 1}" font-size="11.5" '
                   f'font-weight="700" fill="{INK}">{esc(ttl)}</text>')
        out.append(f'<text x="{x0 + 22}" y="{y + 13}" font-size="10" '
                   f'fill="{MUT}">{esc(sub)}</text>')
    out.append("</svg>")
    return "".join(out)


# ───────────────────────── scénarios : engagé vs récupéré ─────────────────────────

def scenarios(rows, width=460):
    """rows: [(nom, engage, recupere, verdict)]"""
    rowh, gap, top = 44, 16, 22
    l = 8
    labw = 0
    barx = l
    barw = width - 2 * l - 100
    mx = max(max(a, b) for _, a, b, _ in rows)
    height = top + len(rows) * (rowh + gap) + 24
    out = [f'<svg viewBox="0 0 {width} {height}" role="img">']
    for i, (name, eng, rec, verdict) in enumerate(rows):
        y = top + i * (rowh + gap)
        out.append(f'<text x="{l}" y="{y - 5}" font-size="11" font-weight="700" '
                   f'fill="{INK}">{esc(name)}</text>')
        we = barw * eng / mx
        wr = barw * rec / mx
        out.append(f'<rect x="{barx}" y="{y + 2}" width="{we:.1f}" height="15" rx="3" '
                   f'fill="{MUT}"/>')
        out.append(f'<text x="{barx + we + 6:.1f}" y="{y + 14}" font-size="10" '
                   f'font-weight="600" fill="{MUT}">{ar(eng)}</text>')
        out.append(f'<rect x="{barx}" y="{y + 21}" width="{wr:.1f}" height="15" rx="3" '
                   f'fill="{OK if rec >= eng else KO}"/>')
        out.append(f'<text x="{barx + wr + 6:.1f}" y="{y + 33}" font-size="10" '
                   f'font-weight="600" fill="{OK if rec >= eng else KO}">'
                   f'{ar(rec)}</text>')
    out.append(f'<rect x="{l}" y="{height - 16}" width="11" height="11" rx="2" fill="{MUT}"/>'
               f'<text x="{l + 16}" y="{height - 7}" font-size="10" fill="{MUT}">'
               f'capital engagé</text>'
               f'<rect x="{l + 112}" y="{height - 16}" width="11" height="11" rx="2" fill="{OK}"/>'
               f'<text x="{l + 128}" y="{height - 7}" font-size="10" fill="{MUT}">'
               f'recettes, invendus déduits</text>')
    out.append("</svg>")
    return "".join(out)


# ═══════════════════════════ données ═══════════════════════════

MADA_INVEST = {
    1: [("Écran externe 24″, clavier, souris", 900_000),
        ("Onduleur (coupures de courant)", 650_000),
        ("Connexion : installation + 3 mois", 600_000),
        ("Licences et abonnements (6 mois)", 450_000),
        ("Domaine + hébergement pro (1 an)", 250_000),
        ("Identité de l’agence, portfolio", 180_000),
        ("Réserve de trésorerie", 120_000)],
    2: [("Boîtier hybride + objectif polyvalent", 4_200_000),
        ("Deuxième objectif lumineux", 1_100_000),
        ("Micros cravate × 2 + micro-canon", 750_000),
        ("Éclairage : 2 panneaux LED + pieds", 900_000),
        ("Trépied fluide + stabilisateur", 700_000),
        ("Cartes, batteries, sacoche", 450_000),
        ("Disque dur 2 To + sauvegarde", 400_000),
        ("Onduleur", 400_000),
        ("Abonnements montage + musique (6 mois)", 300_000),
        ("Réserve de trésorerie", 450_000)],
    3: [("Écran externe et accessoires", 700_000),
        ("Micro + webcam corrects", 350_000),
        ("Abonnements outils (6 mois)", 420_000),
        ("Site de l’agence + domaine (1 an)", 180_000),
        ("Réserve de trésorerie", 200_000)],
    4: [("Hébergement + domaine (1 an)", 900_000),
        ("Crédit SMS et notifications", 600_000),
        ("Écran et accessoires de développement", 700_000),
        ("Onduleur + connexion (3 mois d’avance)", 750_000),
        ("Design produit, maquettes, identité", 400_000),
        ("Cadre légal : statut, CGU, mentions", 500_000),
        ("Réserve de trésorerie (4 mois)", 550_000)],
    5: [("Micro, interface audio, traitement acoustique", 800_000),
        ("Éclairage + caméra d’appoint", 500_000),
        ("Montage + hébergement du cours (1 an)", 450_000),
        ("Site de vente, domaine, encaissement", 350_000),
        ("Publicité de lancement", 200_000)],
}

MADA_NAMES = {
    1: "Studio web & identité",
    2: "Production vidéo",
    3: "Agence au forfait",
    4: "Micro-SaaS local",
    5: "Formation vidéo",
}

# flux de trésorerie cumulés, mois 1 à 12
MADA_CASH = {
    1: (3_150_000, [-420_000, 780_000, 1_380_000, 1_680_000, 1_980_000, 2_130_000]
        + [2_280_000] * 6),
    2: (9_650_000, [-850_000, 950_000, 2_750_000, 3_950_000, 4_550_000]
        + [5_150_000] * 7),
    3: (1_850_000, [-450_000, 250_000, 950_000, 1_650_000, 2_350_000]
        + [3_050_000] * 7),
    4: (4_400_000, [-800_000, -800_000, -800_000, -400_000, 0, 400_000, 800_000,
                    1_200_000, 1_600_000, 2_000_000, 2_400_000, 2_800_000]),
    5: (2_300_000, [-620_000, -620_000, 580_000, 1_180_000, 1_630_000]
        + [2_080_000] * 7),
}


def cumul(inv, nets):
    c, out = -inv, []
    for n in nets:
        c += n
        out.append(c)
    return out


CHINE_TRIP = [
    ("Billet aller-retour", 5_500_000),
    ("Hébergement, 14 nuits", 1_700_000),
    ("Interprète / guide d’achat", 1_050_000),
    ("Repas, 14 jours", 700_000),
    ("Transports sur place", 500_000),
    ("Visa affaires + dossier", 450_000),
    ("SIM, imprévus", 300_000),
    ("Assurance voyage", 250_000),
    ("Frais bancaires et change", 250_000),
]

FIGS = {}


def build():
    # ── Madagascar ──
    for k, seg in MADA_INVEST.items():
        FIGS[f"mada-donut-{k}"] = donut(
            seg, sum(v for _, v in seg),
            f"Répartition de l’investissement — {MADA_NAMES[k]}")

    FIGS["mada-breakeven"] = grouped_bars([
        ("1. Studio web & identité", 4, 7, False),
        ("2. Production vidéo", 5, 8, False),
        ("3. Agence au forfait", 4, 7, False),
        ("4. Micro-SaaS local", 11, 19, True),
        ("5. Formation vidéo", 6, 9, False),
    ])

    FIGS["mada-cash"] = cash_lines([
        (MADA_NAMES[k], cumul(*MADA_CASH[k])) for k in (1, 2, 3, 4, 5)])

    FIGS["mada-matrix"] = matrix([
        ("Studio web", 0.20, 0.55, 12, -12),
        ("Vidéo", 0.50, 0.80, 12, 4),
        ("Agence forfait", 0.18, 0.42, 12, 14),
        ("Micro-SaaS", 0.84, 0.84, -12, 16),
        ("Formation", 0.62, 0.35, 12, 4),
    ], quad=("Rente tranquille", "Le pari", "À éviter", "Le piège de l’effort"))

    FIGS["mada-order"] = timeline([
        ("Mois 1 – 3 : le studio web", "Capital le plus faible, premier ariary le plus rapide"),
        ("Mois 3 – 6 : le forfait mensuel", "On transforme les clients ponctuels en revenu récurrent"),
        ("Mois 6 – 9 : la vidéo", "Le matériel est acheté avec la trésorerie, pas avec l’épargne"),
        ("Mois 9 – 12 : la formation", "On vend ce qu’on sait déjà faire, la marge est quasi totale"),
        ("Mois 12 et au-delà : le SaaS", "Financé par les quatre premiers, jamais avant"),
    ])

    # ── Chine ──
    FIGS["chine-trip"] = bars(
        [(l, v, f"{ar(v)} Ar") for l, v in CHINE_TRIP],
        colors=[P[0]] + [P[(i + 1) % len(P)] for i in range(len(CHINE_TRIP) - 1)])

    FIGS["chine-landed"] = waterfall([
        ("Prix usine", 900_000, "base"),
        ("Fret aérien", 282_000, "add"),
        ("Assurance", 18_000, "add"),
        ("Droits de douane", 120_000, "add"),
        ("TVA 20 %", 264_000, "add"),
        ("Transitaire, magasinage", 150_000, "add"),
        ("Prix de revient", 0, "total"),
    ])

    FIGS["chine-coef"] = bars([
        ("Électronique grand public", 1.45, "× 1,4 – 1,6"),
        ("Accessoires téléphone", 1.8, "× 1,7 – 2,0"),
        ("Petit outillage", 2.1, "× 1,9 – 2,3"),
        ("Articles de puériculture", 2.4, "× 2,2 – 2,6"),
        ("Décoration, art de la table", 2.7, "× 2,4 – 3,0"),
        ("Accessoires de mode", 2.9, "× 2,5 – 3,2"),
    ], labw=170, colors=[KO, P[4], P[1], P[1], P[8], P[8]])

    FIGS["chine-scen"] = scenarios([
        ("A — sourcing à distance, sans voyage", 5_000_000, 7_050_000, ""),
        ("B — premier voyage, petit stock", 20_000_000, 13_950_000, ""),
        ("C — voyage + stock, produit à faible marge", 37_700_000, 40_500_000, ""),
        ("C′ — même voyage, produit à bonne marge", 37_700_000, 59_400_000, ""),
    ])

    FIGS["chine-matrix"] = matrix([
        ("Revente électronique", 0.85, 0.40, -12, -12),
        ("Commission sourcing", 0.10, 0.45, 12, 4),
        ("Groupage de fret", 0.25, 0.35, 12, 14),
        ("Vente avant achat", 0.32, 0.58, 12, 16),
        ("Niches à bonne marge", 0.70, 0.88, -12, 14),
        ("Média sur l’import", 0.15, 0.20, 12, 4),
        ("Représentation d’acheteurs", 0.20, 0.72, 12, 4),
    ], xlab="Capital immobilisé et risque →",
        ylab="Marge attendue →",
        quad=("Bon départ", "Le pari", "", ""))

    FIGS["chine-plan"] = timeline([
        ("Phase 0 — mois 1 à 2 : sans partir", "Un lot test à distance, la douane apprise en vrai"),
        ("Phase 1 — mois 3 à 5 : le carnet", "Commissions sur les commandes des autres"),
        ("Phase 2 — mois 6 à 8 : préparer", "Rendez-vous fixés, 60 % du voyage déjà couvert"),
        ("Phase 3 — le voyage, 14 jours", "Usines, contrôle qualité, contrats, groupage"),
        ("Phase 4 — après : les rotations", "Le voyage s’amortit sur 3 cycles, pas sur un"),
    ])


def inject():
    build()
    used = set()
    for f in ("business-madagascar.html", "business-chine.html"):
        p = ROOT / f
        if not p.exists():
            continue
        src = p.read_text(encoding="utf-8")
        names = re.findall(r"<!--FIG:([a-z0-9\-]+)-->", src)
        for n in names:
            if n not in FIGS:
                sys.exit(f"!! schéma inconnu : {n} (dans {f})")
            src = src.replace(f"<!--FIG:{n}-->", FIGS[n])
            used.add(n)
        p.write_text(src, encoding="utf-8")
        print(f"{f}: {len(names)} schéma(x) injecté(s) — {', '.join(names)}")
    missing = set(FIGS) - used
    if missing:
        print("schémas générés mais non utilisés :", ", ".join(sorted(missing)))


if __name__ == "__main__":
    inject()


def remark():
    """Remet les marqueurs <!--FIG:nom--> à la place des SVG déjà injectés,
       pour pouvoir régénérer. À lancer AVANT toute modification du générateur."""
    build()
    for f in ("business-madagascar.html", "business-chine.html"):
        p = ROOT / f
        src = p.read_text(encoding="utf-8")
        n = 0
        for name, svg in FIGS.items():
            if svg in src:
                src = src.replace(svg, f"<!--FIG:{name}-->")
                n += 1
        p.write_text(src, encoding="utf-8")
        print(f"{f}: {n} marqueur(s) rétabli(s)")
