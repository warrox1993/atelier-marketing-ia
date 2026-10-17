# Banc d'essais des compétences (Lot 4)

Le banc joue les cas d'essai des études `docs/etude-usine-v2` avec un modèle libre local, note chaque sortie,
enregistre les résultats dans Phoenix et compare deux versions d'une compétence. Tout tourne sur le PC et reste
gratuit : le modèle local fait les essais en masse, Claude (via `claude -p`, abonnement Max, sans clé d'API) ne juge
que les deux meilleures versions, et seulement sur demande.

Règle : une compétence n'est modifiée que si la nouvelle version fait mieux **de plus d'un écart-type combiné et sans
recul de la moyenne sur aucun cas** (voir « Répétitions et règle de décision »). Le banc ne touche jamais
`organisation/` : les propositions sont déposées hors du dépôt et un humain décide.

## Outils et versions (vérifiés le 17/10/2026)

| Outil | Version | Preuve de stabilité | Licence |
| --- | --- | --- | --- |
| Ollama | 0.40.6 | release GitHub `v0.40.6`, `prerelease=false`, `draft=false` (publiée le 16/10/2026) ; archive vérifiée par SHA-256 (`c164ab8b…c5e0`, empreinte publiée par GitHub) | MIT |
| Modèle `qwen3.5:9b` (Q4_K_M, 9,0 milliards de paramètres) | étiquette de la bibliothèque Ollama | modèle publié (pas d'étiquette « preview ») ; carte Hugging Face `Qwen/Qwen3.5-9B` : `license: apache-2.0` | Apache 2.0 |
| DSPy | 3.4.1 | PyPI 3.4.1 et release GitHub `3.4.1` `prerelease=false` (la 3.4.0b1 précédente, elle, est une préversion : non utilisée) | MIT |
| Optimiseur DSPy | COPRO | non marqué `@experimental` dans DSPy 3.4.1 ; GEPA, `@experimental(version="3.0.0")` dans `dspy/teleprompt/gepa/gepa.py`, est écarté | |
| Phoenix | 20.23.0 | déjà en place, voir `docs/phoenix.md` | Elastic 2.0 |

Réserve à connaître : le paquet PyPI de DSPy porte depuis toujours le classificateur
`Development Status :: 3 - Alpha`, alors que ses versions numérotées sans suffixe (3.4.1) sont publiées comme
finales sur GitHub. La version installée n'est ni bêta, ni RC, ni préversion ; les fonctions marquées expérimentales
dans le code (GEPA, `react_v2`, `rlm`, etc.) ne sont pas utilisées.

**Opik Optimizer écarté.** `opik-optimizer` 3.2.0 n'a pas de suffixe de préversion, mais il dépend du SDK `opik`
(`opik>=1.9.7`), dont le paquet PyPI se déclare `Development Status :: 2 - Pre-Alpha` (2.2.103 au 16/10/2026), et il
tire `gepa` (l'algorithme marqué expérimental dans DSPy). Il ferait aussi doublon avec DSPy. Non installé.

## Installation (déjà faite sur le poste de développement)

- Ollama : méthode « Manual install » de la documentation officielle (https://docs.ollama.com/linux), dans
  l'espace utilisateur (`~/.local/share/atelier-banc/ollama`), sans sudo. Unité utilisateur
  `scripts/systemd/atelier-ollama.service` (commandes en tête du fichier) : `OLLAMA_HOST=127.0.0.1:11434`,
  `OLLAMA_NO_CLOUD=1`, modèles dans `~/.local/share/atelier-banc/modeles`, contexte 16 384 jetons, un seul modèle
  chargé. Elle n'est **pas** activée au démarrage : la carte (RTX 3080, 10 Go) sert aussi aux jeux.
  `systemctl --user start atelier-ollama` avant un banc, `stop` après. Contrôle :
  `ss -ltnp | grep 11434` doit montrer `127.0.0.1:11434` seulement.
- Piège réseau : `ollama pull` échoue derrière le VPN (Mullvad refuse l'IPv6 vers le stockage Cloudflare du
  registre, et le téléchargeur d'Ollama ne se rabat pas sur l'IPv4). Le modèle a été récupéré couche par couche avec
  `curl -4` depuis `registry.ollama.ai` (manifeste `library/qwen3.5:9b`), chaque couche vérifiée par son SHA-256,
  puis rangée à l'identique dans `modeles/` (ce que fait `ollama pull`).
- Venv du banc : `python3 -m venv ~/.local/share/atelier-banc/venv` puis `pip install "dspy==3.4.1"`.

## Choix du modèle

`qwen3.5:9b` : licence Apache 2.0 (permissive), entraîné en multilingue dont le français, et il tient entièrement
dans la carte. Mesure `ollama ps` / `nvidia-smi` en cours de banc : 6,0 Go en mémoire vidéo (`size_vram` = `size`,
rien sur le processeur), 7,8 Go occupés sur 10 Go au total avec le bureau, 67 jetons par seconde en génération.
Écartés : les versions 27B de Qwen 3.5 à 3.8 (17 à 20 Go, débordement sur le processeur), Llama (licence
communautaire Meta, non permissive), Ministral 8B (licence de recherche Mistral), Gemma (conditions Google, non
OSI). Le mode « réflexion » de Qwen est coupé (`think: false`) pour la vitesse.

## Utilisation

```sh
systemctl --user start atelier-ollama
# 1. Cas d'essai et pièces fictives -> Phoenix (28 jeux « banc-<département> », 84 cas), idempotent
python3 -I scripts/banc/charger-cas.py [--a-blanc]
# 2. Banc d'une compétence (version A = SKILL.md actuel, B facultative), 3 répétitions par défaut
python3 -I scripts/banc/executer.py --competence relance-amiable-b2b-b2c [--version-b CHEMIN] [--repetitions 3]
#    jugement final par Claude, désactivé par défaut : plafond d'appels obligatoire, mode à blanc possible,
#    Sonnet par défaut (quota Max), Opus seulement avec --modele-claude opus
python3 -I scripts/banc/executer.py --competence X --version-b CHEMIN --juge-claude --plafond-claude 3 \
    [--a-blanc-claude] [--modele-claude opus]
# 3. Proposition d'amélioration par DSPy (déposée hors dépôt, puis mesurée A / B par le banc)
~/.local/share/atelier-banc/venv/bin/python -I scripts/banc/proposer-dspy.py --competence X [--departement D]
systemctl --user stop atelier-ollama
```

- Jeux Phoenix : un par département (`banc-recouvrement`, etc.), un exemple par cas, identifiant stable = clé du
  cas (`g2-11.3.3` : groupe 2, section 11.3, cas 3), provenance `fichier:ligne`, empreinte du contenu. Un second
  passage ne renvoie rien ; une étude modifiée met à jour son seul jeu (Phoenix ne crée une version que s'il y a une
  différence). Une liste locale de noms de clients réels (`~/.local/share/atelier-banc/noms-interdits.txt`, hors
  dépôt) bloque tout envoi si l'un d'eux apparaît dans un cas.
- Pièces fictives : `tests/banc/pieces/<département>/<cas>/` (76 cas sur 84, aucune donnée réelle, voir le
  `LISEZ-MOI.md` du dossier). Elles sont ajoutées à l'énoncé vu par le modèle, le juge local et le juge Claude, et
  chargées dans Phoenix avec le cas. `criteres.json` ajoute des critères chiffrés ou textuels vérifiés par code
  (60 critères : montants retrouvés, comptages, valeurs interdites), recalculés à partir des pièces par les tests.
- Répétitions et règle de décision : chaque version est jouée N fois (`--repetitions`, défaut 3). Avec plusieurs
  répétitions, la génération est échantillonnée (température 0,3, graine 42 + n° de répétition, réglable par
  `--temperature`) ; avec une seule, elle reste déterministe (température 0). Score d'un cas = moyenne de ses
  répétitions ; score d'une version = moyenne des scores de ses répétitions (une répétition = un passage sur tous
  les cas), avec leur écart-type d'échantillon. **Une version B n'est retenue que si sa moyenne dépasse celle de A de
  plus d'un écart-type combiné (racine de la somme des carrés des deux écarts-types) ET sans recul de la moyenne
  sur un cas.** Dans Phoenix, chaque répétition est une exécution (`repetition_number`) de l'expérience.
- Notation, critère par critère : un fragment cité dans le critère (« … » ou `…`) est vérifié par code quand le
  résultat est certain (fragment interdit absent : réussi ; fragment exigé absent : échoué) ; sinon le juge local
  (même modèle, sortie JSON contrainte, raison puis verdict) tranche. Score d'un cas = critères réussis / critères.
- Chaque version devient une expérience Phoenix sur le jeu du département (évaluation « criteres », et
  « juge-claude » si demandé) : la comparaison A / B se lit dans l'onglet *Experiments* du jeu.
- Résultats détaillés (sorties, raisons du juge, temps, jetons) : `~/.local/share/atelier-banc/resultats/`.
- Juge Claude : `claude -p --output-format json --no-session-persistence --strict-mcp-config
  --setting-sources project --disable-slash-commands`, lancé depuis `~/.local/share/atelier-banc` (aucun réglage
  ni crochet utilisateur chargé) ; modèle `sonnet` par défaut, `opus` seulement sur option explicite ;
  `is_error` et `subtype == "success"` sont vérifiés ; l'ordre des deux sorties
  alterne d'un cas à l'autre ; `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA` est retiré de l'environnement.
- DSPy (COPRO) ne réécrit pas la compétence : il cherche un bloc « Points de vigilance issus du banc d'essais »
  ajouté en fin de SKILL.md. Ollama ne sait pas rendre plusieurs réponses par appel (`n > 1`, que COPRO demande) :
  le script fait alors n appels successifs. Les consignes internes de COPRO sont en anglais : un bloc proposé en
  anglais est traduit par le modèle local (signalé dans `proposition.json`). Proposition :
  `~/.local/share/atelier-banc/propositions/<compétence>/<horodatage>/SKILL.md` + `proposition.json` (scores avant
  / après mesurés par le banc).
- Tests : `python3 -I scripts/tests/tester-banc.py` (faux Phoenix, faux Ollama, faux `claude`).

## Résultats de l'essai réel

Essai du 17/10/2026, sur le poste de développement (RTX 3080), modèle `qwen3.5:9b` (Q4_K_M), Ollama 0.40.6, DSPy 3.4.1 (COPRO,
largeur 3, profondeur 2), une compétence par groupe d'études. Version A = SKILL.md du dépôt ; version B = proposition
DSPy (SKILL.md + bloc « Points de vigilance »). Scores = part des critères réussis, cas par cas puis en moyenne.
Temps = génération et notation des 3 cas d'une version. Expériences visibles dans Phoenix sur chaque jeu `banc-…`.

| Groupe | Compétence (département) | A : score (cas 1 / 2 / 3) | B DSPy : score (cas 1 / 2 / 3) | Écart | Décision du banc | Temps A / B | Optimisation DSPy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `grille-entretien-structure` (ressources humaines) | 0,917 (0,75 / 1 / 1) | 0,417 (0,75 / 0,5 / 0) | −0,500 | rejetée (2 cas en recul) | 80 s / 49 s | 316 s |
| 2 | `relance-amiable-b2b-b2c` (recouvrement) | 0,667 (0,25 / 0,75 / 1) | 0,500 (0,25 / 0,25 / 1) | −0,167 | rejetée (1 cas en recul) | 78 s / 89 s | 341 s |
| 3 | `cloture-mensuelle` (comptabilité et finance) | 0,383 (0,4 / 0,5 / 0,25) | 0,300 (0,4 / 0,25 / 0,25) | −0,083 | rejetée (1 cas en recul) | 85 s / 81 s | 460 s |

Durée totale par compétence (optimisation + banc A / B) : 7 min 26 s, 8 min 30 s et 10 min 28 s.
Débit : 67 jetons par seconde ; environ 4 000 à 5 500 jetons produits par version (3 cas).

**Avant / après d'une vraie amélioration (humaine).** Pendant l'essai, le lot Recouvrement a amélioré
`relance-amiable-b2b-b2c` (commit 2b2c5d4 : fraude à l'IBAN, lots, prime d'assurance). Même banc, même juge :
version précédente (empreinte `cc17404d`) 0,250 (0 / 0,75 / 0) ; nouvelle version (`7887a025`) 0,667
(0,25 / 0,75 / 1). Le cas « Fraude » passe de 0 à 4 critères sur 4 : le banc mesure bien l'effet d'une modification.

**Jugement final par Claude (une fois, 3 appels).** `cloture-mensuelle`, A contre B DSPy, `--juge-claude
--plafond-claude 3` (modèle par défaut de Claude Code : Opus 5.5). Juge local : A 0,450, B 0,300. Claude : cas 1
B meilleure (« X invente des données : le fournisseur "Alpha", les dates 28/09 et 31/09 (date impossible) ») ; cas 2
A meilleure ; cas 3 égalité. Le juge local n'avait pas vu les données inventées du cas 1 : c'est exactement le rôle du
jugement final. Durée du passage : 197 s.

**Ce que montre l'essai.**
- Aucune proposition DSPy n'est retenue : la règle « mieux sans recul » les écarte toutes, et rien n'a été copié
  dans `organisation/`. Sur des compétences déjà longues et précises, un bloc générique ajouté par un modèle de
  9 milliards de paramètres n'apporte rien ou dégrade.
- Premier essai de DSPy sans ancrage : le bloc proposé pour la relance parlait d'un « cas clinique » et d'une
  « compétence médicale » (COPRO ne voit que la consigne de départ, pas la compétence). Corrigé : la consigne de
  départ porte maintenant le nom et l'objet de la compétence ; les trois blocs suivants sont dans le bon domaine.
- Bruit de mesure : à consigne identique, `cloture-mensuelle` A a obtenu 0,383 puis 0,450 (température 0 et graine
  fixe, mais la génération sur carte graphique n'est pas parfaitement reproductible). Avec 3 cas par département, un
  seul critère fait varier le score de 0,08 à 0,25 : un écart de cet ordre n'est pas une preuve.
- Les cas des études décrivent les pièces (« extrait bancaire de 42 lignes ») sans les fournir : le modèle travaillait
  sur la description, ce qui limitait les critères chiffrés. Corrigé le 17/10/2026 (section suivante).

## Fiabilisation du banc (17/10/2026) : pièces, répétitions, règle de décision

Trois défauts du premier essai sont corrigés : les cas décrivaient leurs pièces sans les fournir (pas de critère
chiffré possible), un seul passage par version (le bruit de mesure n'était pas chiffré) et un juge Claude lancé sur le
modèle le plus coûteux. Changements : pièces fictives injectées (76 cas sur 84, 60 critères vérifiés par code),
`--repetitions` (défaut 3) avec moyenne et écart-type, règle « plus d'un écart-type combiné et sans recul sur un cas »,
juge Claude sur Sonnet par défaut. Voir « Utilisation » pour le détail.

**Rejeu sur les trois compétences du premier essai** (même modèle `qwen3.5:9b`, mêmes versions : A = SKILL.md du
dépôt, B = proposition DSPy du premier essai, reprise telle quelle car l'empreinte d'origine de chaque SKILL.md n'a
pas changé ; 3 répétitions, température 0,3, graines 42 à 44 ; juge local seulement, pas d'appel à Claude).
Score = part des critères réussis (critères de l'étude et critères de pièces), moyenne des 3 répétitions +/- écart-type
des 3 scores de répétition (écart-type d'échantillon). Une répétition = un passage sur les 3 cas.

| Compétence | A avant (1 passage, sans pièces) | A après (3 répétitions, avec pièces) | B avant | B après | B - A | Écart-type combiné | Reculs (moyenne d'un cas) | Décision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `grille-entretien-structure` | 0,917 | 0,407 +/- 0,125 (0,417 / 0,278 / 0,528) | 0,417 | 0,500 +/- 0,083 (0,583 / 0,500 / 0,417) | +0,093 | 0,150 (non dépassé) | `g1-8.3.3` | non retenue |
| `relance-amiable-b2b-b2c` | 0,667 | 0,663 +/- 0,090 (0,678 / 0,567 / 0,744) | 0,500 | 0,548 +/- 0,034 (0,556 / 0,511 / 0,578) | -0,115 | 0,096 (dépassé, mais B recule) | les 3 cas | non retenue |
| `cloture-mensuelle` | 0,383 | 0,344 +/- 0,051 (0,333 / 0,300 / 0,400) | 0,300 | 0,359 +/- 0,071 (0,400 / 0,400 / 0,278) | +0,015 | 0,087 (non dépassé) | `g3-3.3.2`, `g3-3.3.3` | non retenue |

Temps (3 répétitions des 3 cas, génération et notation) : A 250 s, 246 s et 268 s ; B 168 s, 228 s et 299 s.
Détail par cas et par répétition : `~/.local/share/atelier-banc/resultats/20261017-224434-grille-entretien-structure.json`,
`20261017-225228-relance-amiable-b2b-b2c.json`, `20261017-230155-cloture-mensuelle.json` ; expériences dans Phoenix
(3 exécutions par cas, `repetition_number` 1 à 3).

**Lecture.**
- Les scores « avant » et « après » ne se comparent pas directement : les pièces rendent les cas plus exigeants. Le
  modèle travaille maintenant sur des données réelles de cas (au lieu de leur description) et doit retrouver des
  valeurs précises, ce que des critères par code vérifient sans indulgence. La grille d'entretien passe de 0,917 à
  0,407 : les critères portent désormais aussi sur les données des pièces, vérifiées par code.
- Le bruit est maintenant chiffré : un écart-type de 0,03 à 0,13 sur la moyenne d'une version. Les écarts entre A et B
  du premier essai (-0,083 à -0,500) en étaient parfois proches. Avec 3 répétitions, l'écart-type lui-même est une
  estimation grossière : une décision limite se confirme avec 5 répétitions (`--repetitions 5`).
- Aucune proposition DSPy n'est retenue, comme au premier essai : pour la grille et la clôture, B ne dépasse pas A d'un
  écart-type combiné (+0,093 pour 0,150 ; +0,015 pour 0,087) ; pour la relance, B est en recul sur les trois cas.
  Rien n'a été copié dans `organisation/` ni modifié dans une compétence.
- Le recul de `g1-8.3.3` (indicateur sur un petit groupe, B à 0,00 aux 3 répétitions contre 0,22 pour A) est un signal
  net : B ne réussit aucun critère de ce cas, sur les 3 répétitions.

**Corrections de la base Phoenix.** Les 28 jeux `banc-<département>` ont été rechargés avec les pièces (second passage :
28 inchangés). L'expérience vide du premier passage (identifiant `Experiment:1`, `relance-amiable-b2b-b2c · A · cc17404d`,
0 exécution, vérifiée vide par l'API avant) a été supprimée de `banc-recouvrement` par `DELETE /v1/experiments/<id>` ;
les 4 autres expériences de ce jeu sont intactes.

**Limites et suites possibles (à décider par l'opérateur).** Les gros fichiers (500 lignes de clients, 300 contacts) sont
remplacés par un profil chiffré et un extrait, faute de place dans la fenêtre du modèle local ; le modèle ne peut pas
compter 500 lignes sans outil. Les critères par code vérifient la présence de valeurs, pas leur bon usage : le juge local
et, à la demande, Claude restent nécessaires pour le sens. Pour décider d'une vraie modification d'une compétence :
5 répétitions, puis le juge Claude (Sonnet) sur les versions qui passent la règle.
