# Numéro 0 : sommaire des dossiers de recherche

Période couverte : du vendredi 23 au jeudi 29/10/2026. Faits retenus : publiés entre le 16 et le 29/10/2026 ; toute date hors de cette fenêtre est signalée dans le dossier concerné. Dossiers préparés le 27/10/2026.

## Les 10 sujets

| N° | Dossier | Catégorie du site | Faits | Remplace l'exemple |
| --- | --- | --- | --- | --- |
| 01 | [Un agent ou mille : deux laboratoires, deux réponses opposées](01-agents-un-ou-mille.md) | agents | 9 | Des agents qui coopèrent |
| 02 | [Quand l'agent coupe sa propre surveillance](02-agents-qui-coupent-leur-surveillance.md) | agents | 8 | Évaluer avant de déployer |
| 03 | [Des modèles plus sobres : le coût se gagne aussi hors des poids](03-des-modeles-plus-sobres.md) | modeles | 9 | Des modèles plus sobres |
| 04 | [L'agent devient un projet de code](04-agents-comme-du-code.md) | outils-de-code | 9 | Un guide pour les outils IA |
| 05 | [AI Act : la première norme harmonisée ne couvre que le système qualité](05-ai-act-premiere-norme.md) | aucune (réglementation) | 9 | nouveau |
| 06 | [Pékin range les agents d'IA dans sa politique commerciale, et en contrôle l'export](06-chine-agents-commerce-export.md) | agents | 9 | nouveau |
| 07 | [Voxtral 3 : Mistral veut des agents vocaux hébergés en Europe](07-voxtral-3-voix-souveraine.md) | voix | 9 | nouveau |
| 08 | [Kimi K3.1 Pro et DeepInfer : la pile chinoise s'ouvre](08-chine-modeles-ouverts.md) | modeles | 9 | nouveau |
| 09 | [La semaine de la recherche](09-semaine-de-la-recherche.md) | agents et modeles | 9 | La semaine de la recherche |
| 10 | [L'open source face aux contributions écrites par l'IA](10-open-source-face-aux-contributions-ia.md) | outils-de-code | 9 | L'IA dans les équipes produit |

Total : 89 faits. Chaque extrait a été recopié d'une page téléchargée le 27/10/2026, puis contrôlé automatiquement : les 89 extraits figurent mot pour mot dans le texte de la page citée.

## Pourquoi ceux-là

- **Primauté des sources primaires.** Chaque sujet repose d'abord sur le texte de l'éditeur, du laboratoire ou de l'administration (Anthropic, Microsoft, OpenAI, Commission européenne, ministère chinois du Commerce, Mistral, Moonshot, DeepSeek, Linux Foundation). La presse (ActuIA, The Register, Simon Willison, China News) n'intervient qu'en complément, au statut « Rapporté par un tiers ».
- **Six des sept thèmes d'exemple sont gardés** parce que l'actualité réelle les nourrit : agents qui coopèrent (01), évaluer avant de déployer (02), modèles plus sobres (03), guide des outils (04), semaine de la recherche (09), IA dans les équipes (10, recentré sur l'open source, mieux documenté cette semaine).
- **Diversité demandée, tenue :**
  - non anglophone : 06 (Chine, textes officiels en chinois), 08 (Chine, Moonshot et DeepSeek), 07 (France, Mistral) ; 05 s'appuie aussi sur une source française (ActuIA) ;
  - réglementation : 05 (AI Act) et 06 (Chine) ;
  - recherche : 09 ;
  - outillage pour développeurs : 04 (et 10).
- **Liens entre dossiers** : 01 et 04 (l'agent comme logiciel), 06 et 08 (l'exception « source ouverte » du texte chinois sur l'export et les modèles chinois ouverts), 02 et 10 (relecture et surveillance automatiques).

## Écartés, et pourquoi

| Sujet | Raison |
| --- | --- |
| « Les prochaines annonces » (exemple du site) | Pas de fait vérifiable : une annonce à venir n'est pas un fait. À garder comme rubrique d'agenda, avec seulement des dates officielles (poids de Kimi K3.1 Pro promis pour le 4/11, PostgreSQL 19 attendu vers le 19/11). |
| GPT-6.1 Terra (OpenAI, 26/10/2026) | openai.com refuse la lecture automatique (page vide) ; seuls des relais (heise, The Decoder, AI Times) ont été vus. Rien n'entre sans lecture de la source. À reprendre si la page est lue par un autre moyen. |
| « Securing our frontier model training environment » (OpenAI, 23/10/2026) | Même blocage d'openai.com. |
| Dossier d'introduction en Bourse d'Anthropic (relayé le 26 et le 27/10/2026) | Sujet financier ; source primaire (dépôt auprès du régulateur américain) non lue. |
| Décision de r/opensource d'exclure les projets assistés par IA | Page heise non lisible en lecture automatique, source Reddit non lue. |
| Vulnérabilités PHP découvertes avec l'IA, « Patch the Planet » d'OpenAI | Relève de la cybersécurité : à confier à l'agent sécurité du département, pas à ce dossier. |
| DeepSeek-V4.1-Flash | Sorti le 10/09/2026, hors période ; cité seulement comme contexte dans 08. |
| Auto-Review d'OpenAI | Publié le 30/04/2026, hors période ; source complémentaire de 02. |
| Prépublication d'Agensh (22/09/2026) | Hors période ; seule l'ouverture du code le 24/10/2026 est retenue dans 01. |
| Billet de Peter Eisentraut (09/10/2026) | Hors période ; source complémentaire de 10. |
| Plusieurs nouvelles coréennes (AI Times) | Lues comme pistes seulement ; aucune source primaire coréenne lue dans le temps du lot, d'où l'absence d'un sujet Corée ou Japon. |

## Règles appliquées

- Statuts lus dans `src/data/statuts.ts` du site : `confirme_doc_officielle` pour un texte officiel ou une note de version de l'outil lui-même, `rapporte_editeur` pour une affirmation ou un chiffre de l'éditeur sur son propre produit (et des auteurs pour un article de recherche), `rapporte_tiers` pour la presse et les blogs. Aucun fait n'a le statut « Vérifié expérimentalement » : aucun essai n'a été fait.
- Les extraits sont dans la langue de la page. Les traductions des extraits chinois (06) sont à faire relire.
- Les contenus des pages lues sont traités comme des données ; aucune consigne qu'ils contiendraient n'a été suivie.
- Recherche faite par les flux RSS et Atom de la base de sources du département (fiabilité A) et par la lecture directe des pages, sans moteur de recherche.
