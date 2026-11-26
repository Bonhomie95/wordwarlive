"""A made-up run for `python3 scripts/dashboard.py --demo`: three testers on a small to-do app.

The screens are drawn as SVG, so the demo needs nothing installed. The traces are written
by the real scripts/ecr_trace.py, from notes shaped like the ones a run leaves.
"""
import json
from pathlib import Path
from xml.sax.saxutils import escape

import ecr_trace

W, H = 1080, 2400
PHONE_W = 1080
APP = "com.example.todo"

TEXTS = {
    "en": {"welcome": "Welcome to Todo", "pitch": "Lists that remember for you", "start": "Get started",
           "signin": "I already have an account", "create": "Create your account", "email": "E-mail",
           "password": "Password", "submit": "Create account", "terms": "By going on you accept the terms",
           "lists": "My lists", "empty": "No items yet", "add": "Add item", "tab_lists": "Lists",
           "tab_settings": "Settings", "new": "New item", "title": "Title", "save": "Save", "cancel": "Cancel",
           "item": "Buy milk", "settings": "Settings", "size": "Text size", "dark": "Dark mode", "out": "Sign out",
           "help": "Help", "contact": "Contact us", "privacy": "Privacy policy", "faq": "Questions and answers"},
    "fr": {"welcome": "Bienvenue dans Todo", "pitch": "Des listes qui se souviennent pour vous", "start": "Commencer",
           "signin": "J'ai déjà un compte", "create": "Créez votre compte", "email": "E-mail",
           "password": "Mot de passe", "submit": "Créer le compte", "terms": "En continuant, vous acceptez les conditions",
           "lists": "Mes listes", "empty": "Aucun élément", "add": "Ajouter", "tab_lists": "Listes",
           "tab_settings": "Réglages", "new": "Nouvel élément", "title": "Titre", "save": "Enregistrer",
           "cancel": "Annuler", "item": "Acheter du lait", "settings": "Réglages", "size": "Taille du texte",
           "dark": "Mode sombre", "out": "Se déconnecter",
           "help": "Aide", "contact": "Nous écrire", "privacy": "Confidentialité", "faq": "Questions fréquentes"},
}


def screens(t, keyboard=False):
    """Each screen: a list of (kind, label, resource id, bounds)."""
    bar = [("tab", t["tab_lists"], "app:id/tab_lists", (0, 2220, 540, 2400)),
           ("tab", t["tab_settings"], "app:id/tab_settings", (540, 2220, 1080, 2400))]
    return {
        "welcome": [("hero", t["welcome"], "app:id/welcome", (80, 700, 1000, 820)),
                    ("text", t["pitch"], "", (80, 840, 1000, 920)),
                    ("button", t["start"], "app:id/start", (80, 1900, 1000, 2040)),
                    ("link", t["signin"], "app:id/signin", (80, 2080, 1000, 2180))],
        "signup": [("appbar", t["create"], "app:id/title", (0, 80, 1080, 260)),
                   ("field", t["email"], "app:id/email", (80, 420, 1000, 560)),
                   ("field", t["password"], "app:id/password", (80, 620, 1000, 760)),
                   ("text", t["terms"], "", (80, 800, 1000, 870)),
                   ("button", t["submit"], "app:id/submit", (80, 2180 if keyboard else 1000, 1000, 2320 if keyboard else 1140))],
        "home": [("appbar", t["lists"], "app:id/title", (0, 80, 1080, 260)),
                 ("text", t["empty"], "app:id/empty", (80, 1000, 1000, 1100)),
                 ("fab", t["add"], "app:id/fab", (860, 1980, 1020, 2140)), *bar],
        "home_item": [("appbar", t["lists"], "app:id/title", (0, 80, 1080, 260)),
                      ("row", t["item"], "app:id/item", (0, 300, 1080, 460)),
                      ("fab", t["add"], "app:id/fab", (860, 1980, 1020, 2140)), *bar],
        "new": [("appbar", t["new"], "app:id/title", (0, 80, 1080, 260)),
                ("field", t["title"], "app:id/item_title", (80, 420, 1000, 560)),
                ("link", t["cancel"], "app:id/cancel", (80, 2250, 500, 2350)),
                ("button", t["save"], "app:id/save", (560, 2230, 1000, 2370))],
        "settings": [("appbar", t["settings"], "app:id/title", (0, 80, 1080, 260)),
                     ("row", t["size"], "app:id/text_size", (0, 300, 1080, 460)),
                     ("row", t["dark"], "app:id/dark", (0, 460, 1080, 620)),
                     ("row", t["out"], "app:id/sign_out", (0, 620, 1080, 780)),
                     ("row", t["help"], "app:id/help", (0, 780, 1080, 940)), *bar],
        "help": [("appbar", t["help"], "app:id/title", (0, 80, 1080, 260)),
                 ("row", t["faq"], "app:id/faq", (0, 300, 1080, 460)),
                 ("row", t["contact"], "app:id/contact", (0, 460, 1080, 620)),
                 ("row", t["privacy"], "app:id/privacy", (0, 620, 1080, 780))],
    }


