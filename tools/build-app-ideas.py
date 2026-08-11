#!/usr/bin/env python3
"""Génère app-ideas-data.js à partir d'un clone de florinpop17/app-ideas.

Le dépôt source (licence MIT, © 2018 Florin Pop) contient une fiche markdown par
projet, rangée par niveau dans Projects/1-Beginner, 2-Intermediate, 3-Advanced.
Ce script les convertit en un seul fichier de données JS consommé par
app-ideas.html et les trois pages de niveau.

Usage :
    git clone --depth 1 https://github.com/florinpop17/app-ideas /tmp/app-ideas
    python3 tools/build-app-ideas.py /tmp/app-ideas

Aucune dépendance tierce : le convertisseur markdown est embarqué plus bas.
"""

import json
import os
import re
import sys
from datetime import date

SOURCE_URL = "https://github.com/florinpop17/app-ideas"
LICENSE = "MIT — © 2018 Florin Pop"

TIERS = [
    {
        "id": "debutant",
        "dir": "1-Beginner",
        "label": "Débutant",
        "page": "app-ideas-debutant.html",
        "desc": "Pour développer ses premières applications côté utilisateur : "
                "manipulation du DOM, formulaires, logique de base.",
    },
    {
        "id": "intermediaire",
        "dir": "2-Intermediate",
        "label": "Intermédiaire",
        "page": "app-ideas-intermediaire.html",
        "desc": "Pour qui est à l'aise avec l'UI/UX et les outils de développement : "
                "consommation d'APIs, état applicatif, interactions riches.",
    },
    {
        "id": "avance",
        "dir": "3-Advanced",
        "label": "Avancé",
        "page": "app-ideas-avance.html",
        "desc": "Pour aller vers le backend : architecture, persistance en base de "
                "données, moteurs de jeu, intégrations de services.",
    },
]

# ─────────────────────────────── markdown → html ───────────────────────────────

INLINE_TAG = "\x00%d\x00"


def esc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(text):
    """Convertit le markdown inline. Les balises produites sont mises de côté
    derrière des jetons pour que gras/italique ne mangent pas les href."""
    text = esc(text)
    stash = []

    def keep(html):
        stash.append(html)
        return INLINE_TAG % (len(stash) - 1)

    text = re.sub(r"`([^`]+)`", lambda m: keep("<code>%s</code>" % m.group(1)), text)
    text = re.sub(
        r"!\[([^\]]*)\]\(([^)\s]+)[^)]*\)",
        lambda m: keep('<img src="%s" alt="%s" loading="lazy">' % (m.group(2), m.group(1))),
        text,
    )
    # Destination entre chevrons : <url> — la source l'utilise pour les URL à parenthèses.
    text = re.sub(
        r"\[([^\]]+)\]\(\s*&lt;(.+?)&gt;\s*\)",
        lambda m: keep('<a href="%s" target="_blank" rel="noopener">%s</a>'
                       % (m.group(2), m.group(1))),
        text,
    )
    text = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)[^)]*\)",
        lambda m: keep('<a href="%s" target="_blank" rel="noopener">%s</a>'
                       % (m.group(2), m.group(1))),
        text,
    )
    text = re.sub(r"\*\*([^*]+)\*\*", lambda m: keep("<strong>%s</strong>" % m.group(1)), text)
    text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", lambda m: keep("<em>%s</em>" % m.group(1)), text)

    return re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], text)


def indent_of(line):
    return len(line) - len(line.lstrip(" "))


BULLET_RE = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+(.*)$")
BLOCK_START_RE = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+|^#{1,6}\s|^\s*>|^\s*```|^\s*\|")


def dedent(lines):
    widths = [indent_of(l) for l in lines if l.strip()]
    cut = min(widths) if widths else 0
    return [l[cut:] if l.strip() else "" for l in lines]


def parse_list(lines, i):
    """Rend une liste (éventuellement imbriquée) à partir de lines[i]."""
    base = indent_of(lines[i])
    ordered = bool(re.match(r"^\s*\d+\.\s", lines[i]))
    items = []

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            j = i
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j >= len(lines):
                i = j
                break
            nxt = lines[j]
            continues = indent_of(nxt) > base or (
                indent_of(nxt) == base and BULLET_RE.match(nxt))
            if not continues:
                i = j
                break
            if items:
                items[-1].append("")
            i = j
            continue

        ind = indent_of(line)
        m = BULLET_RE.match(line)
        if ind == base and m:
            items.append([m.group(1)])
            i += 1
            continue
        if ind > base and items:
            items[-1].append(line)
            i += 1
            continue
        break

    tag = "ol" if ordered else "ul"
    out = ["<%s>" % tag]
    for item in items:
        head, rest = item[0], dedent(item[1:])
        while rest and not rest[-1].strip():
            rest.pop()
        body = md_to_html("\n".join([head] + rest)) if rest else "<p>%s</p>" % inline(head)
        out.append("<li>%s</li>" % unwrap_single_p(body))
    out.append("</%s>" % tag)
    return "\n".join(out), i


