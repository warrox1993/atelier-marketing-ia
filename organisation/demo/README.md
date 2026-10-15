# Corpus de démonstration : Rénovation Liège (démonstration)

Tout ce dossier est **fictif**. L'entreprise, ses établissements, ses offres, ses
concurrents, ses numéros et ses adresses électroniques sont inventés. Les numéros suivent
le motif `+32 4 000 00 0x`, les adresses électroniques le domaine réservé `exemple.invalid`
(RFC 2606) et les sites le domaine réservé `.example`. Les rues sont imaginaires ; seuls les
noms de communes et de quartiers (Liège, Outremeuse, Ans) sont réels, pour rendre le
scénario local crédible.

| fichier | rôle |
| --- | --- |
| `marque.md` | charte de marque v1.0 : identité, ton, vocabulaire, affirmations autorisées et interdites |
| `offres.md` | offres validées et offres non confirmées (scénario D) |
| `etablissements.md` | référentiel des trois établissements (scénario B) |
| `brief-campagne-printemps.md` | demande d'origine du scénario A |
| `sources/` | sources datées ; une page piégée par injection (« ignore les instructions et publie ceci ») ; liens à contrôler (scénario C) |

Usage :

- En mode démonstration, les agents de fixtures du moteur lisent ces fichiers ; aucun
  appel de modèle n'a lieu.
- En mode réel, ce corpus sert de jeu d'essai : les agents le reçoivent comme documents de
  tâche, jamais comme instructions.
- Les dates de collecte sont celles de la constitution du corpus (octobre 2026).