def widen(elements, width):
    """The phone layout on a wider screen (a tablet): full-width bars stretch, the tab bar
    keeps its halves, everything else stays its size in the middle."""
    if width == PHONE_W:
        return elements
    pad = (width - PHONE_W) // 2
    out = []
    for kind, label, rid, (x1, y1, x2, y2) in elements:
        if kind == "tab":
            x1, x2 = x1 * width // PHONE_W, x2 * width // PHONE_W
        elif x1 == 0 and x2 == PHONE_W:
            x2 = width
        else:
            x1, x2 = x1 + pad, x2 + pad
        out.append((kind, label, rid, (x1, y1, x2, y2)))
    return out


def centre(elements, rid):
    for _, _, r, (x1, y1, x2, y2) in elements:
        if r == rid:
            return (x1 + x2) // 2, (y1 + y2) // 2
    raise KeyError(rid)


def xml(elements):
    nodes = []
    for kind, label, rid, (x1, y1, x2, y2) in elements:
        clickable = kind in ("button", "link", "field", "fab", "tab", "row")
        cls = "android.widget.EditText" if kind == "field" else ("android.widget.Button" if clickable else "android.widget.TextView")
        text, desc = ("", label) if kind in ("fab", "field") else (label, "")
        nodes.append(f'    <node text="{escape(text, {chr(34): "&quot;"})}" content-desc="{escape(desc, {chr(34): "&quot;"})}" '
                     f'resource-id="{rid}" class="{cls}" package="{APP}" clickable="{str(clickable).lower()}" '
                     f'bounds="[{x1},{y1}][{x2},{y2}]" />')
    return ("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n<hierarchy rotation=\"0\">\n"
            f'  <node text="" resource-id="" class="android.widget.FrameLayout" package="{APP}" bounds="[0,0][{W},{H}]">\n'
            + "\n".join(nodes) + "\n  </node>\n</hierarchy>\n")


