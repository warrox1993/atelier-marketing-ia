# Fiche des routes ouvertes aux agents : corps des requêtes

Fichier GÉNÉRÉ par `plugin-atelier/scripts/fiche-routes-agents.ts` à partir des contrats zod ; ne pas le modifier à la main.
Seules les routes en écriture (POST, PATCH, DELETE) y figurent : les lectures (GET) n'ont pas de corps.
Une erreur 400 `entree_invalide` rend le détail champ par champ ; les règles croisées entre champs n'apparaissent pas dans les tableaux.

## POST /taches/:issueId/couverture

Clé : `tache.couverture`. Le producteur déclare la couverture de chaque exigence pour une révision, avec preuves localisables.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `revisionId` | uuid | oui |  |
| `lignes` | tableau d'objets | oui | 1 à 200 éléments |
| `lignes[].code` | texte | oui | motif `^REQ-\d{3,}$` |
| `lignes[].etat` | énumération | oui | "non_traite" \| "partiel" \| "couvert" \| "bloque" \| "na_justifie" |
| `lignes[].preuves` | tableau d'objets | non | 0 à 100 éléments |
| `lignes[].preuves[].revisionId` | uuid | oui |  |
| `lignes[].preuves[].emplacement` | texte | oui | 1 à 300 caractères |
| `lignes[].preuves[].element` | texte | non | 1 à 200 caractères ; peut valoir null |
| `lignes[].preuves[].extrait` | texte | oui | 1 à 1000 caractères |
| `lignes[].preuves[].sourceIds` | tableau de uuid | non | 0 à 20 éléments |
| `lignes[].hypotheses` | tableau d'objets | non | 0 à 20 éléments |
| `lignes[].hypotheses[].texte` | texte | oui | 1 à 1000 caractères |
| `lignes[].hypotheses[].autoriseePar` | texte | oui | peut valoir null |
| `lignes[].question` | texte | non | 1 à 2000 caractères ; peut valoir null |

Exemple minimal valide :

```json
{"revisionId":"123e4567-e89b-42d3-a456-426614174000","lignes":[{"code":"REQ-001","etat":"non_traite"}]}
```

## POST /taches/:issueId/verdicts

Clé : `tache.verdict`. Un relecteur désigné dépose un verdict structuré (jamais le producteur).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `revisionId` | uuid | oui |  |
| `role` | énumération | oui | "exigences" \| "metier" \| "technique" |
| `verdict` | énumération | oui | "PASS" \| "CHANGES_REQUESTED" \| "BLOCKED_INFORMATION" \| "NOT_APPLICABLE_JUSTIFIED" |
| `exigencesExaminees` | tableau de texte | non | 0 à 200 éléments |
| `preuvesVerifiees` | tableau d'objets | non | 0 à 200 éléments |
| `preuvesVerifiees[].revisionId` | uuid | oui |  |
| `preuvesVerifiees[].emplacement` | texte | oui | 1 à 300 caractères |
| `preuvesVerifiees[].element` | texte | non | 1 à 200 caractères ; peut valoir null |
| `preuvesVerifiees[].extrait` | texte | oui | 1 à 1000 caractères |
| `preuvesVerifiees[].sourceIds` | tableau de uuid | non | 0 à 20 éléments |
| `constats` | tableau d'objets | non | 0 à 100 éléments |
| `constats[].requirementIds` | tableau de texte | non | 0 à 50 éléments |
| `constats[].categorie` | énumération | oui | "exigence_manquante" \| "preuve_absente" \| "affirmation_non_sourcee" \| "offre_non_confirmee" \| "promesse_excessive" \| "lien_defectueux" \| "page_erreur" \| "incoherence_canaux" \| "marque" \| "technique" \| "juridique_a_verifier" \| "autre" |
| `constats[].gravite` | énumération | oui | "critique" \| "majeure" \| "mineure" \| "info" |
| `constats[].emplacement` | texte | oui | 1 à 300 caractères |
| `constats[].description` | texte | oui | 1 à 4000 caractères |
| `constats[].preuve` | texte | oui | 1 à 4000 caractères |
| `constats[].correctionAttendue` | texte | oui | 1 à 4000 caractères |
| `constatsResolus` | tableau de texte | non | 0 à 100 éléments |
| `limites` | tableau de texte | non | 0 à 30 éléments |
| `controlesNonExecutes` | tableau de texte | non | 0 à 30 éléments |
| `justification` | texte | non | 1 à 4000 caractères ; peut valoir null |

