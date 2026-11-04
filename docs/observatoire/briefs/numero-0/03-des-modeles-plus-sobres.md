# 03. Des modèles plus sobres : le coût se gagne aussi hors des poids

**Catégorie du site** : `modeles` (IA.1), sous-rubrique IA.1.1 Modèles de langage.
**Remplace l'exemple** : « Des modèles plus sobres ».

## Angle

Quatre publications de la semaine réduisent le coût d'inférence par des leviers différents : le vocabulaire du modèle, les noyaux de calcul quantifiés, un petit modèle de 4 Go pour l'appareil, et l'exécution locale sur Mac. Pour un développeur, c'est une boîte à outils concrète avant de payer un plus gros modèle. Pour un décideur, ces chiffres viennent presque tous des éditeurs eux-mêmes : à lire comme des promesses mesurées chez eux.

## Public visé

Développeurs qui servent des modèles en production ou en local ; responsables de budget d'infrastructure.

## Faits sourcés

| Fait | URL | Date | Extrait exact | Statut |
| --- | --- | --- | --- | --- |
| Spécialiser le vocabulaire d'un petit modèle a réduit le coût d'inférence mesuré de 77 % | https://huggingface.co/blog/Dharma-AI/vocabx-vocabulary-specialization | 21/10/2026 | cut measured inference cost by 77% without changing the base model | rapporte_editeur |
| Le modèle de départ : 4 milliards de paramètres, tokeniseur d'origine de Qwen3-4B, utilisé en portugais seulement | https://huggingface.co/blog/Dharma-AI/vocabx-vocabulary-specialization | 21/10/2026 | Its tokenizer, however, was still the original Qwen3-4B one | rapporte_editeur |
| Les chiffres viennent d'un article encore en relecture et peuvent changer | https://huggingface.co/blog/Dharma-AI/vocabx-vocabulary-specialization | 21/10/2026 | still under review, and may change before publication | rapporte_editeur |
| La matrice de sortie (LM head) pèse près de 10 % des paramètres d'un modèle de la taille de Qwen3-4B | https://huggingface.co/blog/Dharma-AI/vocabx-vocabulary-specialization | 21/10/2026 | that matrix accounts for almost 10% of the parameters | rapporte_editeur |
| vLLM présente Humming, des noyaux pour l'inférence quantifiée ; compilation d'un noyau W4A16 ramenée de 23,35 s à 1,82 s | https://vllm.ai/blog/2026-10-21-humming | 21/10/2026 | compilation time dropped from 23.35 seconds for CUTLASS with NVCC to 1.82 seconds for Humming | rapporte_editeur |
| Sur DeepSeek-V4.1-Flash, passer de W4A16 à W4A8 améliore le débit de bout en bout de 14 à 43 % environ | https://vllm.ai/blog/2026-10-21-humming | 21/10/2026 | improves end-to-end throughput by approximately 14%–43% | rapporte_editeur |
| NVIDIA publie Nemotron-3.5-Bolt-E4B-4GB, petit modèle post-entraîné à partir de Gemma-4-E4B | https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB | 23/10/2026 | is a small language model (SLM) further post-trained from Gemma-4-E4B-it by NVIDIA | confirme_doc_officielle |
| Date de mise en ligne indiquée sur la fiche : 23/10/2026 sur Hugging Face | https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB | 23/10/2026 | Hugging Face 10/23/2026 via | confirme_doc_officielle |
| AnyLanguageModel 1.0 pour les plateformes Apple : Gemma 4 E2B tient en 3,4 Go environ | https://huggingface.co/blog/anylanguagemodel-1-0 | 20/10/2026 | in GGUF, about 3.4 GB at Q4_0 with quantization-aware training | rapporte_editeur |

## Questions ouvertes

- VocabX : l'article scientifique annoncé n'est pas paru ; la méthode n'est donc pas vérifiable à ce jour.
- La fiche Nemotron affiche « 8B (4B effective) » : à expliquer au lecteur (paramètres totaux contre effectifs) après lecture de la carte complète.
- Aucune de ces mesures n'est indépendante. Un essai par l'ingénieur d'essais du département serait nécessaire pour le statut « vérifié expérimentalement ».
- La licence `openmdw-1.1` de Nemotron Bolt n'a pas été lue.

## Sources complémentaires à lire

- https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB (carte complète : bancs d'essai, licence)
- https://www.aitimes.com/news/articleView.html?idxno=216625 (traitement coréen, 25/10/2026)
- https://www.heise.de/news/30-Millionen-Parameter-Lokaler-KI-Sprachmodell-fuer-den-ESP32-11492822.html (modèle de 30 millions de paramètres sur ESP32, 19/10/2026, non lu)

## Plan proposé

1. Le coût d'un jeton n'est pas le nombre de jetons.
2. Levier 1 : un vocabulaire taillé pour la tâche (VocabX).
3. Levier 2 : des noyaux quantifiés qui compilent vite (Humming).
4. Levier 3 : un modèle de 4 Go pensé pour l'appareil (Nemotron Bolt).
5. Levier 4 : faire tourner le modèle chez soi (AnyLanguageModel).
6. Ce que valent des chiffres mesurés par leurs auteurs.