TABLE_SEP_RE = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$")


def split_row(line):
    cells = line.strip().strip("|").split("|")
    return [c.strip() for c in cells]


def parse_table(lines, i):
    header = split_row(lines[i])
    rows = []
    i += 2  # ligne d'en-tête + ligne de séparation
    while i < len(lines) and lines[i].strip().startswith("|"):
        rows.append(split_row(lines[i]))
        i += 1
    out = ["<table><thead><tr>"]
    out += ["<th>%s</th>" % inline(c) for c in header]
    out.append("</tr></thead><tbody>")
    for row in rows:
        out.append("<tr>" + "".join("<td>%s</td>" % inline(c) for c in row) + "</tr>")
    out.append("</tbody></table>")
    return "".join(out), i


def unwrap_single_p(html):
    """Une puce d'une seule ligne ne mérite pas de <p> autour."""
    m = re.fullmatch(r"<p>(.*)</p>", html.strip(), re.S)
    if m and "<p>" not in m.group(1):
        return m.group(1)
    return html


def md_to_html(md):
    lines = md.split("\n")
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]

        if line.strip().startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            out.append("<pre><code>%s</code></pre>" % esc("\n".join(buf)))
            continue

        if not line.strip():
            i += 1
            continue

        m = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
        if m:
            level = min(len(m.group(1)) + 1, 6)
            out.append("<h%d>%s</h%d>" % (level, inline(m.group(2)), level))
            i += 1
            continue

        if re.match(r"^\s*>", line):
            buf = []
            while i < len(lines) and re.match(r"^\s*>", lines[i]):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            out.append("<blockquote>%s</blockquote>" % md_to_html("\n".join(buf)))
            continue

        if BULLET_RE.match(line):
            html, i = parse_list(lines, i)
            out.append(html)
            continue

        if (line.strip().startswith("|") and i + 1 < len(lines)
                and TABLE_SEP_RE.match(lines[i + 1])):
            html, i = parse_table(lines, i)
            out.append(html)
            continue

        buf = [line.strip()]  # toujours consommer au moins une ligne : pas de boucle infinie
        i += 1
        while i < len(lines) and lines[i].strip() and not BLOCK_START_RE.match(lines[i]):
            buf.append(lines[i].strip())
            i += 1
        out.append("<p>%s</p>" % inline(" ".join(buf)))

    return "\n".join(out)


# ──────────────────────────────── parsing fiche ────────────────────────────────

CHECKBOX_RE = re.compile(r"^\s*[-*+]\s+\[[ xX]\]\s*(.*)$")
SECTION_ALIASES = {
    "user stories": "stories",
    "bonus features": "bonus",
    "useful links and resources": "links",
    "useful links": "links",
    "useful resources": "links",
    "example projects": "examples",
    "example project": "examples",
    "example ui inspirations": "examples",
}


def normalize(title):
    return re.sub(r"[^a-z0-9 ]", "", title.lower()).strip()


def split_sections(lines):
    """[(titre|None, [lignes])] — la première entrée est le préambule."""
    sections = [(None, [])]
    for line in lines:
        m = re.match(r"^##\s+(.*?)\s*#*\s*$", line)
        if m:
            sections.append((m.group(1).strip(), []))
        else:
            sections[-1][1].append(line)
    return sections


def parse_checklist(lines):
    """Retourne (notes_html, [{group, html}]) pour une section de user stories."""
    notes, items = [], []
    group = None
    i = 0
    pending = []

    def flush():
        if pending:
            head, rest = pending[0], dedent(pending[1:])
            while rest and not rest[-1].strip():
                rest.pop()
            body = md_to_html("\n".join([head] + rest)) if rest else "<p>%s</p>" % inline(head)
            items.append({"group": group, "html": unwrap_single_p(body)})
            pending.clear()

    while i < len(lines):
        line = lines[i]
        m = re.match(r"^(#{3,6})\s+(.*?)\s*#*\s*$", line)
        if m:
            flush()
            group = m.group(2).strip()
            i += 1
            continue
        cb = CHECKBOX_RE.match(line)
        if cb and indent_of(line) == 0:
            flush()
            pending.append(cb.group(1))
            i += 1
            continue
        if pending:
            pending.append(line)
        elif line.strip():
            notes.append(line)
        i += 1
    flush()

    notes_html = md_to_html("\n".join(notes)) if notes else ""
    return notes_html, items


