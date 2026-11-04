# Information des personnes en collecte indirecte (RGPD, art. 14) : modèle et mécanisme

Texte de l'art. 14 lu au Journal officiel le 30/10/2026 (https://publications.europa.eu/resource/celex/32016R0679) ;
délais et exceptions résumés dans `rgpd-prospection.md`. Ce n'est pas un avis juridique.

Rien n'est envoyé par l'atelier : ce modèle prépare un texte que l'humain relit, complète et fait partir lui-même, au nom
du responsable du traitement (le client), jamais au nom de l'atelier.

## Quand

- Données trouvées en source publique (annuaire, site, ordre professionnel) : un mois au plus après la collecte, et au plus
  tard au moment de la première communication avec la personne (art. 14, § 3, a et b ; l'atelier retient le plus tôt).
- Personne qui a elle-même donné ses données (formulaire, salon, accord écrit) : c'est l'art. 13 qui s'applique ; garder la
  preuve du consentement (date, moyen, texte accepté) avec la liste, et l'information donnée à ce moment-là.
- Exceptions du § 5 (la personne a déjà l'information, effort disproportionné) : décision humaine écrite, jamais présumée
  par un agent.

## Mécanisme dans l'atelier

1. Le contrôle d'une liste par la Conformité publicitaire écrit, pour chaque prospect, la date limite d'information
   (collecte + un mois) et l'état : « information faite le <date> », « à faire avant le <date> » ou « art. 13, preuve du
   consentement jointe ».
2. La base légale enregistrée d'un prospect porte le texte d'information (`information.texteArt14`) et le moyen
   d'opposition (`information.moyenOpposition`) : le plugin refuse une base légale sans eux.
3. L'envoi lui-même est une action humaine (carte de décision) ; l'agent ne contacte personne.

## Modèle (à compléter par l'humain, champs entre chevrons)

```
Objet : vos données professionnelles chez <nom du responsable du traitement>

Bonjour,

<nom du responsable du traitement> (<adresse>, <courriel de contact>) a relevé vos coordonnées professionnelles
(<catégories : nom, adresse du cabinet, numéro du standard, adresse électronique professionnelle>) pour vous présenter
<objet de la prospection>.

Source : <nom de la source et adresse web>, la source d'où proviennent les données ; ces données sont issues de sources
accessibles au public <ou : ne sont pas issues de sources accessibles au public>.
Base juridique : intérêt légitime (RGPD, art. 6, § 1, f) : <intérêt poursuivi, en une phrase>.
<Le cas échéant : coordonnées du délégué à la protection des données.>
Destinataires : <prestataires qui traitent les données pour notre compte, par catégorie>. Transfert hors de l'Union :
<aucun | lequel, et sur quelle garantie>.
Durée de conservation : 3 ans sans contact, puis effacement.

Vous pouvez vous opposer à tout moment à ce traitement et à toute prospection (RGPD, art. 21) : <moyen simple et gratuit,
par exemple répondre « STOP » à ce message ou écrire à <adresse>>. Vous pouvez aussi demander l'accès à vos données,
leur rectification, leur effacement, la limitation du traitement et leur portabilité, et introduire une réclamation
auprès de l'Autorité de protection des données (https://www.autoriteprotectiondonnees.be).

<Signature du responsable du traitement>
```

Le paragraphe d'opposition reste séparé du reste et lisible d'un coup d'œil (art. 21, § 4). Un message qui contient aussi
une offre est une publicité : par courriel, il exige en plus le consentement ou une exception du livre XII
(`rgpd-prospection.md`).