Exemple minimal valide :

```json
{"revisionId":"123e4567-e89b-42d3-a456-426614174000","role":"exigences","verdict":"PASS"}
```

## POST /taches/:issueId/porte/evaluer

Clé : `tache.porte.evaluer`. Calcul déterministe de la porte P2 sur la révision courante.

Corps : aucun (rien à envoyer).

## POST /taches/:issueId/messages

Clé : `tache.messages.envoyer`. Envoi d'un message typé rattaché à la tâche.

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `recipient` | objet | oui |  |
| `recipient.type` | énumération | oui | "agent" \| "humain" |
| `recipient.id` | texte | oui | 1 à 200 caractères |
| `contenu` | une des variantes ci-dessous | oui |  |
| `contenu{type=demande_information}` | variante | oui |  |
| `contenu{type=demande_information}.question` | texte | oui | 1 à 8000 caractères |
| `contenu{type=demande_information}.justification` | texte | oui | 1 à 8000 caractères |
| `contenu{type=demande_information}.consequence` | texte | oui | 1 à 8000 caractères |
| `contenu{type=reponse}` | variante | oui |  |
| `contenu{type=reponse}.enReponseA` | uuid | oui |  |
| `contenu{type=reponse}.texte` | texte | oui | 1 à 8000 caractères |
| `contenu{type=contrat_propose}` | variante | oui |  |
| `contenu{type=contrat_propose}.entrees` | tableau de texte | oui | 1 à 30 éléments |
| `contenu{type=contrat_propose}.sorties` | tableau de texte | oui | 1 à 30 éléments |
| `contenu{type=contrat_propose}.exigences` | tableau de texte | non | 0 à 50 éléments |
| `contenu{type=contrat_propose}.echeance` | date ISO | non | peut valoir null |
| `contenu{type=contrat_accepte}` | variante | oui |  |
| `contenu{type=contrat_accepte}.contratMessageId` | uuid | oui |  |
| `contenu{type=contrat_accepte}.remarques` | texte | non | 0 à 2000 caractères ; peut valoir null |
| `contenu{type=dependance_modifiee}` | variante | oui |  |
| `contenu{type=dependance_modifiee}.tacheId` | uuid | oui |  |
| `contenu{type=dependance_modifiee}.changement` | texte | oui | 1 à 8000 caractères |
| `contenu{type=constat_revue}` | variante | oui |  |
| `contenu{type=constat_revue}.findingId` | texte | oui | 1 à 64 caractères |
| `contenu{type=constat_revue}.resume` | texte | oui | 1 à 8000 caractères |
| `contenu{type=correction_demandee}` | variante | oui |  |
| `contenu{type=correction_demandee}.findingIds` | tableau de texte | oui | 1 à 50 éléments |
| `contenu{type=correction_demandee}.texte` | texte | oui | 1 à 8000 caractères |
| `contenu{type=blocage}` | variante | oui |  |
| `contenu{type=blocage}.raison` | texte | oui | 1 à 8000 caractères |
| `contenu{type=blocage}.informationManquante` | texte | oui | 1 à 8000 caractères |
| `contenu{type=decision}` | variante | oui |  |
| `contenu{type=decision}.sujet` | texte | oui | 1 à 8000 caractères |
| `contenu{type=decision}.decision` | texte | oui | 1 à 8000 caractères |
| `contenu{type=decision}.justification` | texte | oui | 1 à 8000 caractères |
| `contenu{type=resultat}` | variante | oui |  |
| `contenu{type=resultat}.resume` | texte | oui | 1 à 8000 caractères |
| `contenu{type=resultat}.revisionId` | uuid | non | peut valoir null |
| `references` | tableau d'objets | non | 0 à 30 éléments |
| `references[].type` | énumération | oui | "revision_document" \| "source" \| "tache" \| "constat" \| "exigence" \| "message" |
| `references[].id` | texte | oui | 1 à 200 caractères |

