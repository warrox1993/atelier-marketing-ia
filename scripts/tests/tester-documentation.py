#!/usr/bin/env python3
"""Tests de la documentation d'exploitation (README.md, docs/exploitation.md, docs/usine-services.md) : chaque
contrôle échoue dès qu'une phrase redevient fausse par rapport au dépôt (socle/VERSION, registres, unités systemd,
socle Paperclip). Aucune instance, aucun appel réseau. Audit du 29/10/2026, constats DOC-A2 à DOC-A18.

À lancer : python3 -I scripts/tests/tester-documentation.py
Régénérer les blocs chiffrés de docs/usine-services.md (entre « <!-- genere:… --> » et « <!-- /genere:… --> ») :
python3 -I scripts/tests/tester-documentation.py --ecrire
(« bootstrap-organisation.py generer » le fait aussi ; « generer --verifier » appelle --verifier ici.)
"""
import atexit
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
_DONNEES = tempfile.mkdtemp(prefix="atelier-test-documentation-")
atexit.register(shutil.rmtree, _DONNEES, True)
os.environ["ATELIER_DONNEES_LOCALES"] = _DONNEES
RACINE = Path(__file__).resolve().parent.parent.parent


def _module(nom: str, fichier: str):
    spec = importlib.util.spec_from_file_location(nom, RACINE / "scripts" / fichier)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


svc = _module("atelier_services", "atelier_services.py")
bo = _module("bootstrap_organisation", "bootstrap-organisation.py")

USINE = RACINE / "docs" / "usine-services.md"
COMMUNES = ("cadrage-exigences", "planification-livrables", "dossier-validation-humaine", "recherche-connaissances",
            "protocole-inter-coordinateurs")
# Services dont la liste du chapitre 4 garde les compétences communes (déclarées en plus des compétences propres).
AVEC_COMMUNES = ("marketing", "direction")


def lire(chemin: str) -> str:
    return (RACINE / chemin).read_text(encoding="utf-8")


def section(texte: str, titre: str) -> str:
    """Texte d'une section « ## <titre>… » jusqu'à la section suivante de même niveau."""
    debut = texte.index(f"\n## {titre}")
    fin = texte.find("\n## ", debut + 1)
    return texte[debut:fin if fin != -1 else len(texte)]


def socle_version() -> dict:
    return dict(l.split("=", 1) for l in lire("socle/VERSION").splitlines() if l and not l.startswith("#"))


# --- Blocs générés de docs/usine-services.md ------------------------------------------------------------------------

def consigne(service: str, agent: str) -> Path:
    if service == "marketing":
        return RACINE / "organisation" / "agents" / agent / "AGENTS.md"
    return RACINE / "organisation" / "services" / service / "agents" / agent / "AGENTS.md"


def skills_entete(chemin: Path) -> list[str]:
    fm, _ = bo.separer_frontmatter(chemin.read_text(encoding="utf-8"))
    return re.findall(r'^  - "([^"]+)"$', fm.split("skills:", 1)[1], re.M) if fm and "skills:" in fm else []


def description_skill(nom: str) -> str:
    texte = (RACINE / "organisation" / "skills" / nom / "SKILL.md").read_text(encoding="utf-8")
    return json.loads(re.search(r'^description: (".*")$', texte, re.M).group(1))


def donnees_services() -> dict:
    registre = svc.charger_services()
    services = registre["services"]
    par_slug = {s["slug"]: s for s in services}
    agents, skills = {}, {}
    for s in services:
        agents[s["slug"]] = [a for a in s["agents"] if consigne(s["slug"], a).exists()]
        vus: list[str] = []
        for a in agents[s["slug"]]:
            vus += [k for k in skills_entete(consigne(s["slug"], a)) if k not in vus]
        skills[s["slug"]] = vus
    return {"registre": registre, "services": services, "par_slug": par_slug, "agents": agents, "skills": skills,
            "generes": svc.flux_coordinateurs(registre)}


def _code(liste) -> str:
    return ", ".join(f"`{x}`" for x in liste)


def _sensible(s: dict) -> str:
    return "oui" if s.get("sensible") else ("non (public)" if s.get("public") else "non")


