# Voix en direct (lot V1)

Brique vocale autonome pour le futur chat de pilotage (« Discussion avec le Coordinateur »), avec l'API Realtime d'OpenAI (même famille de modèles que le mode vocal de ChatGPT). Non branchée dans une vue pour l'instant.

## Documentation consultée (16/10/2026, via Context7, bibliothèque `/websites/developers_openai_api`)

- Secret client éphémère : https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create (`POST https://api.openai.com/v1/realtime/client_secrets`, réponse `{value, expires_at, session}`).
- Appel WebRTC : https://developers.openai.com/api/docs/guides/realtime-webrtc (offre SDP en `POST https://api.openai.com/v1/realtime/calls`, `Content-Type: application/sdp`, `Authorization: Bearer <secret éphémère>`) et https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create.
- Événements client et serveur : https://developers.openai.com/api/reference/resources/realtime/client-events et https://developers.openai.com/api/reference/resources/realtime/server-events.

Points confirmés : modèle GA `gpt-realtime` ; session de type `realtime` ; voix intégrées alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar (retenue : `marin`) ; transcription d'entrée `gpt-4o-mini-transcribe` en `fr` ; détection de tour `semantic_vad` (avec `interrupt_response`) ; outils `type: "function"` ; fin d'appel d'outil = `response.function_call_arguments.done`, réponse = `conversation.item.create` (`function_call_output`) puis `response.create`.

## Architecture

1. Le navigateur appelle `POST /voix/session` (route `voix.session`, humain seulement).
2. Le plugin lit la clé dans le coffre de secrets (réglage `openaiSecretRef`, type `secret-ref`), crée un secret éphémère de 60 s avec la session déjà réglée (modèle, voix, français, instructions, 4 outils) et renvoie `{clientSecret, expireLe, modele}`.
3. Le navigateur ouvre l'appel WebRTC directement avec OpenAI (micro, canal de données `oai-events`) : l'audio ne passe pas par le plugin.
4. Les outils sont exécutés par le navigateur sur les routes du plugin : `etat_missions` et `taches_bloquees` (`GET /accueil`), `resume_prospects` (`GET /prospects`), `transmettre_au_coordinateur` (`POST /equipe/demande`). Aucune écriture directe par la voix.

## Garanties

- La clé API ne quitte jamais le serveur ; ni réponse, ni journal, ni message d'erreur ne la contiennent. Le journal ne note que `voix.session` (modèle, voix, durée).
- Sans clé : 503 `voix_non_configuree`. OpenAI injoignable ou en panne : 503 `voix_indisponible`.
- Contexte non HTTPS (hors localhost) : message clair, micro non demandé.

## Fichiers

- `plugin-atelier/src/serveur/services-voix.ts` (routes `routesVoix`)
- `plugin-atelier/src/ui/composants/voix-en-direct.tsx` (composant `VoixEnDirect`, `executerOutil`)
- Tests : `tests/voix.spec.ts`, `tests/ui/voix-en-direct.spec.tsx`

## À faire avant usage réel

- Créer la clé OpenAI, la ranger comme secret natif, la lier à `openaiSecretRef`.
- Vérifier en réel que la page de l'hôte autorise `connect-src https://api.openai.com` (politique de sécurité du contenu) : non vérifiable sans clé.
