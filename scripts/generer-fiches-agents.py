#!/usr/bin/env python3
"""Génère plugin-atelier/src/contrats/fiches-agents-marketing.ts : les fiches lisibles des agents marketing.

Sources (rien n'est inventé, tout est recopié ou résumé mécaniquement) :
  - organisation/registre/agents.json : nom, titre, mission, entrées, sorties, outils retirés ;
  - organisation/agents/<slug>/AGENTS.md : compétences réellement attachées (en-tête) et règles
    « non négociables » qui interdisent quelque chose ;
  - organisation/skills/<cle>/SKILL.md : nom lisible (titre H1) et première phrase de la description ;
  - organisation/registre/services.json (service marketing) : humainSeul et obligations.
Les textes « Pourquoi cet agent » et le parcours d'une demande sont écrits ici, à partir de la mission écrite
et des consignes du Coordinateur (organisation/agents/coordinateur/AGENTS.md).

Usage (depuis la racine du dépôt) :
  python3 -I scripts/generer-fiches-agents.py              # écrit le fichier généré
  python3 -I scripts/generer-fiches-agents.py --verifier   # code 1 si le fichier écrit n'est plus à jour
  python3 -I scripts/generer-fiches-agents.py --stdout     # affiche le contenu sans l'écrire
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "plugin-atelier" / "src" / "contrats" / "fiches-agents-marketing.ts"
ORG = RACINE / "organisation"

# Justifications rédigées à partir de la mission écrite : courtes, neutres, sans promesse chiffrée.
POURQUOI = {
    "coordinateur": "Un seul point d'entrée transforme chaque demande en brief et en exigences numérotées : le travail des spécialistes part d'un cadre commun et vérifiable, et l'humain reçoit un dossier complet pour décider.",
    "veille": "La recherche de marché est séparée de la rédaction : les contenus s'appuient sur des observations sourcées et datées, pas sur des impressions.",
    "prospection": "Le repérage de prospects est cadré par des origines légales et par des réponses d'outils conservées telles quelles ; l'agent ne contacte personne, la décision d'agir reste humaine.",
    "enrichissement-coordonnees": "Les numéros de téléphone viennent uniquement de sources publiées par les professionnels eux-mêmes, recoupés sur deux sources et notés avec leur origine ; jamais de fuite de données ni de numéro deviné, et la liste « Ne m'appelez plus » est contrôlée avant tout appel.",
    "seo-local-geo": "Le référencement et la cohérence des informations locales se vérifient point par point ; l'agent distingue ce qui est mesuré de ce qui est supposé, sans garantie de classement.",
    "sea": "La publicité payante est préparée en brouillon et reliée à une offre validée, mais rien n'est activé ni dépensé sans décision humaine.",
    "contenus": "Les textes et les briefs de visuels sont produits selon la charte de la marque, avec leurs sources et droits signalés, pour que la relecture porte sur un contenu déjà cadré.",
    "crm-conversion": "Les pages, formulaires et scénarios de suivi sont conçus avec leurs conditions d'envoi et leurs consentements documentés, sans aucune prospection réelle automatique.",
    "mesure": "Les chiffres sont présentés avec leur provenance, leurs périodes et leurs incertitudes ; sans données, la réponse est « non mesurable » plutôt qu'une estimation.",
    "reseaux-sociaux": "Le social organique est préparé en brouillons par un agent dédié, mais publier ou répondre reste hors de son périmètre.",
    "conformite-publicitaire": "Les communications des secteurs réglementés sont contrôlées avant la relecture, avec la règle citée ou marquée « à vérifier » ; l'agent ne donne pas d'avis juridique définitif.",
    "exigences": "Un contrôleur distinct du producteur compare le livrable au brief : une exigence n'est dite couverte que si une preuve localisable existe.",
    "relecteur": "Une relecture indépendante de celui qui a produit le contenu vérifie faits, sources et cohérence entre canaux avant la décision humaine.",
    "tests-techniques": "Les liens, formulaires et formats sont vérifiés par de vrais contrôles : un code 200 sur une page d'erreur compte comme un échec.",
    "porte": "Aucune tâche ne passe à l'approbation humaine sans une évaluation automatique réussie sur la version courante ; ce contrôle n'est pas laissé au jugement d'un modèle.",
}

# La mission du registre de la Porte parle de « circuit 1.1 », de « PASS » et de « garde P2 » : version lisible, même sens.
MISSION_LISIBLE = {
    "porte": "Programme sans modèle d'IA qui tient l'étape de revue : il évalue la tâche d'après le contrôle automatique du plugin (exigences, couvertures, verdicts, constats) et décide soit de la passer à l'approbation humaine, soit de la renvoyer à son auteur.",
}

# Outils retirés à l'agent, en français courant (NotebookEdit n'a aucun sens pour un lecteur non technique).
OUTILS_RETIRES = {
    "WebSearch": "chercher sur le web",
    "WebFetch": "lire des pages web",
    "Write": "créer des fichiers",
    "Edit": "modifier des fichiers",
}
OUTILS_AGENTS = {"Agent", "Task"}

# Parcours d'une demande, d'après les consignes du Coordinateur (agents désignés par leur slug).
PARCOURS = [
    {
        "titre": "La demande arrive au Coordinateur",
        "texte": "Le Coordinateur cherche d'abord les réponses dans la fiche du client et ses connaissances, pose au plus 3 questions, puis propose un plan de 4 tâches au plus. Aucune tâche n'est créée avant l'accord écrit de l'humain sur ce plan.",
        "agents": ["coordinateur"],
    },
    {
        "titre": "Cadrage et exigences",
        "texte": "La demande devient un brief et des exigences numérotées REQ-001, REQ-002..., avec un graphe de tâches sans cycle : une tâche par livrable, un responsable, des dépendances explicites.",
        "agents": ["coordinateur"],
    },
    {
        "titre": "Production par les agents spécialisés",
        "texte": "Chaque spécialiste prépare son livrable en brouillon : veille de marché, prospects, coordonnées professionnelles, référencement, publicité, contenus, conversion, mesure, réseaux sociaux.",
        "agents": ["veille", "prospection", "enrichissement-coordonnees", "seo-local-geo", "sea", "contenus", "crm-conversion", "mesure", "reseaux-sociaux"],
    },
    {
        "titre": "Conformité publicitaire",
        "texte": "Toute communication commerciale sur un produit d'assurance ou financier passe par la Conformité publicitaire avant la relecture : affirmations à prouver, mentions obligatoires, formulations interdites, verdict.",
        "agents": ["conformite-publicitaire"],
    },
    {
        "titre": "Contrôles automatiques et relecture",
        "texte": "Les Exigences comparent le livrable au brief, les Tests techniques vérifient liens et formulaires, le Relecteur contrôle faits, sources et marque. La Porte de contrôle décide : approbation humaine si l'évaluation réussit, sinon retour à l'auteur.",
        "agents": ["exigences", "tests-techniques", "relecteur", "porte"],
    },
    {
        "titre": "Validation humaine avant toute publication",
        "texte": "Le Coordinateur prépare le dossier de validation humaine. Aucune publication, aucun envoi, aucune dépense sans l'approbation d'un humain, qui vise une version précise du livrable.",
        "agents": ["coordinateur"],
    },
]

DEBUT_INTERDIT = re.compile(r"^(Tu n[e'’]|Aucun|Aucune|Jamais)", re.UNICODE)


def lire_json(chemin: Path):
    return json.loads(chemin.read_text(encoding="utf-8"))


def sections(texte: str, titre: str) -> str:
    m = re.search(r"^## " + re.escape(titre) + r"\s*$(.*?)(?=^## |\Z)", texte, re.M | re.S)
    return m.group(1) if m else ""


def puces(bloc: str) -> list[str]:
    """Puces d'une liste markdown, lignes de continuation recollées, code en ligne sans apostrophes inverses."""
    resultat: list[str] = []
    for ligne in bloc.splitlines():
        if ligne.startswith("- "):
            resultat.append(ligne[2:].strip())
        elif ligne.startswith("  ") and ligne.strip() and resultat:
            resultat[-1] += " " + ligne.strip()
    return [re.sub(r"\s+", " ", p.replace("`", "")) for p in resultat]


