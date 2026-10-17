---
name: "registre-formations-obligatoires"
description: "Établit et tient le registre des formations obligatoires d'une entreprise belge par fonction : bien-être au travail, secouristes, incendie et évacuation, recyclage des intermédiaires d'assurance inscrits à la FSMA, prévention du blanchiment et autres obligations sectorielles, avec base légale citée et datée, périodicité sourcée, dernière date connue et prochaine échéance. À utiliser pour cartographier les obligations d'un effectif, préparer les inscriptions de l'année ou contrôler les échéances ; jamais pour inventer une périodicité, inscrire quelqu'un ni tenir un registre nominatif sans demande humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "formation"
---

# Registre des formations obligatoires

## Quand l'utiliser

- L'entreprise veut savoir quelles formations la loi ou son secteur impose, fonction par fonction.
- Le plan de formation annuel se prépare et les formations obligatoires doivent y entrer en premier.
- Un contrôle (inspection, autorité du secteur) approche et les attestations doivent être retrouvées.

## Objectif

Un tableau fiable où chaque formation obligatoire est rattachée à une fonction, à une base légale vérifiable et à une
échéance calculée, pour qu'aucune obligation ne soit oubliée et qu'aucune ne soit inventée.

## Prérequis

- La liste des fonctions, le secteur d'activité, la commission paritaire et, pour un intermédiaire, son statut FSMA.
- Les personnes désignées pour un rôle de prévention (secouristes, équipiers incendie), en nombre par fonction.
- Les dates des dernières formations suivies, si l'entreprise les a.

## Entrées

- `fonctions` : liste des fonctions avec effectif.
- `secteur` : activité, commission paritaire, autorisations (par exemple inscription FSMA).
- `attestations` : dernières dates connues, agrégées par fonction ou par rôle désigné.

## Étapes

1. **Partir des obligations transversales** de tout employeur : formation au bien-être adaptée au poste (art. I.2-21),
   secouristes désignés (art. I.5-9), formation incendie avec exercice d'évacuation (art. III.3-26).
2. **Ajouter les obligations du secteur**, une par une, chacune avec sa source : recyclage des intermédiaires
   d'assurance et de leurs responsables de la distribution et personnes en contact avec le public (FSMA), formation à la
   prévention du blanchiment pour le personnel concerné, autres formations réglementées du métier. Une obligation sans
   source officielle lue est inscrite avec « à vérifier » et la question à poser.
3. **Remplir le tableau** : fonction, formation, base légale (texte, article, date de consultation), périodicité (citée
   ou « à vérifier »), dernière date connue (ou « date inconnue »), prochaine échéance, statut (à jour, à planifier, en
   retard, à vérifier).
4. **Calculer les échéances** depuis la dernière date et la périodicité sourcée seulement. Sans l'une ou l'autre, pas de
   date : « échéance inconnue ».
5. **Extraire les alertes** : échéances des 90 prochains jours, retards, rôles désignés sans formation enregistrée.
6. **Renvoyer** les points de prévention à la HSE et les obligations sectorielles à la conformité par le coordinateur.

## Livrable

Le tableau par fonction, la liste des alertes et la liste des obligations dont la base reste à vérifier, avec la
question précise à poser et à qui.

## Critères de réussite

- Chaque base légale est citée et datée, ou marquée « à vérifier ».
- Aucune périodicité ni aucun nombre d'heures sans source.
- Chaque échéance est calculée depuis une date connue, sinon « échéance inconnue ».
- Le registre est tenu par fonction, sauf demande humaine explicite.

## Sources officielles

Consultées le 17/10/2026 :

- Code du bien-être au travail, livre Ier, titre 2 (art. I.2-21) et titre 5 (art. I.5-9), livre III, titre 3
  (art. III.3-26), versions PDF publiées par le SPF Emploi, Travail et Concertation sociale,
  https://emploi.belgique.be/fr/themes/bien-etre-au-travail/principes-generaux/code-du-bien-etre-au-travail :
  formation au bien-être à l'engagement, à la mutation, à l'introduction d'un équipement ou d'une technologie, répétée
  si nécessaire, pendant le temps de travail (I.2-21) ; recyclage annuel des secouristes, tous les deux ans sur
  dérogation motivée après avis du conseiller en prévention-médecin du travail et du Comité, rattrapage dans les 12 mois
  (I.5-9) ; formation incendie comportant des exercices d'évacuation organisés au moins une fois par an (III.3-26).
- FSMA, « Newsletter recyclage » du 19/12/2023,
  https://www.fsma.be/sites/default/files/media/files/2023-12/2023-12-19_newsletter_recyclage_fr.pdf : tableau des
  heures de recyclage par année civile (15 heures pour l'intermédiaire d'assurance, le responsable de la distribution et
  la personne en contact avec le public ; 3 heures pour l'intermédiaire à titre accessoire), règlement FSMA du
  31/10/2023 sur l'agrément des organisateurs de formations, report possible d'un excédent d'heures.

Non lus ici : le texte de la loi du 4 avril 2014 relative aux assurances et de ses arrêtés sur les connaissances
professionnelles, et la loi du 18 septembre 2017 relative à la prévention du blanchiment : articles à vérifier.

## À vérifier par un professionnel

- Base réglementaire exacte du recyclage FSMA et preuves à conserver : à confirmer par le responsable conformité.
- Obligations de formation propres à la commission paritaire de l'entreprise : à confirmer auprès du secrétariat
  social ou du fonds sectoriel.

## Limites

- Le registre couvre les obligations trouvées et sourcées ; il ne garantit pas l'exhaustivité pour un secteur non
  étudié.
- Le contenu exigé d'une formation (programme, organisme agréé) n'est pas contrôlé ici.

## Exemple

Cas nominal : courtier fictif, cinq fonctions. Gestionnaire sinistres (personne en contact avec le public) : recyclage
FSMA, 15 heures par année civile, source FSMA du 19/12/2023, base réglementaire « à vérifier ». Secouristes (3 désignés) :
recyclage annuel, art. I.5-9, dernière session le 12/01, échéance 12/01 de l'année suivante. Tout le personnel : exercice
d'évacuation au moins une fois par an, art. III.3-26, date du dernier exercice inconnue, statut « à planifier ».

Cas d'échec évité : on demande « tous les combien la formation blanchiment ? ». Sans source lue, la périodicité reste « à
vérifier » et la question part à la conformité.