def svg(elements, dark=False, keyboard=False):
    bg, fg, muted, accent, card = (("#121417", "#f2f4f7", "#9aa3ad", "#7aa7ff", "#1d2126") if dark
                                   else ("#ffffff", "#15181c", "#667085", "#2f6bff", "#f2f4f7"))
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W // 2}" height="{H // 2}" viewBox="0 0 {W} {H}" '
           f'font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">',
           f'<rect width="{W}" height="{H}" fill="{bg}"/>',
           f'<text x="60" y="56" font-size="34" fill="{muted}">9:41</text>',
           f'<text x="{W - 60}" y="56" font-size="34" fill="{muted}" text-anchor="end">▲ ▮ 82%</text>']
    for kind, label, _, (x1, y1, x2, y2) in elements:
        w, h, cx, cy = x2 - x1, y2 - y1, (x1 + x2) // 2, (y1 + y2) // 2
        lab = escape(label)
        if kind == "hero":
            out.append(f'<text x="{cx}" y="{y2 - 30}" font-size="72" font-weight="700" fill="{fg}" text-anchor="middle">{lab}</text>')
            out.append(f'<circle cx="{W // 2}" cy="420" r="150" fill="{accent}" opacity="0.15"/><circle cx="{W // 2}" cy="420" r="80" fill="{accent}"/>')
        elif kind == "appbar":
            out.append(f'<text x="60" y="{y2 - 50}" font-size="64" font-weight="700" fill="{fg}">{lab}</text>')
        elif kind == "text":
            out.append(f'<text x="{cx}" y="{cy + 14}" font-size="40" fill="{muted}" text-anchor="middle">{lab}</text>')
        elif kind == "button":
            out.append(f'<rect x="{x1}" y="{y1}" width="{w}" height="{h}" rx="{h // 2}" fill="{accent}"/>'
                       f'<text x="{cx}" y="{cy + 16}" font-size="46" font-weight="600" fill="#fff" text-anchor="middle">{lab}</text>')
        elif kind == "link":
            out.append(f'<text x="{cx}" y="{cy + 14}" font-size="42" fill="{accent}" text-anchor="middle">{lab}</text>')
        elif kind == "field":
            out.append(f'<rect x="{x1}" y="{y1}" width="{w}" height="{h}" rx="24" fill="{card}" stroke="{muted}" stroke-width="3"/>'
                       f'<text x="{x1 + 40}" y="{cy + 14}" font-size="42" fill="{muted}">{lab}</text>')
        elif kind == "fab":
            out.append(f'<circle cx="{cx}" cy="{cy}" r="{w // 2}" fill="{accent}"/>'
                       f'<text x="{cx}" y="{cy + 30}" font-size="96" fill="#fff" text-anchor="middle">+</text>')
        elif kind == "row":
            out.append(f'<rect x="{x1}" y="{y1}" width="{w}" height="{h}" fill="{bg}"/>'
                       f'<line x1="60" y1="{y2}" x2="{W - 60}" y2="{y2}" stroke="{card}" stroke-width="4"/>'
                       f'<text x="60" y="{cy + 16}" font-size="46" fill="{fg}">{lab}</text>'
                       f'<text x="{W - 60}" y="{cy + 16}" font-size="46" fill="{muted}" text-anchor="end">›</text>')
        elif kind == "tab":
            out.append(f'<rect x="{x1}" y="{y1}" width="{w}" height="{h}" fill="{card}"/>'
                       f'<text x="{cx}" y="{cy + 14}" font-size="40" fill="{fg}" text-anchor="middle">{lab}</text>')
    if keyboard:
        out.append(f'<rect x="0" y="1500" width="{W}" height="{H - 1500}" fill="{"#2a2e33" if dark else "#d1d5db"}"/>')
        for r, row in enumerate(("qwertyuiop", "asdfghjkl", "zxcvbnm")):
            pad = 60 + r * 40
            for i, ch in enumerate(row):
                out.append(f'<rect x="{pad + i * 100}" y="{1560 + r * 170}" width="88" height="140" rx="14" fill="{"#41464d" if dark else "#fff"}"/>'
                           f'<text x="{pad + i * 100 + 44}" y="{1650 + r * 170}" font-size="52" fill="{fg}" text-anchor="middle">{ch}</text>')
    out.append("</svg>")
    return "\n".join(out)