def competences_attachees(agents_md: str) -> list[str]:
    entete = re.match(r"^---\n(.*?)\n---", agents_md, re.S)
    if not entete:
        return []
    m = re.search(r"^skills:\s*(\[\]|(?:\n\s+- .*)+)", entete.group(1), re.M)
    if not m or m.group(1) == "[]":
        return []
    return re.findall(r'"([^"]+)"', m.group(1))


def premiere_phrase(description: str) -> str:
    m = re.match(r"(.+?[.!?])(?:\s|$)", description, re.S)
    return (m.group(1) if m else description).strip()


def competence(cle: str) -> dict:
    texte = (ORG / "skills" / cle / "SKILL.md").read_text(encoding="utf-8")
    h1 = re.search(r"^# (.+)$", texte, re.M)
    desc = re.search(r'^description: "(.*)"$', texte, re.M)
    if not h1 or not desc:
        sys.exit(f"SKILL.md de {cle} : titre ou description introuvable")
    return {"cle": cle, "nom": h1.group(1).strip(), "sert": premiere_phrase(desc.group(1))}


def fiche(agent: dict) -> dict:
    slug = agent["slug"]
    agents_md = (ORG / "agents" / slug / "AGENTS.md").read_text(encoding="utf-8")
    titre = agent["titre"]
    m = re.match(r"^Pôle ([^·]+?)\s*·\s*(.*)$", titre)
    interdits = [p for p in puces(sections(agents_md, "Règles non négociables")) if DEBUT_INTERDIT.match(p)]
    outils = agent.get("outils", {}).get("interdits", [])
    retires = [OUTILS_RETIRES[o] for o in outils if o in OUTILS_RETIRES]
    if OUTILS_AGENTS & set(outils):
        retires.append("lancer d'autres agents")
    if slug not in POURQUOI:
        sys.exit(f"Aucune justification « Pourquoi » écrite pour {slug}")
    return {
        "slug": slug,
        "nom": agent["nom"],
        "pole": m.group(1).strip() if m else None,
        "role": m.group(2).strip() if m else titre,
        "mission": MISSION_LISIBLE.get(slug, agent["mission"]),
        "recoit": agent["entrees"],
        "livre": agent["sorties"],
        "competences": [competence(c) for c in competences_attachees(agents_md)],
        "interdits": interdits,
        "outilsRetires": retires,
        "pourquoi": POURQUOI[slug],
    }


