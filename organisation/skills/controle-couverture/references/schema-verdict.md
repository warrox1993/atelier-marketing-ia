# Dépôt d'un verdict structuré

Le schéma qui fait autorité est celui du moteur de l'atelier :
`DeposerVerdictEntree` dans `plugin-atelier/src/contrats/revues.ts` (contrats gelés, voir
`docs/contrats.md` du dépôt). Cette page en donne la forme pratique.

## Route

`POST /api/plugins/atelier.marketing-ia/api/taches/<issueId>/verdicts`, appelée sous la forme exacte
de la section « Appeler l'API de Paperclip » de tes consignes (en-têtes d'autorisation et de run).
Seul l'agent désigné pour le rôle peut déposer ; le producteur ne le peut jamais.

| contrôleur | `role` |
| --- | --- |
| Contrôleur des exigences | `exigences` |
| Relecteur métier et factuel | `metier` |
| Vérificateur technique | `technique` |

## Corps

```json
{
  "revisionId": "<identifiant de la révision du document livrable examinée>",
  "role": "exigences",
  "verdict": "CHANGES_REQUESTED",
  "exigencesExaminees": ["REQ-003", "REQ-004", "REQ-005"],
  "preuvesVerifiees": [
    {"revisionId": "<révision>", "emplacement": "Nos agences, paragraphe 1", "element": "Liège-Centre",
     "extrait": "Notre agence de Liège-Centre, rue des Exemples 12...", "sourceIds": []}
  ],
  "constats": [
    {"requirementIds": ["REQ-005"], "categorie": "exigence_manquante", "gravite": "majeure",
     "emplacement": "Nos agences", "description": "L'établissement d'Ans n'apparaît pas.",
     "preuve": "Aucune occurrence d'Ans dans la révision examinée ; sections lues : toutes.",
     "correctionAttendue": "Ajouter adresse, zone desservie et lien de la page d'agence d'Ans."}
  ],
  "constatsResolus": [],
  "limites": [],
  "controlesNonExecutes": [],
  "justification": null
}
```

Le serveur attribue `findingId`, relecteur et horodatage. Catégories admises :
`exigence_manquante`, `preuve_absente`, `affirmation_non_sourcee`, `offre_non_confirmee`,
`promesse_excessive`, `lien_defectueux`, `page_erreur`, `incoherence_canaux`, `marque`,
`technique`, `juridique_a_verifier`, `autre`. Gravités : `critique`, `majeure`, `mineure`,
`info`.

## Règles vérifiées par le serveur

- `PASS` refusé s'il contient un constat `critique` ou `majeure`.
- `CHANGES_REQUESTED` exige au moins un constat nouveau, ou un constat bloquant du même rôle encore ouvert.
- `NOT_APPLICABLE_JUSTIFIED` exige une `justification`.
- Un verdict sur une révision qui n'est plus la courante est périmé : la porte déterministe
  ne le compte pas.
- États de couverture d'une exigence : `non_traite`, `partiel`, `couvert`, `bloque`,
  `na_justifie` (ce dernier seulement avec une exclusion autorisée par un humain).
