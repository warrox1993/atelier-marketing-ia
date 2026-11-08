#!/usr/bin/env python3
"""Moteur de missions (#49) : la VRAIE migration 035 et le VRAI `creerBase` joués sur un PostgreSQL jetable.

Lancer : python3 -I scripts/tests/tester-moteur-sql.py
Démarre une instance dans un dossier temporaire (socket local, aucun réseau), laisse `moteur-sql-controles.mts` faire
les contrôles (schéma minimal, migration derrière le validateur de Paperclip, méthodes de base.ts), puis arrête
l'instance et supprime le dossier, même en cas d'échec. Binaires ou outils absents : échec franc, jamais un succès muet.
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile

RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PORT_MIN, PORT_MAX = 54900, 54999
ATTENTE_MAX = 240


def trouver_binaires_pg():
    modeles = [
        os.path.join(RACINE, "paperclip/node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64/native/bin"),
        "/usr/lib/postgresql/*/bin",
    ]
    for modele in modeles:
        for dossier in sorted(glob.glob(modele), reverse=True):
            if all(os.access(os.path.join(dossier, b), os.X_OK) for b in ("initdb", "pg_ctl", "postgres")):
                return dossier
    return None


def port_libre():
    import socket
    for port in range(PORT_MIN, PORT_MAX + 1):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return None


def main():
    erreurs = []
    bin_pg = trouver_binaires_pg()
    if not bin_pg:
        print("ECHEC initdb, pg_ctl ou postgres introuvables (lancer scripts/preparer-socle.sh)")
        return 1
    tsx = os.path.join(RACINE, "paperclip/server/node_modules/.bin/tsx")
    if not os.access(tsx, os.X_OK):
        print(f"ECHEC tsx introuvable : {tsx} (lancer scripts/preparer-socle.sh)")
        return 1
    port = port_libre()
    if port is None:
        print("ECHEC aucun port libre entre 54900 et 54999")
        return 1

    tmp = tempfile.mkdtemp(prefix="moteur-sql-")
    donnees = os.path.join(tmp, "pgd")
    demarre = False
    try:
        subprocess.run([os.path.join(bin_pg, "initdb"), "-D", donnees, "-U", "essai", "--auth=trust"], check=True, capture_output=True, timeout=ATTENTE_MAX)
        subprocess.run(
            [os.path.join(bin_pg, "pg_ctl"), "-D", donnees, "-w", "-l", os.path.join(tmp, "pg.log"), "-o", f"-p {port} -c listen_addresses='' -k {tmp}", "start"],
            check=True, capture_output=True, timeout=ATTENTE_MAX,
        )
        demarre = True
        env = dict(os.environ, PGHOST=tmp, PGPORT=str(port), PGUSER="essai", PGDATABASE="postgres")
        res = subprocess.run([tsx, os.path.join(RACINE, "scripts/tests/moteur-sql-controles.mts")], cwd=RACINE, env=env, capture_output=True, text=True, timeout=ATTENTE_MAX)
        sortie = res.stdout
        print(sortie, end="")
        if res.returncode != 0:
            erreurs.append(f"code de sortie {res.returncode}")
            print(res.stderr[-2000:], file=sys.stderr)
        if "OK " not in sortie or "tous les contrôles SQL sont passés" not in sortie:
            erreurs.append("la sortie ne contient pas le bilan attendu (contrôles non joués ?)")
        if "ECHEC" in sortie:
            erreurs.append("au moins un contrôle en échec")
    except subprocess.CalledProcessError as e:
        erreurs.append(f"commande en échec : {e.cmd[0]} : {(e.stderr or b'').decode(errors='replace')[-800:]}")
    except subprocess.TimeoutExpired as e:
        erreurs.append(f"délai dépassé : {e.cmd}")
    finally:
        if demarre:
            subprocess.run([os.path.join(bin_pg, "pg_ctl"), "-D", donnees, "-m", "immediate", "-w", "stop"], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)

    if erreurs:
        print("ECHEC moteur SQL : " + " ; ".join(erreurs))
        return 1
    print("OK moteur SQL réel (migration 035 + creerBase) sur PostgreSQL jetable")
    return 0


if __name__ == "__main__":
    sys.exit(main())
