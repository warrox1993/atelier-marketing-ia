---
name: "prospection-marche-etranger"
description: "Prépare l'approche d'un marché étranger par une PME belge : étude de marché pays à partir de sources publiques, repérage des aides et services régionaux à l'export (Wallonia Export Investment, ex-AWEX, Flanders Investment & Trade, hub.brussels), adaptation de l'offre (produit, langue, prix, normes, canaux) et choix d'un mode de paiement sécurisé (paiement d'avance, crédit documentaire, assurance-crédit comme celle de Credendo). À utiliser pour décider si et comment aborder un pays ; jamais pour garantir un chiffre de marché non sourcé, promettre une aide ou une subvention, ni engager l'entreprise (contrat, assurance, ouverture de crédit documentaire) sans décision humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commerce-exterieur"
---

# Prospection d'un marché étranger

## Quand l'utiliser

- Une PME envisage un nouveau pays et veut un dossier court avant d'investir du temps ou de l'argent.
- Une demande d'un client étranger arrive et il faut juger s'il vaut la peine d'y répondre.
- L'entreprise veut connaître les aides publiques et les organismes qui peuvent l'accompagner.
- Il faut choisir comment se faire payer sans prendre un risque disproportionné.

## Objectif

Un dossier pays en une à deux pages : le marché en chiffres sourcés, les obstacles, l'offre adaptée, les organismes à contacter, le mode de paiement proposé avec son coût et son risque, et une recommandation « aller / attendre / renoncer » avec les décisions humaines à prendre.

## Prérequis

- La fiche de l'entreprise : produit ou service, capacité, marge, marchés actuels, langues parlées, ressources à consacrer.
- Un pays ou une courte liste de pays, et l'objectif : premier contact, distributeur, vente en ligne, client précis.
- Le budget et l'accord de dépenser fixés par la fiche. Sans budget : moyens gratuits uniquement, sans aucun achat d'étude ni inscription payante.

## Entrées

- `pays` : un ou plusieurs.
- `offre` : produits ou services, prix de revient et prix actuels, volumes possibles.
- `objectif` : par exemple « trouver un distributeur » ou « répondre à la demande d'un acheteur ».
- `risque_accepte` : délai de paiement maximal et montant maximal à découvert, fixés par la direction.

## Étapes

1. **Cadrer la question** : une décision à prendre (« aborder ou non ce pays en 2027 ? »), pas un panorama général.
2. **Rassembler les sources publiques** et les dater : statistiques officielles du commerce de la Belgique et du pays, portail de la Commission pour les conditions d'accès (droits, règles d'origine, procédures, exigences produit), informations des agences régionales, évaluations de risque pays publiées par les assureurs-crédit. Chaque chiffre porte sa source et son année ; un chiffre sans source n'est pas écrit.
3. **Analyser le marché** : taille et tendance pour la catégorie de produit, concurrents locaux et étrangers, canaux (importateur, distributeur, agent, vente directe, plateforme), saisonnalité, usages d'achat. Les inconnues sont listées.
4. **Lever les obstacles d'accès** : droits de douane et accord applicable (voir `classement-douanier-origine`), normes et certifications, étiquetage, langue, licences, restrictions, exigences sanitaires, sanctions éventuelles (arrêt si signal).
5. **Repérer les aides et organismes** selon la région du siège :
   - Wallonie : Wallonia Export Investment, ex-AWEX (agence wallonne à l'exportation et aux investissements étrangers), avec ses conseillers économiques et commerciaux à l'étranger.
   - Flandre : Flanders Investment & Trade, qui propose informations de marché, actions, subventions et conseil.
   - Bruxelles : hub.brussels, qui propose accompagnement international, mise en réseau et missions commerciales.
   Noter, pour chacun, le service pertinent, le contact à prendre et la condition d'éligibilité « à confirmer par l'organisme ». Ne jamais écrire qu'une aide « est acquise » ou donner un montant non lu sur la page de l'organisme.
6. **Adapter l'offre** : version linguistique et mentions légales, unités et formats, emballage, prix (coût du transport, droits, taxes, change, marge du distributeur), garanties et service après-vente, conditions de livraison (voir `dossier-export` pour l'Incoterm), moyens de paiement locaux.
7. **Choisir le mode de paiement** selon le risque (voir le tableau), en indiquant coût, délai, protection et ce qu'il demande à l'entreprise.
8. **Recommander** : aller, attendre ou renoncer, avec les conditions, les prochaines étapes (qui contacte qui) et les décisions humaines : engagement d'un budget, signature d'un contrat de distribution, souscription d'une assurance.

### Les modes de paiement

| Mode | Protection du vendeur | Coût et contrainte | Quand l'envisager |
| --- | --- | --- | --- |
| Paiement d'avance (totalité ou acompte) | maximale | peut freiner l'acheteur ; à convenir par écrit | nouveau client, risque pays élevé, produit sur mesure |
| Crédit documentaire | élevée si les documents sont conformes aux termes du crédit et si la banque émettrice est solide | frais bancaires des deux côtés, rigueur documentaire : une discordance peut bloquer le paiement | montant important, client inconnu, pays à risque |
| Encaissement documentaire | moyenne : les documents ne sont remis qu'au paiement ou à l'acceptation, sans engagement de la banque de payer | frais plus faibles | client connu, risque modéré |
| Compte ouvert avec assurance-crédit | selon la police : couverture d'une partie de l'impayé pour les acheteurs agréés | prime et limite par acheteur à obtenir de l'assureur, délais de déclaration à respecter | clientèle récurrente à crédit |
| Compte ouvert sans protection | faible | aucun coût direct | client de longue date et faible montant, décision de la direction |

