# Checklist : intégrité des faits et isolation (exigences de la phase 3)

**Purpose**: Vérifier que les exigences sur les preuves, la porte, la collecte et l'isolation sont complètes, claires et testables avant le plan.
**Created**: 27/10/2026
**Feature**: [spec.md](../spec.md)

## Preuves et affirmations

- [x] CHK001 Le spec définit-il ce qui distingue « inconnu » de « non vérifié » pour un champ de fiche ? [Clarity, Spec §FR-020]
- [x] CHK002 Les exigences disent-elles quoi faire d'une preuve dont l'instantané a été remplacé par un plus récent ? [Gap, Spec §FR-013]
- [x] CHK003 La normalisation utilisée pour comparer extrait et instantané (OBS-02, « aux blancs près ») est-elle définie à un seul endroit ? [Consistency, Spec §FR-015]
- [x] CHK004 Le motif obligatoire de la confiance (0 à 3) a-t-il un contenu minimal exigé ? [Clarity, Spec §FR-012]

## Porte de contrôle

- [x] CHK005 Chaque règle OBS-01 à OBS-16 a-t-elle au moins un cas de refus et un cas d'acceptation exigés ? [Coverage, Spec §SC-002]
- [x] CHK006 Le spec dit-il comment la porte choisit le jeu de règles (Observatoire ou marketing) pour une tâche donnée ? [Gap, Spec §FR-017]
- [x] CHK007 La fraîcheur d'un PASS (« PASS frais ») est-elle définie (révision modifiée après le PASS) ? [Clarity, Spec §FR-016]

## Collecte

- [x] CHK008 Les limites de lecture (taille, durée, nombre de redirections) sont-elles exigées ou renvoyées à la lecture protégée existante ? [Clarity, Spec §FR-005]
- [x] CHK009 Le seuil d'échecs consécutifs avant « non maintenu » est-il chiffré ? [Measurability, Edge Cases]
- [x] CHK010 Le comportement à l'épuisement du quota GitHub est-il exigé de façon testable (reprise sans perte) ? [Coverage, Edge Cases]
- [x] CHK011 Le traitement des contenus piégés (injection) a-t-il un critère vérifiable ? [Measurability, Spec §FR-010]

## Isolation et sécurité

- [x] CHK012 L'exigence « inerte hors de l'entreprise Observatoire » précise-t-elle qui est refusé et avec quel message ? [Clarity, Spec §FR-002]
- [x] CHK013 Les préconditions d'activation sur 3100 (sauvegarde, photos, essai à blanc, accord de l'opérateur) sont-elles toutes listées comme bloquantes ? [Completeness, Spec §FR-018]
- [x] CHK014 Le spec interdit-il explicitement que le dépôt de contenu reçoive un brouillon ou un secret ? [Gap, Spec §FR-024]

## Export

- [x] CHK015 La forme de l'ancre stable par affirmation est-elle définie ? [Clarity, Spec §FR-022]
- [x] CHK016 Le spec dit-il ce qui se passe si le dépôt de contenu a des modifications locales non exportées ? [Edge Case, Gap]

## Revue

- Revue faite par Claude sur délégation de l'opérateur (27/10/2026) : les 16 manques sont comblés par FR-026 à FR-036, SC-002 et FR-018 du spec.
