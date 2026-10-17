---
name: "evaluation-fournisseurs"
description: "Évalue un fournisseur en cours de contrat : note sur 100 en cinq dimensions pondérées (fiabilité, support, sécurité, conditions commerciales, adéquation), verdict garder, revoir ou remplacer, conformité aux engagements de service avec tendance et avoir réclamable, risque tiers sur quatre axes. À utiliser avant un renouvellement, après des incidents répétés ou pour une revue annuelle du portefeuille fournisseurs ; jamais pour résilier, réclamer un avoir ou remplacer un fournisseur à la place de l'humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "achats"
---

# Évaluation des fournisseurs

## Quand l'utiliser

- Un contrat arrive à reconduction et il faut décider de le garder, de le renégocier ou d'en sortir.
- Un prestataire a manqué plusieurs fois ses engagements de service.
- La direction veut une revue annuelle des fournisseurs importants.

## Objectif

Une fiche par fournisseur avec une note sur 100 calculée selon des pondérations écrites, un verdict cohérent avec la
note, la conformité mesurée aux engagements de service et ses conséquences (avoir réclamable), et un classement du
risque tiers, la décision restant humaine.

## Prérequis

- Le contrat ou les conditions en vigueur : engagements de service, pénalités ou avoirs prévus, durée, préavis.
- Les relevés de service sur la période (disponibilité, délais de réponse, incidents), fournis par le service qui les
  suit (informatique, services généraux), par le bureau de liaison.
- Les pondérations et seuils de l'entreprise. À défaut, les repères de l'étape 2, annoncés comme tels.

## Entrées

- `fournisseur` : dénomination, objet du contrat, dépense annuelle, criticité pour l'activité.
- `engagements` : indicateur, objectif contractuel, période de mesure, avoir prévu.
- `releves` : valeurs mesurées par mois.
- `incidents` : date, durée, effet.

## Étapes

1. **Écrire les pondérations avant de noter.** Repère de départ, à adapter par l'entreprise :
   | Dimension | Poids |
   | --- | --- |
   | fiabilité (disponibilité, incidents) | 30 % |
   | support (délais de réponse) | 15 % |
   | sécurité et conformité (certifications, RGPD article 28) | 25 % |
   | conditions commerciales (souplesse au renouvellement, indexation) | 15 % |
   | adéquation (criticité au regard de la dépense) | 15 % |
   Une entreprise qui traite des données sensibles peut monter le poids de la sécurité : le dire.
2. **Noter chaque dimension sur 100** avec la pièce qui justifie la note, puis calculer la note pondérée.
3. **Verdict** selon des seuils de départ à valider par l'entreprise : garder (75 et plus), revoir avec le fournisseur
   avant de renouveler (50 à 74), chercher une alternative et ne pas reconduire tacitement (moins de 50).
4. **Conformité aux engagements de service** : pour chaque indicateur, taux mesuré sur le dernier mois et sur le
   dernier trimestre contre l'objectif, tendance (s'améliore, stable, se dégrade). Signaler un avoir comme réclamable
   quand le contrat le prévoit et que les conditions sont réunies (par exemple au moins deux manquements sur douze mois,
   ou un trimestre sous l'objectif) ; le contrat prime sur le repère.
5. **Risque tiers** sur quatre axes, chacun faible, moyen ou élevé : sensibilité des données confiées, exposition
   financière (dépense annuelle), dépendance opérationnelle (que se passe-t-il s'il s'arrête, existe-t-il une solution
   de secours), exposition réglementaire (RGPD, NIS2 selon le secteur de l'entreprise).
6. **Recommandation** et carte de décision : garder, revoir, remplacer ; réclamation d'un avoir ; date limite du
   préavis si le contrat se reconduit.

## Livrable

Une fiche par fournisseur : pondérations, notes par dimension avec pièces, note pondérée, verdict, tableau de
conformité (indicateur, objectif, mesure, tendance, avoir réclamable ou non), risque tiers sur quatre axes, date du
préavis, carte de décision.

## Critères de réussite

- Les pondérations sont écrites avant la notation et totalisent 100 %.
- Le calcul de conformité est exact et reproductible à partir des relevés.
- Le verdict est cohérent avec la note et les seuils écrits.
- Un avoir réclamable selon le contrat est signalé ; aucune réclamation envoyée.
- La décision de garder, revoir ou remplacer est renvoyée à l'humain.

## Sources officielles

Texte de référence, déjà cité par la compétence `registre-traitements-rgpd` : Règlement (UE) 2016/679 (RGPD), EUR-Lex,
https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32016R0679 : article 28, obligations du sous-traitant
et contenu du contrat. Les pondérations, seuils et règles d'avoir sont des pratiques de gestion des fournisseurs, pas
des textes officiels : le contrat du fournisseur fait foi.

## À vérifier par un professionnel

La lecture des clauses d'engagement de service, de pénalité et de résiliation, et l'exigibilité d'un avoir relèvent du
juriste ; la qualification NIS2 de l'entreprise, du juridique et de l'informatique.

## Limites

- Sans relevés mesurés, la conformité n'est pas calculée : la fiche le dit.
- La compétence n'envoie aucune réclamation et ne résilie rien.
- Les seuils sont des repères ; l'entreprise fixe les siens.

## Exemple

Prestataire informatique, objectif de disponibilité 99,5 % par mois. Douze mois de relevés : deux mois à 99,1 % et
98,9 %, les autres à 99,6 % ou plus. Deux manquements sur douze mois, le contrat prévoit un avoir de 5 % de la
redevance mensuelle par mois manqué : avoir signalé comme réclamable. Note pondérée 68 sur 100 : verdict « revoir ».
Carte : réclamer l'avoir et ouvrir une revue avant le préavis du 30/11.

Cas d'échec : l'agent annonce « remplacer » pour une note de 68 parce que les incidents l'ont marqué. Le verdict doit
suivre les seuils écrits ; l'impression va dans les questions.

## Origine de la méthode

Note sur 100 en cinq dimensions, verdicts, suivi des engagements de service avec avoir réclamable et quatre axes de
risque tiers adaptés et traduits de github.com/alirezarezvani/claude-skills,
`business-operations/skills/vendor-management/SKILL.md` (étapes 2 à 4), commit 19392f7a08264ed00486a251f5b2098321771f94,
licence MIT, Copyright (c) 2025 Alireza Rezvani. Les scripts Python du dépôt ne sont pas repris. Modifications :
traduction, cadre belge et européen. Licence et reprises : `organisation/skills/LICENCES-TIERS.md`.
