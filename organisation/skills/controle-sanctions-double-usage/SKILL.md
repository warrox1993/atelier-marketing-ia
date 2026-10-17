---
name: "controle-sanctions-double-usage"
description: "Filtre toutes les parties d'une opération d'exportation ou d'importation (acheteur, destinataire, utilisateur final, transitaire, banque, intermédiaires) sur les sanctions de l'UE, vérifie si le bien relève du double usage (règlement (UE) 2021/821) et relève les signaux d'alerte, puis analyse chaque correspondance sans la bloquer ni la lever d'office. À utiliser avant toute offre, commande ou expédition hors de Belgique ; jamais pour lever une correspondance, poursuivre une opération non résolue ni chercher un contournement."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commerce-exterieur"
---

# Contrôle des sanctions et du double usage

## Quand l'utiliser

- Une offre, une commande ou une expédition vers un pays tiers, ou un achat auprès d'un fournisseur hors UE, se prépare.
- Un outil de filtrage ou une recherche manuelle renvoie une correspondance sur une partie de l'opération.
- Un client change de destinataire, de transitaire, de banque ou d'itinéraire en cours d'opération.

## Objectif

Une fiche de contrôle qui couvre toutes les parties de l'opération, analyse chaque correspondance avec ses éléments de
comparaison et sa justification écrite, dit si le bien relève du double usage et pose la décision de poursuivre ou non
au responsable conformité. Tant qu'une correspondance n'est pas résolue, l'opération ne bouge pas.

## Prérequis

- L'identité de chaque partie : dénomination exacte, alias connus, adresse, pays, numéro d'entreprise ; pour une personne,
  ce qui est strictement nécessaire à l'identification.
- La description technique du bien, son code proposé (compétence `classement-douanier-origine`), la destination et
  l'usage final déclaré.
- La date du contrôle : les listes changent souvent, un contrôle n'est valable qu'à sa date.

## Entrées

- `parties` : acheteur, destinataire, utilisateur final, transitaire, banques, intermédiaires et consignataires
  intermédiaires.
- `bien` : description, code, quantité, valeur.
- `operation` : pays de destination et de transit, itinéraire, mode de paiement, usage final déclaré.
- `resultats_filtrage` : sortie d'un outil de filtrage ou relevé de consultation des listes, s'il existe.

## Étapes

1. **Lister toutes les parties** de l'opération. Une partie manquante (utilisateur final inconnu, transitaire sans
   destinataire final) est en soi un signal d'alerte.
2. **Filtrer chaque partie** sur la liste consolidée des personnes et entités visées par les sanctions financières de
   l'UE et sur la carte des sanctions de l'UE pour le pays (régimes, secteurs, biens visés). Noter pour chaque partie la
   source consultée, sa date et le résultat.
3. **Analyser chaque correspondance**, sans blocage automatique ni levée sans analyse : degré de similarité du nom, alias,
   adresse, pays, date de naissance pour une personne, numéro d'entreprise, historique des relations. Écrire la
   justification : « correspondance probable », « correspondance improbable, raisons : ... », « indéterminée ». Une
   correspondance partielle n'est jamais levée par l'agent : il propose une conclusion, l'humain décide.
4. **Vérifier le double usage** : le bien figure-t-il dans la liste de contrôle de l'annexe I du règlement (UE)
   2021/821 ? Pour un bien non listé, l'usage final connu ou signalé (armes de destruction massive, usage militaire dans
   un pays sous embargo, répression) peut exiger une autorisation. Les transferts intra-UE des biens de l'annexe IV
   sont aussi soumis à licence. L'autorité compétente est régionale en Belgique.
5. **Relever les signaux d'alerte** : refus de dire l'usage final ; itinéraire inhabituel ; paiement en espèces ou par un
   tiers sans lien ; livraison à un transitaire ou à une société de négoce sans utilisateur final identifié ;
   performances du bien au-delà de l'usage annoncé ; client sans activité liée au produit ; commande sans rapport avec
   son activité habituelle.
6. **Conclure** par un statut : « rien relevé à la date du contrôle » (jamais une autorisation), « correspondance à
   résoudre », « licence à vérifier » ou « ARRÊT ». Tant qu'une correspondance ou un signal n'est pas résolu : aucune
   offre, aucune expédition, aucun document préparé pour la suite.
7. **Poser la décision** au responsable conformité, une carte par correspondance ou par signal, avec la fiche d'analyse.
   Aucune information n'est donnée au client avant la décision.

## Livrable