def bloc_chiffres(d: dict) -> str:
    reg_s, services, flux, generes = d["registre"], d["services"], d["registre"]["flux"], d["generes"]
    reg_a = json.loads(lire("organisation/registre/agents.json"))
    total = sum(len(v) for v in d["agents"].values())
    mkt = len(d["agents"]["marketing"])
    sensibles = [s["nom"].lower() for s in services if s.get("sensible")]
    publics = [s["nom"] for s in services if s.get("public")]
    a_metier = sum(1 for f in flux if f.get("approbationHumaine"))
    a_generes = sum(1 for f in generes if f.get("approbationHumaine"))
    fichiers = sorted((RACINE / "organisation" / "skills").glob("*/SKILL.md"))
    textes = [p.read_text(encoding="utf-8") for p in fichiers]
    rubrique = lambda titre: sum(1 for t in textes if f"\n## {titre}" in t)  # noqa: E731
    return "\n".join([
        f"Chiffres recalculés depuis `organisation/registre/services.json` (version {reg_s['version']} du "
        f"{reg_s.get('dateVersion', 'date non renseignée')}), `organisation/registre/agents.json` (version "
        f"{reg_a['version']} du {reg_a.get('dateVersion', 'date non renseignée')}), les consignes `AGENTS.md` et "
        "`organisation/skills/*/SKILL.md`, par `python3 -I scripts/tests/tester-documentation.py --ecrire` ; le même "
        "test échoue dès qu'ils ne correspondent plus au dépôt.",
        "",
        f"- {len(services)} services : le marketing, la Direction et {len(services) - 2} autres ; service public : "
        f"{', '.join(publics) or 'aucun'} (tout flux qui le touche exige l'approbation humaine).",
        f"- {total} agents qui ont un fichier de consignes : {mkt} au marketing (registre `agents.json`) et "
        f"{total - mkt} dans les {len(services) - 1} autres services. Le Gardien des connexions, agent natif sans "
        "modèle créé par le système, s'y ajoute et n'a pas de dossier de consignes.",
        f"- {len(sensibles)} services sensibles : {', '.join(sensibles)}.",
        f"- {len(flux) + len(generes)} flux : {len(flux)} flux métier (champ `flux`, dont {a_metier} sous approbation "
        f"humaine) et {len(generes)} flux générés entre le coordinateur général et les coordinateurs (dont {a_generes} "
        f"sous approbation) ; {a_metier + a_generes} flux sur {len(flux) + len(generes)} demandent une approbation "
        "humaine.",
        f"- {len(fichiers)} compétences : {rubrique('Sources officielles')} ont une section « Sources officielles », "
        f"{rubrique('À vérifier par un professionnel')} une section « À vérifier par un professionnel » et "
        f"{rubrique('Pièges')} une rubrique « Pièges ».",
    ])


def bloc_tableau(d: dict) -> str:
    lignes = ["| Service | Préfixe | Sensible | Coordinateurs | Agents | Spécialistes | Compétences |",
              "| --- | --- | --- | --- | --- | --- | --- |"]
    for s in d["services"]:
        coords = [s["coordinateur"]] + ([s["coordinateurGeneral"]] if s.get("coordinateurGeneral") else [])
        specs = [a for a in d["agents"][s["slug"]] if a not in coords]
        lignes.append(f"| {s['nom']} (`{s['slug']}`) | {s['prefixe']} | {_sensible(s)} | {_code(coords)} | "
                      f"{len(d['agents'][s['slug']])} | {_code(specs)} | {len(d['skills'][s['slug']])} |")
    return "\n".join(lignes)


def bloc_matrice(d: dict) -> str:
    flux, par_slug = d["registre"]["flux"], d["par_slug"]
    etoile = lambda f, cote: f"`{f[cote]}`" + ("*" if f.get("approbationHumaine") else "")  # noqa: E731
    lignes = ["| Service | Échange avec (approbation humaine marquée *) |", "| --- | --- |"]
    for s in d["services"]:
        envoie = [etoile(f, "cible") for f in flux if f["source"] == s["slug"]]
        recoit = [etoile(f, "source") for f in flux if f["cible"] == s["slug"]]
        lignes.append(f"| {s['nom']} (`{s['slug']}`) | Envoie à : {', '.join(envoie) or 'aucun'}. "
                      f"Reçoit de : {', '.join(recoit) or 'aucun'} |")
    hors = [f for f in flux if f.get("approbationHumaine")
            and not any(par_slug[f[c]].get("sensible") or par_slug[f[c]].get("public") for c in ("source", "cible"))]
    rapports = sum(1 for f in flux if f["cible"] == "direction" and f["objet"] == "Rapport périodique et escalade")
    lignes += ["", f"Les flux « Rapport périodique et escalade » vers la Direction sont au nombre de {rapports} ; les "
               f"{len(flux) - rapports} autres portent chacun un objet précis dans le registre.", "",
               f"Les {len(hors)} flux entre services ni sensibles ni publics qui exigent une approbation sont :", ""]
    lignes += [f"- `{f['source']}` vers `{f['cible']}` : {f['objet']}" for f in hors]
    return "\n".join(lignes)


