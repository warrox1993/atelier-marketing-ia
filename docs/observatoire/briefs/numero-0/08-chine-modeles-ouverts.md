# 08. Kimi K3.1 Pro et DeepInfer : la pile chinoise s'ouvre jusqu'au moteur d'inférence

**Catégorie du site** : `modeles` (IA.1).
**Sujet non anglophone (Chine).**

## Angle

Moonshot AI lance Kimi K3.1 Pro, annoncé comme modèle à poids ouverts de la classe 3 000 milliards de paramètres, avec des poids promis pour le 4 novembre. DeepSeek publie DeepInfer, le moteur d'inférence de ses services de production. Pour un développeur, cela veut dire de nouveaux modèles et de nouveaux outils à auto-héberger. Pour un décideur, cela s'ajoute au texte chinois sur l'export (dossier 06), qui exclut ce qui est déjà publié en source ouverte.

## Public visé

Développeurs qui auto-hébergent des modèles ; responsables techniques qui comparent fournisseurs fermés et ouverts.

## Faits sourcés

| Fait | URL | Date | Extrait exact | Statut |
| --- | --- | --- | --- | --- |
| Moonshot présente Kimi K3.1 Pro comme son modèle ouvert le plus capable, avec un million de jetons de contexte | https://www.kimi.ai/blog/kimi-k3-1-pro | 24/10/2026 (métadonnées de la page ; annonce relayée le 23/10/2026) | our most capable 3T-class open-weight model to date, with a 1-million-token context window | rapporte_editeur |
| Les poids complets seront publiés au plus tard le 4/11 | https://www.kimi.ai/blog/kimi-k3-1-pro | 24/10/2026 | The full model weights will be released by Nov 4. | rapporte_editeur |
| Sur Terminal-Bench 4.0, 65,7 % selon Moonshot, juste derrière Claude Opus 5.5 (66,4 %) | https://www.kimi.ai/blog/kimi-k3-1-pro | 24/10/2026 | K3.1 Pro scores 65.7%, ahead of GPT-6 Astra (58.2%) and narrowly behind Claude Opus 5.5 (66.4%) | rapporte_editeur |
| Taux d'hallucination interne passé de 23,4 % à 8,3 % selon Moonshot | https://www.kimi.ai/blog/kimi-k3-1-pro | 24/10/2026 | hallucination rate fell from 23.4% for K3 to 8.3% | rapporte_editeur |
| Simon Willison note que le modèle n'est pas encore à poids ouverts le jour du lancement | https://simonwillison.net/2026/Oct/23/kimi-k31-pro/ | 23/10/2026 | it's not yet open weights, but Moonshot promise | rapporte_tiers |
| Prix relevé : 2 dollars par million de jetons en entrée, 10 en sortie | https://simonwillison.net/2026/Oct/23/kimi-k31-pro/ | 23/10/2026 | The US dollar pricing is $2.00/million tokens for input and $10/million for output | rapporte_tiers |
| DeepSeek publie DeepInfer, le moteur qui sert ses propres services de production | https://github.com/deepseek-ai/DeepInfer | 20/10/2026 (premières entrées du flux des commits) | DeepInfer is the high-performance inference framework that powers DeepSeek's large-scale production services. | confirme_doc_officielle |
| Matériel pris en charge : GPU NVIDIA SM100 et NPU Huawei Ascend 950 | https://github.com/deepseek-ai/DeepInfer | 20/10/2026 | Huawei Ascend 950 NPUs | confirme_doc_officielle |
| La publication est partielle : pas de système de cache KV dans cette version | https://github.com/deepseek-ai/DeepInfer | 20/10/2026 | Required for a complete inference service (not included in this release) | confirme_doc_officielle |

## Questions ouvertes

- Les poids de Kimi K3.1 Pro ne sont pas publiés au 27/10 : le statut « ouvert » reste une promesse jusqu'au 4/11. Licence inconnue.
- Tous les bancs d'essai de Kimi sont ceux de Moonshot.
- DeepInfer ne prend en charge que DeepSeek-V4.1-Flash, modèle sorti le 10/09/2026 (hors période).
- Date de mise en ligne du dépôt DeepInfer : déduite du flux des commits (premier lot le 20/10/2026), pas d'annonce datée lue.

## Sources complémentaires à lire

- https://artificialanalysis.ai/models/kimi-k3-1-pro (évaluation tierce citée par Simon Willison, non lue)
- https://vllm.ai/blog/2026-10-23-deepseek-v41-flash-pd-wide-ep (service de DeepSeek-V4.1-Flash par vLLM, 23/10/2026)
- https://www.actuia.com/actualite/deepseek-publie-le-moteur-dinference-quil-avait-renonce-a-ouvrir-en-2025/ (traitement français, 21/10/2026)
- https://www.heise.de/news/KI-Update-kompakt-Nvidia-GTC-KI-Agenten-Kimi-K3-1-Pro-Perplexity-Computer-11499987.html (résumé allemand, 26/10/2026, non lu)

## Plan proposé

1. Une semaine chinoise : un modèle, un moteur.
2. Kimi K3.1 Pro : ce qui est annoncé, ce qui est disponible.
3. Lire les bancs d'essai d'un éditeur.
4. DeepInfer : ce que DeepSeek ouvre, et ce qu'il garde.
5. Matériel : NVIDIA et Huawei Ascend dans le même dépôt.
6. Le lien avec la règle chinoise sur l'export (dossier 06).