Fiche de contrôle : tableau des parties (partie, source consultée, date, résultat) ; analyse de chaque correspondance
(éléments comparés, justification, conclusion proposée) ; examen du double usage ; signaux d'alerte ; statut ; cartes de
décision ; durée de conservation proposée de la fiche.

## Critères de réussite

- Toutes les parties de l'opération sont filtrées, chacune avec source et date.
- Aucune correspondance n'est bloquée ni levée sans analyse écrite ; aucune n'est levée par l'agent.
- Le statut « rien relevé » est daté et n'est jamais présenté comme une autorisation.
- Aucune poursuite de l'opération tant qu'une correspondance est ouverte ; aucun contournement proposé.

## Sources officielles

Consultées le 17/10/2026 :

- Commission européenne, « Overview of sanctions and related resources »,
  https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/overview-sanctions-and-related-resources_en :
  liste consolidée des personnes, groupes et entités visés par les sanctions financières de l'UE, tenue par la DG FISMA
  à partir des textes publiés au Journal officiel ; mise en œuvre et sanctions des infractions par les autorités
  nationales compétentes ; service d'assistance gratuit pour les PME qui font des vérifications de sanctions.
- Commission européenne, « Exporting dual-use items »,
  https://policy.trade.ec.europa.eu/help-exporters-and-importers/exporting-dual-use-items_en : le règlement (UE)
  2021/821 fixe des règles communes d'exportation, une liste commune des biens à double usage, des contrôles de l'usage
  final pour des biens non listés, des autorisations individuelles, globales et générales ; un État membre peut ajouter
  des contrôles sur des biens non listés.
- Wallonie, « Demander une licence d'exportation de biens et technologies double usage »,
  https://www.wallonie.be/fr/demarches/demander-une-licence-dexportation-de-biens-et-technologies-double-usage : liste
  des biens soumis à licence pour les transferts intra-UE à l'annexe IV du règlement (UE) 2021/821 ; licence
  individuelle liée au pays, à l'utilisateur final et à la quantité ; demande par la plateforme eLicensing ; pas de délai
  de traitement préétabli.
- Carte des sanctions de l'UE, https://www.sanctionsmap.eu/ : page applicative, contenu non lisible sans navigateur ; à
  consulter par l'humain pour chaque pays.

## À vérifier par un professionnel

- Toute conclusion sur une correspondance, toute levée et toute décision de poursuivre : responsable conformité et, au
  besoin, avocat en droit du commerce international.
- L'autorité compétente pour une licence selon la région du siège d'exploitation (Wallonie : Direction des licences
  d'armes du SPW ; Flandre et Bruxelles : services régionaux à identifier) et l'autorité belge des sanctions financières
  (SPF Finances, Trésorerie) : coordonnées et compétences à vérifier.
- Le texte du règlement (UE) 2021/821 et de ses annexes, non relu sur EUR-Lex.

## Limites

- Elle ne remplace pas un outil de filtrage tenu à jour : sans consultation datée des listes, le statut est « non
  vérifié ».
- Les listes de pays tiers (par exemple américaines) peuvent s'appliquer selon l'opération : non couvertes ici, à signaler
  au conseil.
- Elle ne traite pas le matériel militaire ni les armes, qui suivent un régime propre.

## Exemple

Acheteur fictif « Société A » au Kazakhstan, outil de filtrage : correspondance à 80 % avec une entité de la liste
consolidée de l'UE enregistrée dans un autre pays. Analyse : noms proches, adresse et pays différents, numéro
d'entreprise de l'acheteur fourni, aucun alias commun relevé ; conclusion proposée « correspondance improbable », non
levée. Carte au responsable conformité ; aucune offre ni expédition préparée tant que la carte est ouverte.

Cas d'échec évité : le client propose de « livrer d'abord chez notre transitaire en Turquie, il fera suivre ». Le
transitaire sans utilisateur final identifié est un signal d'alerte : statut « ARRÊT », aucune alternative proposée,
aucune information donnée au client avant l'avis de conformité.

## Origine de la méthode

Méthode adaptée et traduite de github.com/affaan-m/ECC, `skills/customs-trade-compliance/SKILL.md`, sections
« Restricted Party Screening » (toutes les parties de l'opération, signaux d'alerte, analyse des correspondances
justifiée) et « Screening Hit Assessment » (ni blocage ni levée sans analyse, jamais de poursuite tant qu'une
correspondance n'est pas résolue), commit ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous licence Apache 2.0
(en-tête `license: Apache-2.0`, auteur « evos »). Modifications : réécriture en français, listes et autorités de l'UE et
de Belgique à la place des listes américaines, seuil de levée automatique non repris, décision humaine. Texte des
licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