def parse_project(path, tier_id):
    raw = open(path, encoding="utf-8").read().replace("\r\n", "\n").replace("\t", "    ")
    lines = raw.split("\n")

    title = ""
    for n, line in enumerate(lines):
        m = re.match(r"^#\s+(.*?)\s*#*\s*$", line)
        if m:
            title = m.group(1).strip()
            lines = lines[n + 1:]
            break

    lines = [l for l in lines if not re.match(r"^\*\*Tier:?\*\*", l.strip())]

    sections = split_sections(lines)
    project = {
        "slug": os.path.splitext(os.path.basename(path))[0].lower(),
        "title": title or os.path.basename(path),
        "tier": tier_id,
        "intro": "",
        "stories": [],
        "storyNotes": "",
        "bonus": [],
        "bonusNotes": "",
        "links": "",
        "examples": "",
        "extra": [],
    }

    for heading, body in sections:
        if heading is None:
            project["intro"] = md_to_html("\n".join(body))
            continue
        key = SECTION_ALIASES.get(normalize(heading))
        if key == "stories":
            project["storyNotes"], project["stories"] = parse_checklist(body)
        elif key == "bonus":
            project["bonusNotes"], project["bonus"] = parse_checklist(body)
        elif key in ("links", "examples"):
            html = md_to_html("\n".join(body))
            project[key] = (project[key] + "\n" + html).strip() if project[key] else html
        else:
            project["extra"].append({"title": heading, "html": md_to_html("\n".join(body))})

    return project


# ─────────────────────────────────── sortie ────────────────────────────────────

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "/tmp/app-ideas"
    projects_dir = os.path.join(src, "Projects")
    if not os.path.isdir(projects_dir):
        sys.exit("Clone introuvable : %s\nFaire d'abord : git clone --depth 1 %s %s"
                 % (projects_dir, SOURCE_URL, src))

    out_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    projects, skipped = [], []

    for tier in TIERS:
        tier_dir = os.path.join(projects_dir, tier["dir"])
        count = 0
        for name in sorted(os.listdir(tier_dir)):
            path = os.path.join(tier_dir, name)
            if os.path.isdir(path):  # certaines fiches sont livrées dans un dossier
                inner = [f for f in sorted(os.listdir(path)) if f.endswith(".md")]
                if not inner:
                    skipped.append("%s/%s (dossier sans .md)" % (tier["dir"], name))
                    continue
                path = os.path.join(path, inner[0])
            project = parse_project(path, tier["id"])
            if not project["stories"]:
                skipped.append("%s/%s (aucune user story)" % (tier["dir"], name))
                continue
            projects.append(project)
            count += 1
        tier["count"] = count

    data = {
        "generatedAt": date.today().isoformat(),
        "source": SOURCE_URL,
        "license": LICENSE,
        "tiers": [{k: v for k, v in t.items() if k != "dir"} for t in TIERS],
        "projects": projects,
    }

    header = (
        "/* Fichier généré par tools/build-app-ideas.py — ne pas éditer à la main.\n"
        "   Contenu adapté de %s (licence %s). */\n" % (SOURCE_URL, LICENSE)
    )
    out_path = os.path.join(out_dir, "app-ideas-data.js")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write("window.APP_IDEAS = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    slugs = [p["slug"] for p in projects]
    stories = sum(len(p["stories"]) for p in projects)
    bonus = sum(len(p["bonus"]) for p in projects)
    print("→ %s (%.0f Ko)" % (out_path, os.path.getsize(out_path) / 1024))
    for tier in TIERS:
        print("   %-14s %2d projets" % (tier["label"], tier["count"]))
    print("   total          %d projets · %d user stories · %d bonus" % (len(projects), stories, bonus))
    if len(set(slugs)) != len(slugs):
        dupes = sorted({s for s in slugs if slugs.count(s) > 1})
        print("   ⚠ slugs en double : %s" % ", ".join(dupes))
    for s in skipped:
        print("   ⚠ ignoré : %s" % s)


if __name__ == "__main__":
    main()