def bloc_competences(d: dict) -> str:
    parties = []
    for s in d["services"]:
        noms = [k for k in d["skills"][s["slug"]] if s["slug"] in AVEC_COMMUNES or k not in COMMUNES]
        parties.append(f"### {s['nom']} (`{s['slug']}`)\n\n"
                       + "\n".join(f"- `{k}` : {description_skill(k)}" for k in noms))
    return "\n\n".join(parties)


def blocs_usine() -> dict[str, str]:
    d = donnees_services()
    return {"chiffres": bloc_chiffres(d), "services": bloc_tableau(d), "matrice": bloc_matrice(d),
            "competences": bloc_competences(d)}


def motif_bloc(nom: str) -> re.Pattern:
    return re.compile(rf"(<!-- genere:{nom} -->\n)(.*?)(\n<!-- /genere:{nom} -->)", re.S)


def ecrire_usine() -> None:
    texte = USINE.read_text(encoding="utf-8")
    for nom, contenu in blocs_usine().items():
        texte, n = motif_bloc(nom).subn(lambda m: m.group(1) + contenu + m.group(3), texte)
        if n != 1:
            raise SystemExit(f"bloc « {nom} » introuvable dans {USINE}")
    USINE.write_text(texte, encoding="utf-8")


class UsineServices(unittest.TestCase):
    """DOC-A4 : chiffres, tableau, matrice et compétences de docs/usine-services.md recalculés depuis le dépôt."""

    def test_blocs_generes_a_jour(self):
        texte = USINE.read_text(encoding="utf-8")
        for nom, attendu in blocs_usine().items():
            m = motif_bloc(nom).search(texte)
            self.assertIsNotNone(m, f"bloc « {nom} » absent de docs/usine-services.md")
            self.assertEqual(m.group(2), attendu, f"bloc « {nom} » périmé : lancer "
                             "python3 -I scripts/tests/tester-documentation.py --ecrire")

    def test_aucun_chiffre_fige_hors_des_blocs(self):
        texte = USINE.read_text(encoding="utf-8")
        hors_blocs = re.sub(r"<!-- genere:(\w+) -->.*?<!-- /genere:\1 -->", "", texte, flags=re.S)
        # La phrase sur « tous » donne un nombre recalculé et vérifié par test_tous_dit_ce_que_le_code_retient : pas un chiffre figé.
        choisis, _ = bo.valider_services_fiche({"services": "tous"}, [])
        hors_blocs = hors_blocs.replace(f"les {len(choisis)} services actifs du registre, sans l'Observatoire", "")
        for perime in ("28 services", "217 agents", "756 flux", "638", "118 flux", "188 compétences"):
            self.assertNotIn(perime, hors_blocs)

    def test_competences_communes_chez_chaque_coordinateur(self):
        # Le chapitre 4 ne répète pas les communes : il faut donc que chaque coordinateur les déclare vraiment.
        d = donnees_services()
        for s in d["services"]:
            if s["slug"] == "observatoire":
                continue  # projet personnel de l'opérateur : son directeur suit sa propre chaîne, sans bureau de liaison
            entete = skills_entete(consigne(s["slug"], s["coordinateur"]))
            for k in COMMUNES:
                self.assertIn(k, entete, f"{s['slug']} / {s['coordinateur']}")

    def test_tous_dit_ce_que_le_code_retient(self):
        # DOC-A2 : la doc dit ce que « "services": "tous" » installe réellement aujourd'hui.
        erreurs: list[str] = []
        choisis, _ = bo.valider_services_fiche({"services": "tous"}, erreurs)
        self.assertEqual(erreurs, [])
        texte = USINE.read_text(encoding="utf-8")
        if "observatoire" in choisis:
            self.assertIn(f"`\"tous\"` (les {len(choisis)} services actifs du registre, Observatoire compris", texte)
        else:
            self.assertIn(f"`\"tous\"` (les {len(choisis)} services actifs du registre, sans l'Observatoire", texte)

    def test_prefixes_reels_des_entreprises_existantes(self):
        # DOC-A14 : le préfixe du registre ne vaut que pour les entreprises créées avec un nom qui commence par lui.
        texte = section(USINE.read_text(encoding="utf-8"), "2.")
        self.assertIn("deriveIssuePrefixBase", texte)
        self.assertIn("ne sont jamais renommées", texte)


