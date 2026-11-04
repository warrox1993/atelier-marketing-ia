# Matériel de rédaction des 10 articles du département Observatoire

Généré le 27/10/2026 par `construire.py` à partir de `../sujets/*.json`. Rien n'a été écrit sur l'instance 3100.
`companyId` vaut `"<OBS>"` dans chaque `projet` : à remplacer au moment de l'envoi. Le slug du projet suit `article-<numero>-<slug>` (numéro sans zéro initial, exigé par le format des clés d'article).

| N° | Slug | Alias retenus | Alias refusés | Faits | Points ouverts |
| --- | --- | --- | --- | --- | --- |
| 01 | claude-code-2-1-311 | github:anthropics/claude-code, npm:@anthropic-ai/claude-code | aucun | 12 | 2 |
| 02 | serveurs-mcp-reference-2-0 | github:modelcontextprotocol/servers, npm:@modelcontextprotocol/server-filesystem, site:https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/protocol-eras.md, site:https://modelcontextprotocol.io/specification/2026-07-28/changelog.md, site:https://modelcontextprotocol.io/specification/versioning | aucun | 19 | 2 |
| 03 | agent-skills-agentic-ai-foundation | site:https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation, site:https://www.linuxfoundation.org/press/agentic-ai-foundation-announces-four-new-projects-agent-skills-open-responses-openenv-and-opensandbox, site:https://aaif.io/projects/ | aucun | 13 | 1 |
| 04 | cursor-agent-sdk | site:https://cursor.com/changelog/agent-sdk, site:https://cursor.com/docs/agent-sdk, npm:@grok/agent-sdk, site:https://cursor.com/blog/joining-spacex | npm:@cursor/agent-sdk (404) | 18 | 1 |
| 05 | mistral-large-4 | site:https://mistral.ai/news/mistral-large-4/, site:https://docs.mistral.ai/getting-started/models/, site:https://docs.mistral.ai/models/mistral-large-4-0 | aucun | 10 | 2 |
| 06 | gemini-4-argon | site:https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/, site:https://ai.google.dev/gemini-api/docs/pricing, site:https://ai.google.dev/gemini-api/docs/models | aucun | 7 | 2 |
| 07 | reflection-beam-modele-ouvert | site:https://huggingface.co/reflection/Beam-1.0-501B-A23B-FP8, site:https://reflection.ai/blog/beam-is-available, site:https://reflection.ai/blog/introducing-beam | aucun | 18 | 2 |
| 08 | ai-act-norme-en-18286 | site:https://digital-strategy.ec.europa.eu/en/library/first-harmonised-standard-supporting-ai-act-published-official-journal, site:https://www.cencenelec.eu/news-events/news/2026/en-in-the-spotlight/2026-10-15-en-18286-2026-published-in-ojeu/, site:http://publications.europa.eu/resource/cellar/05805dc1-c76c-11f1-a77b-01aa75ed71a1.0006.03/DOC_1, site:http://publications.europa.eu/resource/cellar/b459c07f-86fb-11f1-bf5e-01aa75ed71a1.0006.03/DOC_1, site:https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai | aucun | 23 | 0 |
| 09 | apple-decouverte-outils-agents | site:https://machinelearning.apple.com/research/plan-retrieve-tool-discovery, site:https://arxiv.org/abs/2610.19068 | aucun | 7 | 2 |
| 10 | gpt-6-1-terra | site:https://developers.openai.com/api/docs/models/gpt-6.1-terra, site:https://openai.com/news/rss.xml, site:https://community.openai.com/t/gpt-6-1-terra-delivering-fast-and-capable-computer-use-at-a-lower-price/1409900, site:https://deploymentsafety.openai.com/gpt-6-1-terra | aucun | 10 | 2 |

## Ordre conseillé

Sujets dont tous les alias testés répondent 200 d'abord, puis les autres, par numéro.

1. 01 claude-code-2-1-311
2. 02 serveurs-mcp-reference-2-0
3. 03 agent-skills-agentic-ai-foundation
4. 05 mistral-large-4
5. 06 gemini-4-argon
6. 07 reflection-beam-modele-ouvert
7. 08 ai-act-norme-en-18286
8. 09 apple-decouverte-outils-agents
9. 10 gpt-6-1-terra
10. 04 cursor-agent-sdk (alias refusé : à lever avant publication)

## Points ouverts connus

- 05 : poids de Mistral Large 4 absents de Hugging Face au 27/10.
