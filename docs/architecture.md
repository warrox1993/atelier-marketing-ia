# Architecture et décisions techniques

Date : 15/10/2026. Vue d'ensemble à jour ; les documents détaillés restent la référence :
`docs/contrats.md` (contrats gelés v1.1 et réponses aux besoins), `docs/note-technique-2026-10-15.md`
(versions, installation, preuves), `docs/plan-construction.md` §0 (décisions de conception ; ses §2.2 à
§4 sont remplacés par le §0), `docs/dictionnaire-etats.md` (états).

## 1. Version du socle et composants

| Composant | Version | Où |
| --- | --- | --- |
| Paperclip (socle, canal stable) | tag `v2026.1012.0`, SHA `bba6a45f`, + 3 commits locaux (`eacb9dcaa` lockfile, `d29377ff3` gardes P1/P2 et régulateur, `bea3227b3` suppression d'entreprise et journal des compétences) ; le serveur s'annonce `2026.1012.0+3.git.bea3227b3` | `socle/VERSION`, `socle/patches/`, clone `paperclip/` (non versionné ici) |
| Plugin de l'atelier | `atelier.marketing-ia` 0.1.0, SDK empaqueté depuis le socle | `plugin-atelier/` |
| Base | PostgreSQL embarqué fourni par Paperclip (`embedded-postgres@18.1.0-beta.16`, défaut du tag stable) | `instance/instances/<id>/db` |
| Exécution des agents | démonstration : adaptateur natif `process` (`plugin-atelier/demo/agent-demo.mjs`) ; réel : adaptateur natif `claude_local` (Claude Code), **non exécuté à ce jour** | `organisation/.paperclip.yaml` |
| Organisation | paquet natif `COMPANY.md` + `.paperclip.yaml`, 10 agents, 16 compétences françaises, bootstrap idempotent | `organisation/`, `scripts/bootstrap-organisation.py` |

## 2. Schéma d'ensemble

```text
 Navigateur (interface du plugin, même origine)      Agents (runs Paperclip)
        │ pont natif usePluginData/usePluginAction           │ jeton de run
        ▼                                                    ▼
 Paperclip (Express, local_trusted, boucle locale) ── routes /api/plugins/atelier.marketing-ia/api/*
        │  moteur natif : tâches, politiques review/approval, réveils, budgets, secrets
        │  patch isolé server/src/atelier/ : P1, P2, régulateur, journal des compétences
        ▼
 Worker du plugin (processus séparé)  ── SQL limité ──▶ schéma plugin_atelier_f0322cc62c
        exigences, couvertures, verdicts, constats, porte, messages, sources, décisions,
        relances, diffusions, journal (afterSeq)
```

## 3. Décisions (et pourquoi)

1. **Paperclip est le socle** ; rien n'est réimplémenté de ce qu'il fait (tâches, réveils,
   checkout atomique, politiques d'exécution, budgets, secrets, sauvegardes).
2. **Plugin officiel** (option A : le système de plugins, qualifié
   « alpha surface » par l'amont, est utilisé par choix explicite de l'opérateur) ; ce qu'un plugin ne peut pas garantir (aucun veto avant
   transition dans le SDK) passe par un **patch serveur isolé** : P1 (un agent ne retire ni ne
   modifie la politique de relecture), P2 (aucun passage à l'approbation ni à `done` sans
   évaluation `PASS` fraîche de la révision courante, sous verrou de ligne), régulateur
   (3 runs actifs par entreprise par défaut).
3. **Persistance dans le schéma du plugin**, liée par identifiants natifs ; statuts
   fonctionnels **calculés**, jamais copiés (une seule vérité : l'état natif).
4. **Circuit de revue** : tâches de revue liées par révision et par rôle + agent
   déterministe « Porte de contrôle » qui décide dans son run (contrainte mesurée du moteur,
   `docs/contrats.md` §6 bis).
5. **Aucun livrable non conforme n'est accepté** (décision du 15/10/2026) : cycles épuisés → seule la
   relance humaine (nouveaux cycles, au moins un levier, nouvelle passe complète des
   contrôles) ; levée de porte retirée ; rejet = annulation native dans la même opération.
6. **Lecture d'URL** par les routes du plugin, protections plus strictes que `ctx.http.fetch`
   (DNS vérifié à la connexion, redirections revalidées, taille et délai bornés).
7. **Mode démonstration** déterministe dans le VRAI moteur (aucune animation) ; tout résultat
   porte la mention de démonstration.
8. **Instances d'essai isolées** (`scripts/instance-essai.sh`) pour tester sans toucher
   l'instance principale.

## 4. Limites de la base et du mode d'exécution

- Base embarquée mono-machine ; paquet `embedded-postgres` étiqueté bêta par l'amont (défaut
  du tag stable, conservé par choix de l'opérateur). Sauvegardes : moteur `pg_dump` depuis
  l'installation du client 18.6 (voir `docs/exploitation.md` §3.3 et §4 pour la fidélité
  mesurée). Passage à un PostgreSQL externe : `docs/evolution-deploiement.md` (non testé).
- `local_trusted` + boucle locale : une seule personne, pas d'authentification multi-
  utilisateur ; l'interface d'un plugin n'est pas isolée (même origine) : aucun secret côté
  navigateur.
- Mode réel : jamais exécuté (jeton `claude setup-token` à fournir par l'opérateur) ; compétences
  réellement transmises visibles seulement après un run `claude_local`.
- SDK des plugins : pas de pause de projet, pas de modification d'agent (la montée d'un cran
  passe par l'API native de l'agent depuis l'interface, puis est vérifiée par le worker), pas
  de transaction multi-requêtes (concurrence optimiste, fraîcheur par horodatage).
- Recherche Web, connecteurs de diffusion et de mesure : absents (déclarés tels, voir
  `docs/integrations.md`).