class Exploitation(unittest.TestCase):
    """README.md et docs/exploitation.md : état réel d'exploitation (DOC-A5 à DOC-A9, DOC-A16 à DOC-A18)."""

    def test_version_du_socle_lue_dans_socle_version(self):
        v = socle_version()
        readme, exploitation = lire("README.md"), lire("docs/exploitation.md")
        self.assertIn(v["TAG"], readme)
        self.assertNotIn("v2026.1012.0", readme)
        entete = exploitation.split("\n## ", 1)[0]
        self.assertIn(f"`{v['TAG']}`", entete)
        self.assertIn(f"`{v['BRANCHE_LOCALE']}`", entete)
        self.assertIn(f"tag `{v['TAG']}`", section(exploitation, "1."))

    def test_relance_de_3100_par_systemd(self):
        texte = section(lire("README.md"), "4.")
        self.assertIn("systemctl --user restart atelier-instance@atelier", texte)
        self.assertNotIn("relance au premier plan", texte)
        unite = lire("scripts/systemd/atelier-instance@.service")
        self.assertIn("Restart=on-failure", unite)

    def test_passerelle_sous_systemd_sans_simulation(self):
        texte = lire("docs/exploitation.md")
        self.assertNotIn("PASSERELLE_MODE=demonstration", texte)  # refusé au démarrage (passerelle/src/config.ts)
        self.assertNotIn("restent simulés", texte)
        self.assertNotIn("npm start", texte)
        self.assertIn("systemctl --user restart atelier-passerelle@3190", section(texte, "11."))
        self.assertIn("atelier-passerelle@3190", section(texte, "12."))
        self.assertIn("PASSERELLE_MODE n'existe plus", lire("passerelle/src/config.ts"))

    def test_retention_des_sauvegardes_celle_du_socle(self):
        source = lire("paperclip/packages/shared/src/types/instance.ts")
        valeurs = dict(re.findall(r"(dailyDays|weeklyWeeks|monthlyMonths): (\d+),",
                                  source.split("DEFAULT_BACKUP_RETENTION", 1)[1].split("};", 1)[0]))
        attendu = (f"{valeurs['dailyDays']} jours complets, puis une par semaine sur {valeurs['weeklyWeeks']} "
                   f"semaines et une par mois sur {valeurs['monthlyMonths']} mois")
        texte = lire("docs/exploitation.md")
        for titre in ("0.", "3.", "18."):
            self.assertIn(attendu, section(texte, titre), titre)
        self.assertNotIn("14 jours pour les sauvegardes de l'instance", texte)
        self.assertNotIn("30 jours de conservation", texte)

    def test_transfert_dit_le_prealable_tailscale(self):
        texte = section(lire("docs/exploitation.md"), "19.")
        self.assertIn("systemctl is-active tailscaled", texte)

    def test_services_annexes_et_restes_listes(self):
        texte = section(lire("docs/exploitation.md"), "13.")
        self.assertNotIn("Seules restent l'instance 3100", texte)
        for unite in ("atelier-pages", "atelier-crawl4ai", "atelier-listmonk", "atelier-mailpit", "atelier-umami",
                      "atelier-phoenix"):
            fichier = lire(f"scripts/systemd/{unite}.service")
            port = re.search(r"127\.0\.0\.1:(\d+)", fichier).group(1)
            self.assertIn(f"`{unite}` ({port})", texte, unite)

    def test_readme_dit_les_connecteurs_qui_existent(self):
        texte = lire("README.md").split("\n## ", 1)[0]
        self.assertNotIn("aucun connecteur de diffusion n'existe", texte)
        self.assertIn("Mailpit", texte)
        self.assertIn("non connecté", texte)

    def test_passerelles_sh_jamais_sur_le_port_de_systemd(self):
        texte = lire("docs/exploitation.md")
        self.assertIn("jamais pour la passerelle 3190", section(texte, "14."))

    def test_toutes_les_unites_livrees_dans_la_table(self):
        # DOC-A10 : chaque fichier de scripts/systemd/ a sa ligne dans la table de la section 16, avec son état réel.
        texte = section(lire("docs/exploitation.md"), "16.")
        for f in sorted((RACINE / "scripts" / "systemd").iterdir()):
            self.assertRegex(texte, rf"\| `{re.escape(f.name)}` \|[^\n]*\|[^\n]*\|", f.name)
        for absente in ("atelier-whatsapp.service", "atelier-bce-maj.timer", "atelier-erreurs-repetees.timer"):
            self.assertRegex(texte, rf"\| `{re.escape(absente)}` \|[^\n]*\| non installée", absente)
        self.assertRegex(texte, r"\| `atelier-ollama\.service` \|[^\n]*\| installée, désactivée")

    def test_whatsapp_identite_en_mode_authentifie(self):
        # DOC-B3 : la passerelle WhatsApp ne dépend plus de local_trusted : clé board lue dans ATELIER_CLE_BOARD_FICHIER.
        self.assertIn("ATELIER_CLE_BOARD_FICHIER", lire("whatsapp/src/config.ts"))
        identite = next(b for b in lire("docs/whatsapp.md").split("\n- ") if b.startswith("Identité"))
        self.assertIn("ATELIER_CLE_BOARD_FICHIER", identite)
        self.assertIn("mode `authenticated`", identite)

    def test_patches_du_socle_sans_compte_perime(self):
        # AFC-A12 : le nombre de patches se lit dans socle/patches/, la doc ne le fige pas à une valeur dépassée.
        n = len(list((RACINE / "socle" / "patches").glob("*.patch")))  # le nombre daté de la doc n'excède jamais le réel
        entete = lire("docs/mise-a-jour-socle.md").split("\n## ", 1)[0]
        self.assertNotIn("+ 99 patches", entete)
        self.assertIn("`ls socle/patches/*.patch | wc -l`", entete)
        self.assertLessEqual(int(re.search(r"(\d+) au 30/10/2026", entete).group(1)), n)
        reprise = lire("REPRISE.md").split("## État au 30/10/2026", 1)[1].split("\n## ", 1)[0]
        self.assertNotIn("111 patches", reprise)
        self.assertLessEqual(int(re.search(r"(\d+) patches dans le dépôt", reprise).group(1)), n)
        self.assertIn("`ls socle/patches`", reprise)

    def test_statbel_format_et_sans_mullvad(self):
        # S1 (a90c355) et AFC-A12 : format des chiffres et Mullvad retiré le 25/10/2026.
        texte = lire("docs/passerelle.md")
        self.assertIn("`source` est une clé (`population`, `revenus`, `tva`) de la table `sources` de la réponse", texte)
        self.assertNotIn("lance les téléchargements avec `mullvad-exclude`", texte)
        self.assertIn("Mullvad a été retiré le 25/10/2026", texte)

    def test_whatsapp_livre_non_deploye(self):
        # DOC-A12 : la passerelle WhatsApp est livrée mais n'a jamais été déployée.
        entete = lire("docs/whatsapp.md").split("\n## ", 1)[0]
        self.assertIn("livré, non déployé", entete)
        self.assertNotIn("C'est le SEUL service publié sur Internet", entete)