Credendo propose notamment de l'assurance-crédit, des cautions et garanties, des solutions de financement à l'export et des évaluations de risque pays publiées. Les conditions, primes et couvertures sont données par l'assureur : la compétence n'en cite aucune.

## Livrable

Un dossier pays de une à deux pages : question, résumé en trois lignes, marché (chiffres sourcés et datés), obstacles d'accès, offre adaptée, organismes à contacter, mode de paiement proposé avec sa justification, recommandation, décisions humaines, liste des inconnues et des questions.

## Critères de réussite

- Chaque chiffre a une source et une année ; les inconnues sont écrites comme telles.
- La recommandation découle des constats et nomme les conditions, pas seulement « aller ».
- Aucune aide, aucun montant et aucune éligibilité n'est affirmé sans lecture de l'organisme.
- Le mode de paiement est relié au risque du pays et du client, avec son coût.
- Aucun engagement n'est pris par la compétence ; aucune dépense n'est faite sans budget écrit dans la fiche.

## Sources officielles

Consultées en ligne le 16/10/2026 :

- Wallonia Export Investment (ex-AWEX), https://www.walloniaexportinvestment.be/ (l'adresse awex.be redirige vers ce site) : accompagnement des entreprises wallonnes sur les marchés internationaux, conseillers économiques et commerciaux à l'étranger, information sur les marchés, espace client.
- Flanders Investment & Trade, https://welcome.flandersinvestmentandtrade.com/ (le site fit.be n'a pas répondu à la lecture automatique) : informations de marché, actions et événements, subventions, conseil sur mesure, échange individuel, plateforme MyFIT.
- hub.brussels, https://hub.brussels/fr/ : aide à se développer à l'international, mise en réseau, missions commerciales, plateforme hub.info pour les questions des entrepreneurs, y compris à l'export.
- Credendo, https://www.credendo.com/fr : assurance-crédit, cautions et garanties, financement à l'export, évaluations de risque pays.
- Access2Markets, Commission européenne, https://trade.ec.europa.eu/access-to-markets/fr/home : droits de douane, règles d'origine, procédures et exigences produit pour exporter depuis l'UE.

Source secondaire : aucune citée. Les conditions précises des aides (montants, taux, éligibilité), les primes et les couvertures d'assurance-crédit, et les frais du crédit documentaire n'ont pas été lus ce jour : ils sont à demander aux organismes et aux banques.

## À vérifier par un professionnel

Le choix du mode de paiement, la rédaction du crédit documentaire ou de l'encaissement, la souscription d'une assurance-crédit, le contrat de distribution ou d'agence et les clauses de litige sont à valider par la banque, l'assureur-crédit et un avocat en droit du commerce international. L'éligibilité aux aides est confirmée par l'organisme régional concerné. Le régime douanier et fiscal de l'envoi relève d'un déclarant en douane ou d'un transitaire.

## Limites

- Les chiffres de marché disponibles gratuitement sont souvent agrégés ou anciens ; la compétence le dit au lieu de les affiner par estimation.
- Pas d'étude payante ni d'inscription à un salon sans budget et accord écrits.
- Les aides changent : l'information lue reste une orientation datée.
- La compétence ne négocie ni ne contacte personne ; elle prépare les messages si l'humain le demande.
- Les pays visés par des sanctions ou des restrictions sortent du périmètre : arrêt et escalade (voir `classement-douanier-origine`).

## Exemple

Question : une PME wallonne de petit outillage hésite entre la France et l'Allemagne pour 2027, budget non précisé dans la fiche.

Dossier : le marché est décrit à partir des statistiques officielles trouvées, avec année et source ; la fiche n'ayant pas de budget, la compétence ne propose aucune étude payante. Organismes : Wallonia Export Investment pour un premier entretien et les conseillers sur place ; conditions d'aide « à confirmer par l'agence ». Adaptation : notice en allemand, prise en compte des normes locales à vérifier, prix tenant compte d'une marge de distributeur. Paiement : acheteur inconnu, montant moyen : paiement d'un acompte puis solde avant expédition pour les premières commandes. Recommandation : « attendre l'Allemagne, tester la France par un distributeur », décisions humaines listées.

Cas d'échec : un acheteur inconnu propose une commande importante de 90 000 euros avec paiement à 90 jours par virement, sans références. La compétence ne conclut pas « risque acceptable » : elle écrit « compte ouvert sans protection déconseillé à ce montant », propose paiement d'avance, crédit documentaire ou couverture d'assurance-crédit à demander, et signale qu'aucun chiffre sur la solvabilité de l'acheteur n'a été trouvé en sources publiques. La décision revient à la direction et à la banque.
