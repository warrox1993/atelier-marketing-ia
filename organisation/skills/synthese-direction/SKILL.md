---
name: "synthese-direction"
description: "Rédige la note de synthèse d'une page destinée au dirigeant à partir des rapports et extraits des services : situation en trois lignes, faits sourcés et datés, décisions attendues avec échéance, risques, informations manquantes, dans un format fixe. À utiliser quand le dirigeant doit être informé ou faire trancher à partir de plusieurs sources ; jamais pour inventer une donnée absente, trancher à la place du dirigeant ni diffuser la note hors de la direction."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "direction"
---

# Note de synthèse pour le dirigeant

## Quand l'utiliser

- Le dirigeant veut un point sur un sujet qui traverse plusieurs services (trésorerie, commercial, ressources humaines, conformité).
- Une décision est attendue et le dirigeant n'a ni le temps ni l'envie de lire les rapports des services.
- Une réunion de direction ou un conseil d'administration approche et il faut un document de préparation.

## Objectif

Une page que le dirigeant lit en trois minutes et après laquelle il sait : où en est la situation, ce qu'il doit décider, avant quand, et ce qui peut mal tourner. Chaque fait est relié à sa source, et ce qui est incertain est dit.

## Prérequis

- La question posée, ou le sujet, avec le nom de celui qui l'a demandée.
- Les extraits des services transmis par le bureau de liaison, chacun avec son origine et sa date. Un extrait sans date ou sans origine est utilisé seulement avec la mention « origine ou date inconnue ».

## Entrées

- `question` : ce que le dirigeant veut savoir ou décider.
- `extraits` : liste de faits transmis (service, date, contenu).
- `echeance` : date limite de la décision, si elle existe.

## Étapes

1. **Dresser la table des faits** : une ligne par fait, avec valeur, unité, période, source (service et date). Écarter tout fait sans source ; le noter dans « informations manquantes ».
2. **Contrôler la cohérence** : comparer les chiffres qui devraient concorder (le total des parties, le même indicateur chez deux services). Un écart est signalé tel quel, avec les deux valeurs et leurs sources, jamais arrangé.
3. **Rédiger le titre-message** : une phrase qui dit la conclusion, pas le thème (« La trésorerie couvre deux mois d'activité, deux factures importantes sont en retard », pas « Point trésorerie »).
4. **Remplir le format fixe** ci-dessous, sans en changer l'ordre.
5. **Distinguer les faits des avis** : la recommandation est écrite dans sa propre section, avec la mention « avis de la synthèse, non un fait ».
6. **Vérifier** : chaque chiffre de la note figure dans la table des faits ; la note tient sur une page (environ 350 à 450 mots, hors table des faits).

### Format fixe

```
NOTE DE SYNTHESE | <sujet> | <date de rédaction> | Confidentiel, direction

1. En bref (3 lignes maximum) : la conclusion et l'urgence.
2. Faits clés (5 lignes maximum) : chaque fait avec valeur, période, source.
3. Décisions attendues : pour chacune, la question, les options, l'échéance, qui décide.
4. Recommandation (avis, non fait) : option conseillée et raison en deux phrases.
5. Risques (3 maximum) : risque, probabilité (faible, moyenne, élevée), effet, signal d'alerte.
6. Informations manquantes : la question précise à poser, à qui, et ce que son absence change.
Annexe : table des faits (valeur, période, source, date d'extraction).
```

## Livrable

Un document d'une page au format fixe plus l'annexe de la table des faits. Le brouillon est marqué « à valider par la direction » ; il n'est envoyé à personne.

## Critères de réussite

- Un lecteur qui ne lit que la section 1 comprend la conclusion.
- Chaque chiffre est retrouvable dans l'annexe avec sa source et sa date.
- Les décisions ont une échéance et un décideur nommé par sa fonction.
- Aucune hypothèse n'est présentée comme un fait ; aucune personne n'est mise en cause nominativement.

## Sources officielles

Consultées le 16/10/2026 :

- « SME definition », Commission européenne, https://single-market-economy.ec.europa.eu/smes/sme-definition_en : seuils de taille des entreprises (moins de 10, 50 et 250 personnes), utiles pour situer les chiffres d'une PME.
- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel (Moniteur belge), https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : paiement en 30 jours par défaut entre entreprises, 60 jours civils au maximum par contrat sauf exception royale, indemnité forfaitaire de 40 euros pour frais de recouvrement. Utile quand la note aborde des retards de paiement. Libellé du titre repris du numéro NUMAC 2002009716 ; à confirmer sur la page.

## À vérifier par un professionnel

Toute note qui cite un chiffre comptable, une obligation légale ou un risque juridique doit être relue, avant décision, par l'expert-comptable de l'entreprise (chiffres) et par un avocat (références légales). Les chiffres comptables sont provisoires tant que le service comptabilité ne les a pas validés.

## Limites

- La note résume ce qui lui est transmis ; elle ne vérifie pas la justesse des rapports des services.
- Une page ne contient pas tout : ce qui est écarté est listé en annexe sous « non retenu ».
- Elle ne présente jamais une décision comme prise.

## Exemple

Question : « Pouvons-nous embaucher un commercial en janvier ? » Extraits : comptabilité (trésorerie au 30/09 : 85 000 euros), recouvrement (échu de plus de 60 jours : 22 000 euros), commercial (pipeline de 6 devis, sans montant).

- En bref : la trésorerie permet l'embauche sur le papier, mais 22 000 euros échus de plus de 60 jours conditionnent la prudence ; le pipeline n'est pas chiffré, donc le retour n'est pas démontrable.
- Décision attendue : embaucher en janvier, décaler ou ne pas embaucher, avant le 30/11, par le dirigeant.
- Informations manquantes : montant des 6 devis (à demander au service commercial) ; coût complet d'un salarié (à demander au secrétariat social).

Cas d'échec : deux extraits donnent un solde différent au 30/09 (85 000 et 78 000 euros). La note ne choisit pas : elle affiche les deux valeurs avec leur source, la mention « écart de 7 000 euros, non expliqué » et met la question à la comptabilité en section 6. La section 4 s'abstient de recommander tant que l'écart n'est pas levé.
