---
name: "analyse-rentabilite"
description: "Analyse la rentabilité d'une PME belge par produit, client ou canal : chiffre d'affaires, coûts directs, marge brute et marge de contribution, répartition explicite des coûts indirects, seuil de rentabilité et recommandations chiffrées. À utiliser pour savoir ce qui rapporte vraiment, tarifer, arrêter ou développer une offre ; jamais pour répartir des coûts indirects sans le dire, conclure sur un échantillon trop petit, ni présenter une marge provisoire comme définitive."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "comptabilite-finance"
---

# Analyse de rentabilité d'une PME belge

## Quand l'utiliser

- La direction veut savoir quels produits, clients ou canaux gagnent de l'argent, et lesquels en coûtent.
- Un prix doit être fixé ou révisé et il faut connaître la marge réelle.
- Un client important demande une remise et il faut mesurer ce qu'elle coûte.
- La direction se demande à partir de quel volume l'activité couvre ses coûts fixes.

Pour le suivi des indicateurs de direction au fil des mois, voir `tableau-de-bord-pme` ; pour expliquer l'écart entre budget et réalisé, la compétence complémentaire est l'analyse des écarts.

## Objectif

Un tableau par axe d'analyse (produit, client ou canal) avec chiffre d'affaires, coûts directs, marge brute, coûts indirects attribués par une clé écrite, résultat par ligne, plus le seuil de rentabilité de l'entreprise et des recommandations chiffrées, chacune avec son hypothèse. Aucune répartition cachée : un coût qui n'a pas de lien démontrable avec l'axe reste « non réparti ».

## Prérequis

- La période (au moins 12 mois pour lisser la saisonnalité, sinon le dire) et le périmètre.
- Les ventes détaillées par ligne : produit, client ou canal, montant hors TVA, quantités.
- Les coûts : marchandises ou sous-traitance, temps passé valorisé, frais commerciaux, frais généraux.
- Le statut des chiffres : « provisoire » ou « validé par la comptabilité ».

## Entrées

