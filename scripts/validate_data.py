#!/usr/bin/env python3
"""
scripts/validate_data.py – Prüft die Daten vor dem Commit.

Läuft in jedem Daten-Workflow nach dem Abruf und vor "git commit". Findet er einen Fehler,
endet er mit Exit-Code 1: der Workflow wird rot und die kaputten Daten landen nicht im Repo.

Geprüft wird:
  - universe.json: Liste, jeder Eintrag mit Ticker, keine doppelten Ticker, Kurse > 0,
    nicht plötzlich deutlich kleiner als der letzte Stand im Repo
  - jede geänderte oder neue JSON-Datei unter data/: lesbar (gültiges JSON)
  - geänderte Aktien-Dateien: Ticker und Kurs vorhanden
Warnungen (z. B. einzelne Werte ohne Kurs) brechen nicht ab, stehen aber im Log.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
MIN_UNIVERSE = 50              # weniger Einträge = sicher kaputt
MAX_SHRINK = 0.15              # mehr als 15 % weniger Einträge als vorher = Fehler
MIN_PRICED_SHARE = 0.90        # mindestens 90 % der Einträge brauchen einen Kurs > 0
SPECIAL = {"universe.json", "ai_insights.json", "macro.json", "status.json"}

errors, warnings = [], []


def git(*args):
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=60).stdout
    except Exception:
        return ""


def changed_files():
    """Geänderte und neue Dateien unter data/ (relativ zum Repo)."""
    out = set()
    for line in git("status", "--porcelain", "--", "data").splitlines():
        path = line[3:].strip().strip('"')
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        if path.endswith(".json"):
            out.add(path)
        elif path.endswith("/"):  # neuer Ordner
            for dp, _, files in os.walk(os.path.join(ROOT, path)):
                for f in files:
                    if f.endswith(".json"):
                        out.add(os.path.relpath(os.path.join(dp, f), ROOT))
    return sorted(out)


def check_universe():
    path = os.path.join(DATA, "universe.json")
    if not os.path.exists(path):
        warnings.append("universe.json fehlt (noch kein Datenlauf?)")
        return
    try:
        with open(path, encoding="utf-8") as f:
            uni = json.load(f)
    except Exception as e:
        errors.append("universe.json ist kein gültiges JSON: %s" % e)
        return
    if not isinstance(uni, list):
        errors.append("universe.json ist keine Liste")
        return
    if len(uni) < MIN_UNIVERSE:
        errors.append("universe.json hat nur %d Einträge (mindestens %d erwartet)" % (len(uni), MIN_UNIVERSE))

    no_ticker = [u.get("name", "?") if isinstance(u, dict) else str(u) for u in uni
                 if not isinstance(u, dict) or not u.get("ticker")]
    if no_ticker:
        errors.append("%d Einträge ohne Ticker: %s" % (len(no_ticker), ", ".join(map(str, no_ticker[:5]))))

    seen, dups = set(), set()
    for u in uni:
        t = isinstance(u, dict) and u.get("ticker")
        if t:
            if t in seen:
                dups.add(t)
            seen.add(t)
    if dups:
        errors.append("Doppelte Ticker: %s" % ", ".join(sorted(dups)[:10]))

    priced = [u for u in uni if isinstance(u, dict) and isinstance(u.get("price"), (int, float)) and u["price"] > 0]
    share = len(priced) / len(uni) if uni else 0
    unpriced = sorted(u.get("ticker", "?") for u in uni if isinstance(u, dict) and u not in priced)
    if share < MIN_PRICED_SHARE:
        errors.append("Nur %.0f %% der Werte haben einen Kurs > 0 (ohne Kurs: %s …)" % (share * 100, ", ".join(unpriced[:8])))
    elif unpriced:
        warnings.append("%d Werte ohne Kurs: %s" % (len(unpriced), ", ".join(unpriced[:10])))

    # Vergleich mit dem letzten Stand im Repo
    old_raw = git("show", "HEAD:data/universe.json")
    if old_raw.strip():
        try:
            old = json.loads(old_raw)
            if isinstance(old, list) and len(old) >= MIN_UNIVERSE and len(uni) < len(old) * (1 - MAX_SHRINK):
                errors.append("universe.json ist von %d auf %d Einträge geschrumpft" % (len(old), len(uni)))
            elif isinstance(old, list) and len(uni) != len(old):
                print("  Übersicht: %d -> %d Einträge" % (len(old), len(uni)))
        except Exception:
            pass
    print("  universe.json: %d Einträge, %.0f %% mit Kurs" % (len(uni), share * 100))


def check_files(files):
    bad = 0
    for rel in files:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            continue  # gelöscht
        try:
            with open(path, encoding="utf-8") as f:
                obj = json.load(f)
        except Exception as e:
            errors.append("%s ist kein gültiges JSON: %s" % (rel, str(e)[:120]))
            bad += 1
            continue
        name = os.path.basename(rel)
        # Aktien-Dateien liegen direkt in data/ (z. B. data/AAPL.json)
        if os.path.dirname(rel) == "data" and name not in SPECIAL and not name.startswith("_") and isinstance(obj, dict):
            if "quote" in obj or "profile" in obj:
                q = obj.get("quote") or {}
                if not obj.get("ticker") and not (obj.get("profile") or {}).get("ticker"):
                    warnings.append("%s: kein Ticker im Inhalt" % rel)
                if not (isinstance(q.get("price"), (int, float)) and q.get("price") > 0):
                    warnings.append("%s: kein Kurs" % rel)
    print("  %d geänderte JSON-Dateien geprüft%s" % (len(files), ", %d fehlerhaft" % bad if bad else ""))


def main():
    print("Datenprüfung:")
    files = changed_files()
    if any(f.endswith("data/universe.json") for f in files) or os.environ.get("CHECK_UNIVERSE") == "1":
        check_universe()
    check_files(files)
    for w in warnings[:20]:
        print("  Warnung:", w)
    if len(warnings) > 20:
        print("  … und %d weitere Warnungen" % (len(warnings) - 20))
    if errors:
        for e in errors:
            print("  FEHLER:", e)
        print("Datenprüfung fehlgeschlagen – es wird nichts committet.")
        sys.exit(1)
    print("Datenprüfung bestanden.")


if __name__ == "__main__":
    main()