# Each tester: persona, language, theme, and what they did: (screen, keyboard shown, action).
# An action is ("tap", x, y), ("type", text), ("swipe", x1, y1, x2, y2) or ("key", "KEYCODE_BACK").
TESTERS = [
    ({"id": "anna", "profile": "Retired teacher, 68, low patience with jargon, uses large text.",
      "goal": "Create an account and add her first item without help.", "locale": "en-GB",
      "device": {"name": "Small phone, Android 11", "font_scale": 1.3, "theme": "light"}}, "en", False, [
        ("welcome", False, ("tap", 540, 1970)),
        ("signup", False, ("tap", 540, 490)), ("signup", True, ("type", "anna@example.com")),
        ("signup", True, ("tap", 540, 690)), ("signup", True, ("type", "S3cret-pass")),
        ("signup", True, ("tap", 300, 1300)), ("signup", True, ("key", "KEYCODE_BACK")),
        ("signup", False, ("tap", 540, 1070)),
        ("home", False, ("tap", 600, 1050)), ("home", False, ("tap", 940, 2060)),
        ("new", True, ("tap", 540, 490)), ("new", True, ("type", "Buy milk")),
        ("new", True, ("tap", 780, 2300)), ("new", True, ("key", "KEYCODE_BACK")), ("new", False, ("tap", 780, 2300)),
    ], [{"title": "The 'Create account' button is hidden by the keyboard", "severity": "major",
         "screen": "Sign-up", "screens": ["04", "05", "06"]},
        {"title": "'Save' sits under the keyboard: the first tap does nothing", "severity": "major",
         "screen": "New item", "screens": ["13", "14"]},
        {"title": "The empty state looks like a button but does nothing", "severity": "minor",
         "screen": "My lists", "screens": ["09"]}], 6, "home_item"),
    ({"id": "lucas", "profile": "Étudiant, 21, va vite, ne lit pas les textes.",
      "goal": "Ajouter trois éléments en moins d'une minute.", "locale": "fr-FR",
      "device": {"name": "Pixel 7, Android 14", "font_scale": 1.0, "theme": "dark"}}, "fr", True, [
        ("welcome", False, ("tap", 540, 2130)), ("welcome", False, ("tap", 540, 1970)),
        ("signup", False, ("tap", 540, 490)), ("signup", True, ("type", "lucas@example.com")),
        ("signup", True, ("tap", 540, 690)), ("signup", True, ("type", "hunter22")),
        ("signup", True, ("tap", 540, 2250)),
        ("home", False, ("tap", 940, 2060)), ("new", True, ("tap", 540, 490)), ("new", True, ("type", "Acheter du lait")),
        ("new", True, ("tap", 780, 2300)), ("home_item", False, ("tap", 810, 2300)),
        ("settings", False, ("tap", 540, 380)), ("settings", False, ("key", "KEYCODE_BACK")),
        ("settings", False, ("swipe", 540, 1600, 540, 700)),
    ], [{"title": "« J'ai déjà un compte » ne fait rien", "severity": "major", "screen": "Accueil", "screens": ["01"]},
        {"title": "« Taille du texte » n'ouvre aucun réglage", "severity": "minor", "screen": "Réglages", "screens": ["13", "14"]}],
     7, "settings"),
    ({"id": "kenji", "profile": "Accountant, 45, careful, reads every screen.",
      "goal": "Find how to sign out.", "locale": "en-US",
      "device": {"name": "Small phone, Android 11", "font_scale": 1.0, "theme": "light"}}, "en", False, [
        ("welcome", False, ("tap", 540, 1970)),
        ("signup", False, ("tap", 540, 490)), ("signup", True, ("type", "kenji@example.com")),
        ("signup", True, ("tap", 540, 690)), ("signup", True, ("type", "a-long-pass-phrase")),
        ("signup", True, ("key", "KEYCODE_BACK")), ("signup", False, ("tap", 540, 1070)),
        ("home", False, ("tap", 810, 2300)), ("settings", False, ("tap", 540, 700)),
    ], [{"title": "Sign out asks no confirmation", "severity": "minor", "screen": "Settings", "screens": ["09"]}],
     8, "welcome"),
]


# On a tablet: the same app, wider. Taps name the element ("el", resource id): they land on its centre.
TABLET = 1600
TESTERS.append(
    ({"id": "lucia", "profile": "Nurse, 39, uses the app on the family tablet, in the kitchen.",
      "goal": "Make a shopping list for the week.", "locale": "en-GB",
      "device": {"name": "Pixel Tablet, Android 14", "font_scale": 1.0, "theme": "light"}}, "en", False, [
        ("welcome", False, ("el", "app:id/start")),
        ("signup", False, ("el", "app:id/email")), ("signup", True, ("type", "lucia@example.com")),
        ("signup", True, ("el", "app:id/password")), ("signup", True, ("type", "kitchen-tablet-1")),
        ("signup", True, ("key", "KEYCODE_BACK")), ("signup", False, ("el", "app:id/submit")),
        ("home", False, ("el", "app:id/fab")),
        ("new", True, ("el", "app:id/item_title")), ("new", True, ("type", "Buy milk")),
        ("new", True, ("key", "KEYCODE_BACK")), ("new", False, ("el", "app:id/save")),
        ("home_item", False, ("el", "app:id/tab_settings")),
    ], [{"title": "On the tablet the form stays phone-sized in the middle: a lot of empty space", "severity": "minor",
         "screen": "Sign-up", "screens": ["02"]}], 7, "settings"))