- `periode` et `axe` : produit, client ou canal.
- `ventes` : export des ventes hors TVA, avec l'axe choisi.
- `couts_directs` : par ligne ou par axe, avec la pièce ou le calcul.
- `couts_indirects` : loyers, administration, direction, marketing général, outils, assurances.
- `cles_de_repartition` : proposées par la comptabilité (heures, chiffre d'affaires, nombre de dossiers) ; sinon proposées par la compétence et marquées « à valider ».

## Étapes

1. **Cadrer la question** : quelle décision est en jeu (prix, abandon, développement) ? Choisir l'axe en conséquence. Un axe qui ne mène à aucune décision est abandonné.
2. **Vérifier les données** : toutes les ventes en hors TVA, même période, mêmes unités ; remises, avoirs et ristournes imputés à la bonne ligne ; total des lignes égal au chiffre d'affaires de la comptabilité (écart expliqué ou analyse suspendue).
3. **Séparer les coûts** :
   - coûts directs : ceux qui n'existent pas sans la ligne (marchandises, sous-traitance, commissions payées sur cette vente, temps de production ou de prestation valorisé au coût réel, frais de livraison) ;
   - coûts indirects : ceux qui existent quel que soit le volume de cette ligne ;
   - un coût douteux est classé avec l'argument écrit, jamais déplacé pour embellir une marge.
4. **Calculer, par ligne** :
   - marge brute = chiffre d'affaires hors TVA - coûts directs ; taux = marge brute / chiffre d'affaires ;
   - marge de contribution = marge brute - coûts variables non inclus plus haut (commissions, frais de paiement, remises financières) ;
   - garder les valeurs de départ visibles.
5. **Répartir les coûts indirects** avec une clé écrite (par exemple heures de travail, chiffre d'affaires, nombre de dossiers). Afficher le résultat avec et sans cette répartition : si le classement des lignes change selon la clé, le dire. Le temps de direction ou de l'indépendant qui travaille dans l'entreprise est valorisé, ou son absence signalée.
6. **Calculer le seuil de rentabilité** : coûts fixes de la période / taux de marge de contribution global. Donner le chiffre d'affaires correspondant, le nombre de mois ou d'unités nécessaires, et la marge de sécurité (chiffre d'affaires réel - seuil) / chiffre d'affaires réel. Un seuil calculé avec un taux de marge instable est donné avec une fourchette.
7. **Tester la sensibilité** : effet d'une hausse de prix de 5 %, d'une baisse de volume de 10 %, d'une remise de 10 % sur le plus gros client. Chaque effet en euros et en points de marge.
8. **Vérifier la taille de l'échantillon** : une ligne de moins de 10 ventes ou de moins de 5 % du chiffre d'affaires est marquée « échantillon trop petit pour conclure » et exclue des recommandations fermes.
9. **Formuler des recommandations** : au plus cinq, chacune avec l'action, l'effet attendu en euros (marqué « estimation »), l'hypothèse, le risque et la personne qui décide. Exemples de types : réviser un prix, renégocier une condition, arrêter ou regrouper une offre, limiter les remises, développer une ligne à forte contribution. Aucune ne s'appuie sur un chiffre non vérifié.
10. **Lister les limites et les données manquantes** : coûts non disponibles, clé de répartition non validée, ligne sans historique.

## Livrable

Un document avec : (1) la question de départ et l'axe ; (2) le tableau par ligne (chiffre d'affaires, coûts directs, marge brute, marge de contribution, coûts indirects attribués, résultat) ; (3) la clé de répartition et le classement avec et sans répartition ; (4) le seuil de rentabilité et la marge de sécurité ; (5) la sensibilité ; (6) les recommandations ; (7) les hypothèses, limites et données manquantes ; (8) la date d'extraction et le statut « provisoire » ou « validé ».

## Critères de réussite

- Le total des lignes égale le chiffre d'affaires de la comptabilité, ou l'écart est expliqué.
- Chaque coût direct a une pièce ou un calcul ; chaque coût indirect attribué a sa clé écrite.
- Le classement est présenté avec et sans répartition des coûts indirects.
- Le seuil de rentabilité est reproductible à la main depuis le document.
- Chaque recommandation cite son effet estimé, son hypothèse et celui qui décide.
- Aucun nom de personne identifiable n'apparaît dans l'analyse de coûts de personnel.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel, https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : paiement dans les 30 jours par défaut, 60 jours au plus par contrat, intérêt de retard au taux directeur majoré de 8 points, indemnité forfaitaire de 40 euros. Utile pour chiffrer le coût d'un client qui paie tard dans la marge d'un client.

Aucune source officielle ne définit la marge brute, la marge de contribution ou le seuil de rentabilité : ce sont des conventions de gestion courantes, adaptées à chaque entreprise. Les définitions ci-dessus sont celles de la compétence ; la direction ou le comptable peut en fixer d'autres, à appliquer partout de la même façon. Les seuils de taille et de fréquence cités dans les étapes (10 ventes, 5 %) sont des repères de départ, pas des normes.

## À vérifier par un professionnel

Les chiffres de coûts, la valorisation du temps de travail, la clé de répartition et toute décision de prix, d'arrêt d'offre ou de séparation d'un client sont à faire valider par l'expert-comptable ou le comptable. Les conséquences fiscales ou contractuelles d'un changement de prix ou d'une rupture de relation commerciale relèvent du conseiller fiscal ou d'un conseil juridique.

## Limites

- Une marge dépend de la qualité de l'affectation des coûts : sans données de coûts directs, la compétence s'arrête à la marge sur chiffre d'affaires et le dit.
- Les coûts indirects répartis restent une convention ; la rentabilité d'une ligne n'est jamais plus exacte que sa clé.
- Une analyse sur moins de 12 mois peut être faussée par la saisonnalité.
- La compétence n'explique pas la cause d'une mauvaise marge ; elle indique où chercher.
- Elle ne modifie aucun prix, aucune facture et aucune écriture.

## Exemple

Axe : client, période 2025-10 à 2026-09, entreprise de services. Client n° 1 : chiffre d'affaires 120 000 euros hors TVA, coûts directs (temps de prestation valorisé 72 000 euros, sous-traitance 18 000 euros) 90 000 euros, marge brute 30 000 euros (25 %). Coûts indirects attribués par heures : 14 400 euros. Résultat : 15 600 euros.

Client n° 2 : chiffre d'affaires 60 000 euros, coûts directs 27 000 euros, marge brute 33 000 euros (55 %). Coûts indirects par heures : 5 800 euros. Résultat : 27 200 euros.

Le client n° 1 pèse deux fois plus en chiffre d'affaires mais rapporte moins en résultat. Recommandation : réviser la grille de prix du client n° 1 de 8 % à la prochaine échéance ; effet estimé +9 600 euros par an si le volume reste stable (hypothèse, risque : perte du client). Décision : la direction.

Cas d'échec : le temps de prestation n'est pas valorisé car aucun relevé d'heures n'existe. La marge de chaque client est gonflée de manière inconnue. La compétence n'affiche pas de classement : elle écrit « coûts directs de personnel absents, classement impossible » et demande un relevé d'heures ou un coût horaire moyen validé par la comptabilité.
