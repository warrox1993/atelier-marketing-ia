# 07. Voxtral 3 : Mistral veut des agents vocaux hébergés en Europe

**Catégorie du site** : `voix` (IA.7).
**Sujet non anglophone (France, Europe).**

## Angle

Mistral AI, société française, publie Voxtral 3 : transcription, synthèse vocale et SDK d'agent vocal, servis depuis une API hébergée dans l'Union ou installés chez le client. La même semaine, IBM publie Granite Speech 5.0 sous licence Apache 2.0 et Ollama ajoute la synthèse vocale locale. Pour un développeur, la voix devient une brique comme une autre d'un agent. Pour un décideur, l'argument de Mistral est la maîtrise du lieu où l'audio est traité.

## Public visé

Développeurs d'assistants et de centres de contact ; décideurs attentifs à l'hébergement des données vocales.

## Faits sourcés

| Fait | URL | Date | Extrait exact | Statut |
| --- | --- | --- | --- | --- |
| Voxtral 3 : nouvelle famille de modèles de transcription et de synthèse, plus un SDK d'agent vocal | https://mistral.ai/news/voxtral-3/ | 20/10/2026 (flux RSS de Mistral ; la page porte 22/10/2026 dans ses métadonnées) | a new family of state-of-the-art speech-to-text and text-to-speech models, alongside a voice agent SDK | rapporte_editeur |
| Déploiement par l'API hébergée dans l'Union ou sur l'infrastructure du client | https://mistral.ai/news/voxtral-3/ | 20/10/2026 | Available today through Mistral's EU-hosted API or for self-deployment on your own infrastructure | rapporte_editeur |
| Transcription en 50 langues, dont les 24 langues officielles de l'Union | https://mistral.ai/news/voxtral-3/ | 20/10/2026 | The supported list of languages is expanded to 50, including 24 official EU languages | rapporte_editeur |
| Mistral affirme faire mieux que Whisper, Scribe v2 et Gemini 3.5 Transcribe | https://mistral.ai/news/voxtral-3/ | 20/10/2026 | It outperforms Whisper, Scribe v2 and Gemini 3.5 Transcribe. | rapporte_editeur |
| La variante Mini : 4 milliards de paramètres, 0,0035 dollar la minute | https://mistral.ai/news/voxtral-3/ | 20/10/2026 | The Mini variant is 4B parameters, enabling fast and accurate transcriptions at a price of $0.0035/min. | rapporte_editeur |
| Adaptation de voix « Pro Voice » à partir de 30 minutes d'audio | https://mistral.ai/news/voxtral-3/ | 20/10/2026 | using just 30 minutes of audio | rapporte_editeur |
| IBM Granite Speech 5.0 2B : transcription en six langues dont le français, licence Apache 2.0 | https://huggingface.co/blog/ibm-granite/granite-speech-5 | 21/10/2026 | It transcribes English, French, German, Spanish, Portuguese, and Japanese | rapporte_editeur |
| Granite Speech 5.0 est publié sous Apache 2.0 | https://huggingface.co/blog/ibm-granite/granite-speech-5 | 21/10/2026 | The model ships under Apache 2.0 with support in Transformers, vLLM, llama.cpp, and mlx-audio for Apple Silicon. | confirme_doc_officielle |
| Ollama ajoute la synthèse vocale locale, d'abord sur macOS, avec le modèle Phonon | https://ollama.com/blog/speech-models | 24/10/2026 | Speech models are now available for macOS, with Windows and Linux support coming soon. | confirme_doc_officielle |

## Questions ouvertes

- Licence des poids de Voxtral 3 : non lue sur la page ; à vérifier avant de parler de modèle ouvert.
- La comparaison de Mistral (macro-moyenne du taux d'erreur sur 45 langues de FLEURS) n'est pas indépendante.
- Le clonage de voix (« Pro Voice ») pose des questions de consentement : la page ne détaille pas les garde-fous dans la partie lue.
- Écart de date entre le flux RSS (20/10) et les métadonnées de la page (22/10) : à trancher en citant la date affichée par Mistral.

## Sources complémentaires à lire

- https://docs.mistral.ai (documentation de Voxtral 3, non lue)
- https://huggingface.co/blog/ibm-granite/granite-speech-5 (bancs d'essai détaillés)
- https://ollama.com/blog/speech-models (conditions de licence des modèles Phonon : Apache 2.0 et CC BY-NC 4.0 selon la taille)

## Plan proposé

1. La voix entre dans la boucle de l'agent.
2. Voxtral 3 : trois briques, une API européenne.
3. Ce que veut dire « souverain » ici : lieu de traitement et conservation de l'audio.
4. Les chiffres de Mistral, et comment les relire.
5. Les autres options de la semaine : Granite Speech 5.0, Ollama.
6. Le point sensible : le clonage de voix.