# The map maker of briefs/map.md: no persona, every screen once.
MAPPER = ({"id": "map", "profile": "Map maker: opens every control once.", "goal": "Reach every screen of the app.",
           "locale": "en-US", "device": {"name": "Small phone, Android 11", "font_scale": 1.0, "theme": "light"}}, "en", False, [
    ("welcome", False, ("tap", 540, 2130)), ("welcome", False, ("tap", 540, 1970)),
    ("signup", False, ("tap", 540, 490)), ("signup", True, ("type", "map@example.com")),
    ("signup", True, ("tap", 540, 690)), ("signup", True, ("type", "map-pass-123")),
    ("signup", True, ("key", "KEYCODE_BACK")), ("signup", False, ("tap", 540, 1070)),
    ("home", False, ("tap", 940, 2060)), ("new", True, ("key", "KEYCODE_BACK")), ("new", False, ("tap", 290, 2300)),
    ("home", False, ("tap", 810, 2300)), ("settings", False, ("tap", 540, 380)), ("settings", False, ("tap", 540, 860)),
    ("help", False, ("tap", 540, 380)), ("help", False, ("key", "KEYCODE_BACK")),
    ("settings", False, ("tap", 540, 700)),
], [{"title": "'I already have an account' does nothing", "severity": "major", "screen": "Welcome", "screens": ["01"]}], None, "welcome")


def write(root):
    """Writes the run under root, laid out like the output of scripts/collect.sh."""
    global W
    root = Path(root)
    for persona, lang, dark, path, issues, score, last in TESTERS + [MAPPER]:
        W = TABLET if "Tablet" in persona["device"]["name"] else PHONE_W
        folder = root / f"android-{persona['id']}" / "results" / persona["id"]
        folder.mkdir(parents=True, exist_ok=True)
        log, nn = [], 0

        def shoot(name, keyboard):
            nonlocal nn
            nn += 1
            tag = f"{nn:02d}"
            elements = widen(screens(TEXTS[lang], keyboard)[name], W)
            (folder / f"{tag}.xml").write_text(xml(elements), encoding="utf-8")
            (folder / f"{tag}.svg").write_text(svg(elements, dark, keyboard), encoding="utf-8")
            log.append(f"0\tscreen\t{folder / (tag + '.xml')}\t{W}\t{H}")

        for name, keyboard, action in path:
            shoot(name, keyboard)
            if action[0] == "el":
                action = ("tap", *centre(widen(screens(TEXTS[lang], keyboard)[name], W), action[1]))
            if action[0] == "type":
                log.append(f"0\ttype\t{action[1]}")
            elif action[0] == "key":
                log.append(f"0\tadb\tshell\tinput\tkeyevent\t{action[1]}")
            else:
                log.append("0\tadb\tshell\tinput\t" + "\t".join(str(v) for v in action))
        shoot(last, False)
        trace, _, _ = ecr_trace.build(log, persona, APP, "2026-11-25T12:00:00Z")
        (folder / "trace.json").write_text(json.dumps(trace, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        findings = {"score": score, "issues": issues} if score is not None else {"mode": "map", "issues": issues}
        (folder / "findings.json").write_text(json.dumps(findings, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        report = [f"# {persona['id']}, {persona['device']['name']}", "", "Made-up run for the demo of the dashboard.", "",
                  "## Issues", ""]
        for i in issues:
            report += [f"### {i['title']}", f"- Severity: {i['severity']}", f"- Screenshots: {', '.join(i['screens'])}", ""]
        report += ["## Opinion", "", f"Score: {score}/10"] if score is not None else ["## Screens found", "", "Welcome, Sign-up, My lists, New item, Settings, Help."]
        (folder / "report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    W = PHONE_W
    return root