def generer() -> str:
    registre = lire_json(ORG / "registre" / "agents.json")
    services = lire_json(ORG / "registre" / "services.json")
    marketing = next(s for s in (services if isinstance(services, list) else services["services"]) if s["slug"] == "marketing")
    fiches = [fiche(a) for a in registre["agents"]]
    slugs = {f["slug"] for f in fiches}
    for etape in PARCOURS:
        for s in etape["agents"]:
            if s not in slugs:
                sys.exit(f"Parcours : agent inconnu {s}")
    j = lambda v: json.dumps(v, ensure_ascii=False, indent=2)
    return f"""/**
 * Fiches lisibles des agents marketing et parcours d'une demande.
 * FICHIER GÉNÉRÉ par scripts/generer-fiches-agents.py à partir de organisation/ : ne pas modifier à la main.
 * Régénérer : python3 -I scripts/generer-fiches-agents.py (le test fiches-agents-marketing.spec.ts vérifie qu'il est à jour).
 */

export interface CompetenceFiche {{
  cle: string;
  /** Titre lisible, tiré de la compétence (organisation/skills/<cle>/SKILL.md). */
  nom: string;
  /** Première phrase de la description de la compétence. */
  sert: string;
}}

export interface FicheAgentMarketing {{
  slug: string;
  nom: string;
  pole: string | null;
  role: string;
  mission: string;
  recoit: string[];
  livre: string[];
  competences: CompetenceFiche[];
  /** Règles de ses consignes qui lui interdisent quelque chose, recopiées. */
  interdits: string[];
  /** Outils techniques qui lui sont retirés, en français courant. */
  outilsRetires: string[];
  pourquoi: string;
}}

export interface EtapeParcours {{
  titre: string;
  texte: string;
  /** Slugs des agents concernés. */
  agents: string[];
}}

export const FICHES_AGENTS_MARKETING: readonly FicheAgentMarketing[] = {j(fiches)};

export const PARCOURS_DEMANDE: readonly EtapeParcours[] = {j(PARCOURS)};

/** Service marketing du registre : décisions réservées à l'humain et obligations. */
export const HUMAIN_SEUL_MARKETING: readonly string[] = {j(marketing["humainSeul"])};
export const OBLIGATIONS_MARKETING: readonly string[] = {j(marketing["obligations"])};
"""


def main() -> int:
    contenu = generer()
    if "--stdout" in sys.argv:
        sys.stdout.write(contenu)
        return 0
    if "--verifier" in sys.argv:
        if not SORTIE.exists() or SORTIE.read_text(encoding="utf-8") != contenu:
            print(f"{SORTIE.relative_to(RACINE)} n'est plus à jour : relancer python3 -I scripts/generer-fiches-agents.py", file=sys.stderr)
            return 1
        print("fiches des agents marketing à jour")
        return 0
    SORTIE.write_text(contenu, encoding="utf-8")
    print(f"écrit : {SORTIE.relative_to(RACINE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