class Observatoire(unittest.TestCase):
    """docs/observatoire/ : la spécification dit l'état réel du code (SPEC-E12 à SPEC-E16, SPEC-O2, DOC-A13)."""

    def test_noms_reels_des_fichiers_de_la_porte(self):
        # SPEC-E12
        for doc in ("docs/observatoire/regles-porte.md", "docs/observatoire/agents.md"):
            texte = lire(doc)
            self.assertNotIn("regles-observatoire.ts", texte, doc)
            self.assertNotIn("regles-observatoire.spec.ts", texte, doc)
        texte = lire("docs/observatoire/regles-porte.md")
        for chemin in ("plugin-atelier/src/serveur/observatoire/regles-porte-obs.ts", "plugin-atelier/tests/observatoire-regles-porte.spec.ts"):
            self.assertTrue((RACINE / chemin).is_file(), chemin)
            self.assertIn(chemin, texte)
        self.assertNotIn("12 agents + porte", lire("docs/observatoire/architecture.md"))

    def test_obs_02_11_12_disent_le_controle_reel(self):
        # SPEC-O2 et SPEC-E14
        regles = lire("docs/observatoire/regles-porte.md")
        obs02 = regles.split("### OBS-02", 1)[1].split("\n### ", 1)[0]
        minimum = re.search(r"EXTRAIT_MIN_CARACTERES = (\d+);", lire("plugin-atelier/src/serveur/observatoire/normaliseur.ts")).group(1)
        self.assertIn(f"moins de {minimum} caractères", obs02)
        self.assertIn("`position` déclarée", obs02)
        obs11 = regles.split("### OBS-11", 1)[1].split("\n### ", 1)[0]
        self.assertIn("aucun champ ne dit le sens", obs11)
        obs12 = regles.split("### OBS-12", 1)[1].split("\n### ", 1)[0]
        self.assertIn("`Raisonnement :`", obs12)
        self.assertIn("convention de texte", obs12)

    def test_tables_et_cles_non_construites_annoncees(self):
        # SPEC-E15 : dossier de 24 chapitres, Éditions et Essais sans support aujourd'hui.
        migrations = "".join(f.read_text(encoding="utf-8") for f in sorted((RACINE / "plugin-atelier" / "migrations").glob("*_obs_*.sql")))
        modele = lire("docs/observatoire/modele-donnees.md").split("\n## ", 1)[0]
        for table in ("obs_chapitres", "obs_editions", "obs_essais"):
            self.assertNotIn(f"{table} (", migrations, table)
            self.assertIn(f"`{table}`", modele, table)
        self.assertIn("phase ultérieure", modele)
        self.assertNotIn("Aucune table n'est créée par ce lot", modele)
        agents = lire("docs/observatoire/agents.md")
        for tache in ("obs.dossier.assembler", "obs.edition.rediger", "obs.essai.preparer"):
            ligne = next(l for l in agents.splitlines() if tache in l)
            bloc = agents[agents.index(ligne) - 600:agents.index(ligne) + 600]
            self.assertIn("phase ultérieure", bloc.lower(), tache)

    def test_entrees_calculees_par_le_code_etat_reel(self):
        # SPEC-E16
        agents = lire("docs/observatoire/agents.md")
        self.assertIn("Entrées calculées par le code : état au 30/10/2026", agents)
        etat = agents.split("Entrées calculées par le code : état au 30/10/2026", 1)[1].split("\n\n", 1)[0]
        for absent in ("K5", "K10", "scans"):
            self.assertIn(absent, etat)
        self.assertIn("refusé par OBS-01 et OBS-02", etat)

    def test_aucune_transcription_promise(self):
        # DOC-A13 : aucun code de transcription, collecte audio suspendue (DROIT-5.3).
        self.assertNotIn("youtube", lire("plugin-atelier/src/serveur/observatoire/collecte.ts").lower())
        for doc in ("docs/observatoire/agents.md", "docs/observatoire/droits-collecte.md", "docs/observatoire/adr/ADR-002-douze-agents-roles-mecaniques-en-code.md"):
            texte = lire(doc)
            self.assertNotIn("transcriptions locales fournies par le code", texte, doc)
            self.assertNotIn("que le code de collecte\nlui fournit", texte, doc)
        self.assertNotIn("transcription locale de l'audio par le code de collecte K1", lire("docs/observatoire/droits-collecte.md"))
        self.assertIn("obs.sources.video", lire("docs/observatoire/agents.md").split("### 3.13", 1)[1])
        self.assertIn("mission suspendue", lire("docs/observatoire/agents.md").split("### 3.13", 1)[1])

if __name__ == "__main__":
    if sys.argv[1:] == ["--ecrire"]:
        ecrire_usine()
        print(f"Blocs régénérés dans {USINE.relative_to(RACINE)}")
    elif sys.argv[1:] == ["--verifier"]:
        # Appelé par « bootstrap-organisation.py generer --verifier » : n'écrit rien, échoue si un bloc est périmé.
        texte = USINE.read_text(encoding="utf-8")
        perimes = [nom for nom, attendu in blocs_usine().items()
                   if not (m := motif_bloc(nom).search(texte)) or m.group(2) != attendu]
        if perimes:
            print(f"ÉCART : blocs périmés dans {USINE.relative_to(RACINE)} : {', '.join(perimes)}", file=sys.stderr)
            sys.exit(1)
        print(f"Blocs de {USINE.relative_to(RACINE)} à jour.")
    else:
        unittest.main(verbosity=1)
