# ADR-006 : moteur des questions, abonnement de l'opérateur seul en V1, API plus tard sur décision

- **Statut** : Accepté (JB, 26/10/2026)
- **Décision de référence** : O1 du plan

## Contexte

La recherche Claude répond à des questions en citant les dossiers. Deux moteurs sont possibles : l'abonnement Max de
JB (0 € en plus, consomme le quota) ou une clé API (payante, plafonnable). Les conditions d'Anthropic, lues le
26/10/2026, limitent l'usage de l'abonnement.

## Décision

1. **V1 privée, JB seul** : `claude -p --output-format json` avec l'abonnement de l'opérateur, tous les outils interdits,
   citations vérifiées par du code. Coût nul en euros, quota consommé.
2. **Interdiction de servir d'autres personnes avec l'abonnement.** Documentation de l'Agent SDK
   (code.claude.com/docs/en/agent-sdk/overview) : « Unless previously approved, Anthropic does not allow third party
   developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent
   SDK. Use the API key authentication methods described in the Quickstart instead. » Conditions grand public
   (anthropic.com/legal/consumer-terms, version du 08/10/2025) : « You may not … make your Account available to
   anyone else ».
3. **Phase publique ou premium** (plus tard, nouvelle décision chiffrée de l'opérateur) : clé API dédiée avec plafond de
   dépense, quotas par utilisateur, questions publiques sur Haiku 5.5 (environ 0,001 $ la question), Sonnet 5.5
   pour le premium. Le gratuit reste la recherche Pagefind sans LLM.
4. Rien de payant sans décision explicite de l'opérateur.

## Options écartées et pourquoi

- **Clé API dès la V1** : payant, inutile tant que l'opérateur est le seul utilisateur.
- **Partager l'accès à l'abonnement avec des invités** : contraire aux conditions citées ci-dessus.
- **Modèle local** : qualité de rédaction et de citation insuffisante pour des réponses sourcées (à réévaluer).

## Conséquences

- Positives : 0 € en plus ; implémentation simple ; la migration vers l'API ne change que le moteur.
- Négatives : concurrence avec l'usage de Claude Code de l'opérateur sur le quota ; plafond de débit de l'abonnement ; le
  jour où un second utilisateur arrive, la V1 doit être arrêtée pour lui. Le moteur est donc une interface
  interchangeable dès la conception.

## Références

- Plan : H.1 à H.4 (H.2 : moteur du modèle), Livrable K (prix), Livrable O (O1), J.2 (sous-traitant Anthropic).
- Voir aussi ADR-007 (RAG) et ADR-010 (FinOps).
