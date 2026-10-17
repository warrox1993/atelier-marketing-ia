---
name: "communique-de-presse"
description: "Rédige un communiqué de presse d'une PME belge, FR et NL si utile : angle, structure en pyramide inversée, citations validées par leur auteur, embargo, informations pratiques, liste de médias ciblée et préparation d'une éventuelle réponse au droit de réponse (loi du 23 juin 1961). À utiliser pour annoncer un événement, un résultat, un recrutement, un produit ou une nomination ; jamais pour diffuser (l'envoi est humain), inventer une citation ou un chiffre, ni traiter une crise (voir communication-de-crise)."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "communication"
---

# Communiqué de presse d'une PME belge

## Quand l'utiliser

- L'entreprise a une nouvelle vérifiable qui intéresse un public au-delà d'elle (ouverture, résultat, nomination, partenariat, lancement, événement, prix reçu).
- Un journaliste demande un texte de référence que l'entreprise puisse approuver et signer.
- Un ancien communiqué doit être adapté pour la presse néerlandophone ou pour un média spécialisé.
- Une personne ou une entreprise nommée dans la presse demande à exercer un droit de réponse, ou l'entreprise veut l'exercer : la compétence prépare l'analyse des délais et un projet de lettre.

## Objectif

Un communiqué qu'un journaliste peut publier presque tel quel : une seule nouvelle, un angle clair, des faits sourcés, des citations validées, des informations pratiques complètes, un contact joignable. Le texte est un brouillon livré avec sa table des faits ; il n'est ni envoyé ni publié sans approbation humaine.

## Prérequis