Exemple minimal valide :

```json
{"recipient":{"type":"agent","id":"exemple"},"contenu":{"type":"demande_information","question":"exemple","justification":"exemple","consequence":"exemple"}}
```

## POST /taches/:issueId/messages/:messageId/etat

Clé : `tache.messages.etat`. Le destinataire marque un message lu, traité ou rejeté.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `etat` | énumération | oui | "lu" \| "traite" \| "rejete" |

Exemple minimal valide :

```json
{"etat":"lu"}
```

## POST /taches/:issueId/sources

Clé : `tache.sources.lire`. Lecture d'une URL publique protégée contre la SSRF ;

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `url` | texte | oui | 1 à 2048 caractères |
| `campagneId` | uuid | non | peut valoir null |

Exemple minimal valide :

```json
{"url":"exemple"}
```

## POST /taches/:issueId/donnees-connexion

Clé : `tache.donnees.deposer`. Dépôt de la réponse brute d'un outil de connexion (passerelle marketing) : le serveur en déduit le mode (démonstration ou réel) et retient ses chiffres pour ...

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

Règle croisée : `reponse` doit contenir `texte` ou `structuredContent` (au moins l'un des deux). `arguments` devient obligatoire en mode réel.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `service` | texte | oui | motif `^[a-z0-9][a-z0-9_-]{0,39}$` |
| `outil` | texte | oui | motif `^[a-z0-9][a-z0-9_]{0,79}$` |
| `reponse` | objet | oui |  |
| `reponse.texte` | texte | non | 1 à ∞ caractères |
| `reponse.structuredContent` | objet libre | non |  |
| `arguments` | objet libre | non |  |
| `compte` | texte | non | 1 à 200 caractères |

Exemple minimal valide :

```json
{"service":"gsc","outil":"gsc_requete_performances","reponse":{"texte":"texte brut de la réponse de l'outil"}}
```

## POST /taches/:issueId/liens/verifier

Clé : `tache.liens.verifier`. Vérification de liens : HTTP 200 ET absence de page d'erreur.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `urls` | tableau de texte | oui | 1 à 50 éléments |

Exemple minimal valide :

```json
{"urls":["exemple"]}
```

## POST /taches/:issueId/diffusions

Clé : `tache.diffusions`. Demande d'action externe : refusée côté serveur sans décision humaine valide sur la révision et la portée.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `revisionId` | uuid | oui |  |
| `action` | énumération | oui | "publier" \| "envoyer" \| "programmer" \| "activer_campagne_payante" \| "modifier_crm" |
| `canal` | texte | oui | 1 à 100 caractères |
| `compte` | texte | non | 1 à 200 caractères ; peut valoir null |
| `audience` | texte | non | 1 à 500 caractères ; peut valoir null |
| `montantCents` | entier | non | 0 à ∞ ; peut valoir null |
| `cleIdempotence` | texte | oui | 8 à 200 caractères |
| `service` | énumération | non | "facebook" \| "instagram" \| "linkedin" \| "crm" \| "pipedrive" \| "odoo" \| "teamleader" |
| `outil` | texte | non | motif `^[a-z][a-z0-9_]{0,63}$` |
| `arguments` | objet libre | non |  |

Exemple minimal valide :

```json
{"revisionId":"123e4567-e89b-42d3-a456-426614174000","action":"publier","canal":"exemple","cleIdempotence":"exemplex"}
```

## POST /taches/:issueId/diffusions/:diffusionId/issue

Clé : `tache.diffusions.issue`. Issue d'une diffusion réelle : réponse brute de l'outil de la passerelle, signature vérifiée, état confirmé ou à réconcilier (v1.5).

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

Règle croisée : `reponse` doit contenir `texte` ou `structuredContent` (au moins l'un des deux).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `reponse` | objet | oui |  |
| `reponse.texte` | texte | non | 1 à ∞ caractères |
| `reponse.structuredContent` | objet libre | non |  |

Exemple minimal valide :

```json
{"reponse":{"texte":"texte brut de la réponse de l'outil"}}
```

## POST /taches/:issueId/appels

Clé : `tache.appels.proposer`. L'agent propose l'appel d'outil EXACT (service, outil, compte, arguments) d'une diffusion réelle ;

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `revisionId` | uuid | oui |  |
| `service` | énumération | oui | "facebook" \| "instagram" \| "linkedin" \| "crm" \| "pipedrive" \| "odoo" \| "teamleader" |
| `outil` | texte | oui | motif `^[a-z][a-z0-9_]{0,63}$` |
| `compte` | texte | oui | 1 à 200 caractères |
| `arguments` | objet libre | oui |  |

Exemple minimal valide :

```json
{"revisionId":"123e4567-e89b-42d3-a456-426614174000","service":"facebook","outil":"exemple","compte":"exemple","arguments":{}}
```

## POST /taches/:issueId/planification

Clé : `tache.planification`. Date de publication PROPOSÉE et canal (calendrier éditorial) ;

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `canal` | texte | oui | 1 à 100 caractères |
| `dateProposee` | date ISO | oui | peut valoir null |

Exemple minimal valide :

```json
{"canal":"exemple","dateProposee":"2026-01-15T09:00:00Z"}
```

## POST /portes

Clé : `portes.creer`. Place une tâche native sous la porte de l'atelier.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `issueId` | uuid | oui |  |
| `campagneId` | uuid | oui |  |
| `cleLivrable` | texte | non | 1 à 64 caractères ; défaut "livrable" |
| `exigencesCiblees` | tableau de texte | oui | 1 à 200 éléments |
| `revuesRequises` | tableau d'objets | oui | 1 à 3 éléments |
| `revuesRequises[].role` | énumération | oui | "exigences" \| "metier" \| "technique" |
| `revuesRequises[].agentId` | uuid | oui |  |
| `maxCycles` | entier | non | 1 à 10 ; défaut 3 |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","issueId":"123e4567-e89b-42d3-a456-426614174000","campagneId":"123e4567-e89b-42d3-a456-426614174000","exigencesCiblees":["REQ-001"],"revuesRequises":[{"role":"exigences","agentId":"123e4567-e89b-42d3-a456-426614174000"}]}
```

## POST /campagnes

Clé : `campagnes.creer`. Crée une campagne (projet natif + tâche de brief).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `projectId` | uuid | oui |  |
| `nom` | texte | oui | 1 à 200 caractères |
| `brief` | texte | oui | 1 à 50000 caractères |
| `objectifs` | tableau de texte | non | 0 à 20 éléments |
| `cible` | texte | non | 0 à 2000 caractères ; peut valoir null |
| `offre` | texte | non | 0 à 2000 caractères ; peut valoir null |
| `canaux` | tableau de texte | non | 0 à 20 éléments |
| `etablissements` | tableau de texte | non | 0 à 100 éléments |
| `zones` | tableau de texte | non | 0 à 100 éléments |
| `plafondPub` | une des variantes ci-dessous | non | peut valoir null |
| `plafondPub{type=montant}` | variante | oui |  |
| `plafondPub{type=montant}.montantCents` | entier | oui | -∞ à 10000000000 |
| `plafondPub{type=aucune_limite}` | variante | oui |  |
| `budgetMaxCents` | entier | non | 0 à ∞ ; peut valoir null |
| `mode` | énumération | non | "demonstration" \| "reel" ; défaut "reel" |
| `coordinateurAgentId` | uuid | non | peut valoir null |
| `issueId` | uuid | non |  |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","projectId":"123e4567-e89b-42d3-a456-426614174000","nom":"exemple","brief":"exemple"}
```

## POST /campagnes/:campagneId/exigences

Clé : `campagnes.exigences`. Enregistre ou corrige les exigences REQ-xxx extraites du brief.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `exigences` | tableau d'objets | oui | 1 à 200 éléments |
| `exigences[].code` | texte | oui | motif `^REQ-\d{3,}$` |
| `exigences[].texteOriginal` | texte | oui | 1 à 4000 caractères |
| `exigences[].interpretation` | texte | oui | 1 à 4000 caractères |
| `exigences[].obligatoire` | booléen | oui |  |
| `exigences[].criteres` | tableau de texte | non | 0 à 30 éléments |
| `exigences[].dependances` | tableau de texte | non | 0 à 30 éléments |
| `exigences[].elementsAttendus` | tableau de texte | non | 0 à 100 éléments |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","exigences":[{"code":"REQ-001","texteOriginal":"exemple","interpretation":"exemple","obligatoire":false}]}
```

## POST /exigences/:exigenceId/exclusion

Clé : `exigences.exclusion`. Un agent DEMANDE l'exclusion ;

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `action` | énumération | oui | "demander" \| "autoriser" \| "refuser" |
| `justification` | texte | oui | 10 à 2000 caractères |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","action":"demander","justification":"exemplexxx"}
```

## POST /imports

Clé : `imports.creer`. Import contrôlé texte, Markdown ou CSV.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `campagneId` | uuid | non | peut valoir null |
| `nomFichier` | texte | oui | 1 à 200 caractères ; motif `^[^/\\\0]+$` |
| `type` | énumération | oui | "texte" \| "markdown" \| "csv" |
| `contenu` | texte | oui | 0 à 524288 caractères |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","nomFichier":"REQ-001","type":"texte","contenu":"exemple"}
```

## POST /taches/:issueId/prospects

Clé : `tache.prospects.deposer`. Dépôt de la réponse brute et signée d'un outil bce, bnb, fsma, osm ou b2c ;

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

Règle croisée : `reponse` doit contenir `texte` ou `structuredContent` (au moins l'un des deux).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `service` | énumération | oui | "bce" \| "bnb" \| "fsma" \| "osm" \| "b2c" |
| `outil` | texte | oui | motif `^[a-z0-9][a-z0-9_]{0,79}$` |
| `reponse` | objet | oui |  |
| `reponse.texte` | texte | non | 1 à ∞ caractères |
| `reponse.structuredContent` | objet libre | non |  |
| `arguments` | objet libre | non |  |
| `compte` | texte | non | 1 à 200 caractères |

Exemple minimal valide :

```json
{"service":"bce","outil":"bce_entreprise","reponse":{"texte":"texte brut de la réponse de l'outil"}}
```

## POST /prospects/:prospectId/exclusion

Clé : `prospects.exclure`. Exclusion d'un prospect avec un motif connu, journalisée.

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `prospectId` | uuid | oui |  |
| `motif` | énumération | oui | "doublon" \| "numero_bce_invalide" \| "entreprise_inactive" \| "personne_physique_bce" \| "hors_zone" \| "courriel_invalide" \| "courriel_nominatif_sans_consentement" \| "telephone_invalide" \| "opposition_client" \| "liste_dncm" \| "client_actuel" \| "donnee_demonstration_campagne_reelle" |
| `detail` | texte | oui | 3 à 500 caractères |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","prospectId":"123e4567-e89b-42d3-a456-426614174000","motif":"doublon","detail":"exemple"}
```

## POST /taches/:issueId/prospects/exports

Clé : `tache.prospects.exporter`. Demande d'export de prospects vers le CRM du client pour un canal : base légale vérifiée par prospect, puis diffusion réelle sous preuve d'approbation.

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `prospectIds` | tableau de uuid | oui | 1 à 200 éléments |
| `canal` | énumération | oui | "courriel" \| "sms" \| "telephone" \| "courrier" |
| `service` | énumération | oui | "crm" \| "pipedrive" \| "odoo" \| "teamleader" |
| `entite` | texte | oui | motif `^[a-z0-9][a-z0-9-]{1,39}$` |
| `cleIdempotence` | texte | oui | 8 à 200 caractères |

Exemple minimal valide :

```json
{"prospectIds":["123e4567-e89b-42d3-a456-426614174000"],"canal":"courriel","service":"crm","entite":"exemple","cleIdempotence":"exemplex"}
```

## POST /taches/:issueId/connaissances/recherche

Clé : `tache.connaissances.rechercher`. Recherche hybride (plein texte et sens) dans les documents de l'entreprise de la tâche ;

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `question` | texte | oui | 3 à 1000 caractères |
| `filtres` | objet | non |  |
| `filtres.types` | tableau de énumération | non | 0 à 11 éléments |
| `filtres.produits` | tableau de texte | non | 0 à 20 éléments |
| `filtres.langues` | tableau de énumération | non | 0 à 2 éléments |
| `filtres.documentIds` | tableau de uuid | non | 0 à 50 éléments |
| `filtres.dateReference` | texte | non |  |
| `filtres.inclurePerimes` | booléen | non | défaut false |
| `nombre` | entier | non | 1 à 20 ; défaut 8 |

Exemple minimal valide :

```json
{"question":"exemple"}
```

## POST /taches/:issueId/plan/controle

Clé : `tache.plan.controler`. Contrôle le document `plan` de la tâche contre la fiche du client et ses connaissances : identifiant FSMA ou BCE incohérent, marque déclarée mais niée, « auc...

Corps : aucun (rien à envoyer).

## POST /prospects/:prospectId/criteres/:code/evaluation

Clé : `prospects.critere.evaluer`. Évaluation d'un critère personnalisé d'un lead par l'agent Prospection (verifie, contraire ou non_verifie), avec justification et sources ;

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

Règle croisée : Un statut `verifie` ou `contraire` exige au moins une source ; `non_verifie` accepte une liste vide.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `statut` | énumération | oui | "verifie" \| "non_verifie" \| "contraire" |
| `justification` | texte | oui | 3 à 500 caractères |
| `sources` | tableau de texte | oui | 0 à 10 éléments |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","statut":"verifie","justification":"Page officielle consultée","sources":["https://exemple.be/page"]}
```

## POST /experiences

Clé : `experiences.creer`. Ouvre une expérience A/B (hypothèse, métrique de type taux, 2 à 4 variantes dont la première est la référence, essais minimaux par variante, durée maximale, ...

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

Règle croisée : `variantes` : 2 à 4, la première est la référence ; `alpha` vaut 0,05 par défaut. Tu dois être l'assigné de la tâche `issueId`.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `issueId` | uuid | oui |  |
| `campagneId` | uuid | non | peut valoir null |
| `hypothese` | texte | oui | 1 à 600 caractères |
| `metrique` | texte | oui | 1 à 120 caractères |
| `variantes` | tableau d'objets | oui | 2 à 4 éléments |
| `variantes[].nom` | texte | oui | 1 à 80 caractères ; motif `^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]*$` |
| `variantes[].description` | texte | oui | 1 à 500 caractères |
| `conditionArret` | objet | oui |  |
| `conditionArret.essaisMinParVariante` | entier | oui | 1 à 1000000000 |
| `conditionArret.dureeMaxJours` | entier | oui | 1 à 365 |
| `alpha` | nombre | non | -∞ à 0.1 ; défaut 0.05 |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","issueId":"123e4567-e89b-42d3-a456-426614174001","hypothese":"Un objet plus court augmente le taux de réponse","metrique":"taux de réponse","variantes":[{"nom":"Actuel","description":"Objet habituel"},{"nom":"Court","description":"Objet de moins de 40 caractères"}],"conditionArret":{"essaisMinParVariante":200,"dureeMaxJours":30}}
```

## POST /experiences/resultats

Clé : `experiences.resultats`. Dépose les résultats (essais et succès) d'une ou plusieurs variantes d'une expérience en cours.

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

Règle croisée : Un agent cite des chiffres d'une réponse signée déjà déposée (`sourceId` et `chemin` tels que listés dans les chiffres retenus de la source) et ne saisit JAMAIS de nombres ; seul un humain saisit `{variante, essais, succes}`. Ne pas mélanger les deux formes pour une variante.

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `experienceId` | uuid | oui |  |
| `resultats` | tableau d'objets | oui | 1 à 4 éléments |
| `resultats[]` | une des variantes ci-dessous | oui |  |
| `resultats[]{variante}` | objet | oui |  |
| `resultats[]{variante}.variante` | texte | oui | 1 à 80 caractères ; motif `^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]*$` |
| `resultats[]{variante}.essais` | entier | oui | 0 à ∞ |
| `resultats[]{variante}.succes` | entier | oui | 0 à ∞ |
| `resultats[]{variante}` | objet | oui |  |
| `resultats[]{variante}.variante` | texte | oui | 1 à 80 caractères ; motif `^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]*$` |
| `resultats[]{variante}.essais` | objet | oui |  |
| `resultats[]{variante}.essais.sourceId` | uuid | oui |  |
| `resultats[]{variante}.essais.chemin` | texte | oui | 1 à 300 caractères |
| `resultats[]{variante}.succes` | objet | oui |  |
| `resultats[]{variante}.succes.sourceId` | uuid | oui |  |
| `resultats[]{variante}.succes.chemin` | texte | oui | 1 à 300 caractères |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","experienceId":"123e4567-e89b-42d3-a456-426614174002","resultats":[{"variante":"Actuel","essais":{"sourceId":"123e4567-e89b-42d3-a456-426614174003","chemin":"envois"},"succes":{"sourceId":"123e4567-e89b-42d3-a456-426614174003","chemin":"reponses"}}]}
```

## POST /experiences/cloturer

Clé : `experiences.cloturer`. Clôt l'expérience : le serveur calcule et fige le verdict (test z de deux proportions, Bonferroni au-delà de deux variantes, intervalle de confiance à 95 % d...

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `experienceId` | uuid | oui |  |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","experienceId":"123e4567-e89b-42d3-a456-426614174000"}
```

## POST /emailing/demander-envoi

Clé : `emailing.demander_envoi`. Demande l'envoi d'une campagne e-mail : le PLUGIN crée lui-même, sur la tâche issueId, la carte request_confirmation (texte construit côté serveur, jamais ré...

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `issueId` | uuid | oui |  |
| `campagneId` | entier | oui | 1 à ∞ |
| `empreinte` | texte | oui | motif `^[0-9a-f]{64}$` |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","issueId":"123e4567-e89b-42d3-a456-426614174001","campagneId":12,"empreinte":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}
```

## POST /emailing/envoyer

Clé : `emailing.envoyer`. Envoie une campagne e-mail (brouillon créé par l'outil creer_campagne_brouillon de la passerelle) SEULEMENT si la carte créée par le plugin via emailing.dema...

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `companyId` | uuid | oui |  |
| `issueId` | uuid | oui |  |
| `campagneId` | entier | oui | 1 à ∞ |
| `empreinte` | texte | oui | motif `^[0-9a-f]{64}$` |

Exemple minimal valide :

```json
{"companyId":"123e4567-e89b-42d3-a456-426614174000","issueId":"123e4567-e89b-42d3-a456-426614174001","campagneId":12,"empreinte":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}
```

## POST /taches/:issueId/liaisons

Clé : `liaison.demander`. Demande d'un service à un autre par le bureau de liaison : tâche d'origine = celle du chemin (corps {tacheOrigineId, serviceCible, objet, question, extraits}).

Aucun champ en plus de ceux listés (les champs inconnus sont refusés).

| Champ | Type | Obligatoire | Bornes |
| --- | --- | --- | --- |
| `tacheOrigineId` | uuid | oui |  |
| `serviceCible` | texte | oui | motif `^[a-z][a-z0-9-]{1,39}$` |
| `objet` | texte | oui | 1 à 200 caractères |
| `question` | texte | oui | 1 à 4000 caractères |
| `extraits` | tableau d'objets | non | 0 à 10 éléments |
| `extraits[].titre` | texte | oui | 1 à 200 caractères |
| `extraits[].texte` | texte | oui | 1 à 4000 caractères |

Exemple minimal valide :

```json
{"tacheOrigineId":"123e4567-e89b-42d3-a456-426614174000","serviceCible":"exemple","objet":"exemple","question":"exemple"}
```
