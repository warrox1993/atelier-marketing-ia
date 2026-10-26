# ADR-009 : droits de collecte, API officielles d'abord

- **Statut** : Accepté
- **Décision de référence** : J.1 (menace « collecte illicite », K4) et J.2 du plan

## Contexte

Le pipeline collecte des informations publiques (dépôts, registres, articles scientifiques, vidéos). Le cahier
demande de surveiller beaucoup de sources ; la collecte doit rester licite, polie et mesurable, et les publications
ne doivent pas reproduire le contenu d'autrui.

## Décision

1. **API officielles d'abord** (GitHub, registres de paquets, arXiv, YouTube Data API) ; scraping de pages
   seulement en dernier recours et si les conditions du site l'autorisent.
2. **robots.txt respecté**, cadence bornée par source (`obs_sources.politique_collecte`) : arXiv au plus une requête
   toutes les 3 secondes, une connexion ; GitHub dans les limites de son API (5 000 requêtes par heure
   authentifié, recherche 30 par minute).
3. **YouTube : métadonnées seulement.** `captions.download` exige le droit de modifier la vidéo (vérifié le
   26/10/2026) : pas de transcriptions par défaut.
4. **Synthèses originales**, courts extraits cités, liens et attribution systématique ; aucune republication
   intégrale ; images et logos selon leur licence. Les instantanés bruts ne sont jamais republiés.
5. Collecteurs sans LLM : le contenu collecté est une donnée, pas une consigne.
6. RGPD : peu de données personnelles dans le corpus (noms d'auteurs publics) ; minimisation et durées de
   conservation pour comptes, questions et journaux (questions 90 jours proposés).

## Options écartées et pourquoi

- **Scraping généralisé** : risque juridique (conditions d'utilisation) et blocages.
- **Transcriptions YouTube par outil tiers** : droits non vérifiés.
- **Surveiller « tout GitHub »** : impossible et non mesurable ; remplacé par un univers déclaré dont la couverture
  est mesurée (plan I.2).

## Conséquences

- Positives : risque juridique réduit ; collecte stable et reproductible ; couverture honnête.
- Négatives : moindre exhaustivité ; certaines sources inaccessibles faute d'API ; les quotas d'API plafonnent la
  cadence. Les unités exactes de `search.list` (YouTube) restent à relire à la source.

## Références

- Plan : J.1, J.2, I.2 (couverture mesurable), Livrable K (quotas vérifiés le 26/10/2026), F.2 (`obs_sources`).
- Voir aussi ADR-008 (isolement) et ADR-004 (instantanés non republiés).