- Un message unique décidé par la direction et un porte-parole désigné.
- Les faits validés (qui, quoi, quand, où, combien, pourquoi) avec leur source ; sinon la liste des informations manquantes.
- La charte de marque (ton, mentions, nom exact de l'entreprise, boilerplate).
- Les langues du public visé (FR, NL, ou les deux).
- Pour toute citation : la personne citée et sa disponibilité pour valider.

## Entrées

- `sujet` : la nouvelle en une phrase.
- `faits` : liste de faits avec source et date.
- `citations` : propositions de la personne citée ou notes de la direction, avec statut de validation.
- `public` : presse nationale, régionale, spécialisée, audiovisuelle, agence ; langues.
- `calendrier` : date et heure de diffusion souhaitées, embargo éventuel, événement associé.
- `contact_presse` : nom, rôle, courriel et téléphone fournis par l'entreprise (jamais inventés).

## Étapes

1. **Trouver l'angle.** Répondre par écrit à « pourquoi un lecteur de ce média s'y intéresserait-il aujourd'hui ? ». Une nouvelle interne (réorganisation sans effet public) n'est pas un communiqué : proposer un autre canal. Un seul message par communiqué.
2. **Choisir la forme.** Communiqué (1 page, 300 à 400 mots), invitation presse (événement avec date, lieu, heure, programme, inscription), note d'information (sujet technique), ou réponse à un journaliste. Annoncer la forme dans le brief.
3. **Construire la pyramide inversée.** Titre factuel de 12 mots environ avec verbe ; chapeau de 2 phrases qui contient qui, quoi, quand, où ; premier paragraphe : la nouvelle ; deuxième : le contexte et le chiffre qui compte ; troisième : l'utilité pour le lecteur ou le public. Aucun superlatif sans preuve.
4. **Placer les citations.** Une ou deux citations au plus, qui apportent un avis ou une émotion, pas une répétition des faits. Chaque citation porte nom, fonction et statut « validée par écrit le JJ/MM/AAAA » ou « non validée ». Une citation non validée n'est pas proposée à la diffusion.
5. **Compléter les informations pratiques** : date, lieu, adresse, horaires, lien, visuels disponibles avec droits d'utilisation, personnes disponibles pour interview, contact presse.
6. **Écrire le « à propos »** (boilerplate) de 3 à 4 lignes tiré de la charte ou de la fiche de l'entreprise.
7. **Régler l'embargo.** Si utile : « Embargo jusqu'au JJ/MM/AAAA à HH h (heure de Bruxelles) » en tête du texte. Rappeler à l'humain qu'un embargo est une convention de courtoisie acceptée par le journaliste ; il n'a de portée que s'il est annoncé avant l'envoi et accepté. Ne jamais envoyer un texte sous embargo à un média qui ne l'a pas accepté d'avance.
8. **Adapter FR et NL.** Écrire chaque version pour son public, pas une traduction littérale : registre, titres, formules de politesse, usages belges (noms de lieux officiels dans la langue de la région, sigles locaux). Ajouter « à faire relire par un locuteur natif » avant diffusion.
9. **Rédiger la proposition au journaliste** (courriel d'accompagnement) et la passer à la liste de contrôle ; si une seule réponse est non, ne pas proposer l'envoi :
   - le journaliste couvre-t-il ce sujet (ses 5 derniers articles) ?
   - y a-t-il une accroche d'actualité (ce qui vient d'arriver ou va arriver) ?
   - pourrait-il écrire un article à partir de ce seul courriel (faits, chiffres sourcés, citation, contact) ?
   - l'objet laisse-t-il deviner le titre de l'article ?
   - la proposition fait-elle moins de 150 mots ?
   - est-elle sans superlatif creux (« révolutionnaire », « unique », « leader ») ?
   - la demande est-elle claire (interview, embargo, exclusivité, citation) ?
10. **Cibler les médias.** Proposer une liste de 10 contacts au plus : titre ou rédaction, rubrique concernée, raison du choix, langue, source du contact fournie par l'entreprise ou publique, base du consentement pour recevoir ses communiqués. Les agences de presse nationales distribuent les communiqués aux rédactions, mais la diffusion et son coût éventuel sont une décision humaine. Aucun contact inventé ; un contact sans source est marqué « à trouver ».
11. **Contrôler.** Chaque chiffre est dans la table des faits ; aucune allégation que l'entreprise ne peut prouver (santé, environnement, comparaison avec un concurrent) ; pas de données personnelles non nécessaires ; secteur réglementé : passer par `controle-communications-reglementees`.
12. **Préparer les suites.** Rédiger 5 questions-réponses probables et la ligne à tenir si un fait est contesté. Indiquer à l'humain qui répond aux appels dans les deux heures suivant l'envoi.
13. **Droit de réponse (si demandé).** Relever la date de publication de l'article ou de l'émission, calculer le délai restant (voir « Sources officielles »), identifier la personne qui peut agir, vérifier la longueur de la réponse et les motifs de refus possibles, rédiger un projet de lettre factuel (rectification des faits, sans polémique) et le soumettre à un juriste. Le droit de réponse s'exerce contre un média, pas contre un journaliste dans un échange informel : une simple erreur factuelle se traite d'abord par une demande de rectification courtoise.
14. **Livrer et poser la carte d'approbation** : texte, table des faits, citations à valider, liste de médias, point d'embargo, date et heure proposées, décision attendue.

## Livrable

Un document avec : le communiqué dans chaque langue demandée ; la table des faits (fait, source, date) ; la liste des citations avec leur statut de validation ; la liste de médias ciblée ; les questions-réponses ; l'éventuel projet de droit de réponse ; les points « à vérifier » ; la décision humaine attendue (diffusion, moment, embargo).

## Critères de réussite

- Un journaliste comprend la nouvelle à la lecture du titre et du chapeau seuls.
- Chaque chiffre et chaque date renvoie à la table des faits.
- Toute citation est attribuée à une personne réelle qui l'a validée par écrit.
- La version NL n'est pas une traduction littérale et porte la mention de relecture.
- La proposition au journaliste fait moins de 150 mots et les 7 points de la liste de contrôle sont cochés ou expliqués.
- Aucune diffusion n'a eu lieu : la carte d'approbation est posée avec les décisions listées.
- Aucun contact presse, média ou chiffre inventé.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 23 juin 1961 relative au droit de réponse, Justel (Moniteur belge), https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=1961062330&table_name=loi : toute personne physique ou morale nommée ou implicitement désignée peut demander l'insertion gratuite d'une réponse ; délai de trois mois pour un écrit périodique, trente jours pour une émission ; longueur maximale de 1 000 caractères ou du double du texte contesté pour l'écrit, de 3 minutes de lecture ou 4 500 caractères pour l'audiovisuel ; motifs de refus (absence de lien direct, injures, mise en cause inutile de tiers, autre langue) ; publication intégrale, au même emplacement et dans les mêmes caractères. Ces éléments sont une synthèse de la page ; les numéros d'articles et le régime des sanctions, modifié récemment d'après la page, n'ont pas été relevés et sont à lire dans le texte consolidé.
- Code de déontologie journalistique, Conseil de déontologie journalistique (Belgique francophone et germanophone), https://www.lecdj.be/fr/deontologie/code/ : les rédactions rectifient explicitement et rapidement les faits erronés qu'elles ont diffusés ; elles respectent les conditions de diffusion convenues (embargo, hors micro) lorsqu'elles sont clairement établies et non contestées, sans que cela compromette leur indépendance ; la publicité ne doit pas être confondue avec l'information. Numéros d'articles non vérifiés dans cette lecture. Source secondaire pour l'usage des communiqués : le code vise les journalistes, pas les entreprises.
- Raad voor de Journalistiek (Flandre), https://www.rvdj.be/ : instance d'autorégulation indépendante, avec code journalistique et médiateur. La page d'accueil seule a été lue ; le détail du code n'a pas été consulté.
- Belga, agence de presse belge, https://www.belga.be/fr : propose aux organisations de diffuser leurs communications (Belga.share sur Belga.press). Source commerciale du prestataire, non neutre : tarifs et conditions non consultés.

## À vérifier par un professionnel

Tout communiqué contenant une allégation (santé, environnement, performance, comparaison), un chiffre financier non publié, une information sur des personnes identifiables ou touchant un secteur réglementé est à faire relire par le juridique ou un avocat avant diffusion. Un droit de réponse (délais, forme, refus, éventuelle procédure) est à confier à un avocat. La version néerlandaise est à faire relire par un locuteur natif.

## Limites

- La compétence ne connaît pas les consignes éditoriales actuelles d'un média ni les coordonnées à jour de ses journalistes.
- Elle ne mesure pas la reprise du communiqué ; un bilan de retombées est un autre travail.
- Un embargo ne peut pas être garanti : un média qui ne l'a pas accepté n'est pas lié.
- Le droit de réponse a des délais courts ; un doute sur la date impose de demander au juriste avant d'agir.
- Un communiqué ne remplace pas la communication de crise ni l'information légale due à une autorité ou aux représentants du personnel.

## Exemple

Une PME de 25 personnes à Namur ouvre un second atelier et crée 6 emplois (source : décision de la direction du 08/10/2026, 6 postes confirmés par écrit). Le brief donne la date d'ouverture, l'adresse, la gérante comme porte-parole.

Titre proposé : « Atelier X ouvre un second site à Namur et recrute six personnes ». Chapeau : qui, quoi, quand, où. Citation de la gérante : « validée par écrit le 12/10/2026 ». Liste de médias : 4 titres régionaux, 1 radio, 1 média spécialisé, chacun avec sa raison. Version NL pour la presse bruxelloise, marquée à relire. Carte d'approbation posée : diffusion le 20/10 à 9 h, sans embargo.

Cas d'échec : la direction demande d'ajouter la phrase « 30 % de croissance cette année » sans pièce justificative, et une citation attribuée à un partenaire qui n'a pas répondu. La compétence retire le chiffre (« information manquante : source du taux de croissance »), marque la citation « non validée, non diffusable » et bloque la carte d'approbation jusqu'à réception des deux éléments.

## Origine de la méthode

Liste de contrôle de la proposition au journaliste adaptée et traduite de github.com/coreyhaines31/marketingskills,
`skills/public-relations/SKILL.md`, section « Quick Reference: Pitch Quality Bar », commit
dda3841f0b294e01e93b1541486beefbfab0915e, licence MIT, Copyright (c) 2025 Corey Haines. Modifications : réécriture en
français, médias belges. Texte de la licence et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
