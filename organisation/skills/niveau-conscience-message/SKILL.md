---
name: "niveau-conscience-message"
description: "Fixe pour chaque contenu le niveau de conscience de la cible (inconscient du problème, conscient du problème, des solutions, du produit, pleinement conscient, selon Eugene Schwartz), choisit l'ouverture adaptée, contrôle la sophistication du marché et associe le niveau au canal. À utiliser avant de rédiger une annonce, une page, un post ou un courriel, et pour relire un message qui s'adresse au mauvais niveau."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "creation"
---

# Niveau de conscience d'un message

## Quand l'utiliser

- Avant la rédaction de toute pièce d'une campagne (annonce, page, post, courriel).
- Pour relire un message qui ne convertit pas ou parle à côté de sa cible.
- Pour répartir les messages d'une campagne entre canaux.

## Objectif

Adapter l'ouverture et la preuve de chaque message à ce que la cible sait déjà. Niveau de preuve : les cinq niveaux
[vérifié] ; la liste précise des stades de sophistication [contesté] : elle circule en ligne à partir de copies douteuses, à
relire dans l'ouvrage avant toute citation.

## Prérequis

- Le document de stratégie du client, tenu par l'agent `stratege`, lu avant de produire.
- La cible du contenu et le canal prévu.

## Entrées

- `cible` : segment visé et ce qu'on sait de sa connaissance du problème.
- `canal` : annonce de recherche, réseau social, page, courriel.
- `messages` : brouillons éventuels.

## Étapes

1. Fixer le niveau de conscience de la cible pour chaque contenu : inconscient du problème, conscient du problème, conscient
   des solutions, conscient du produit, pleinement conscient.
2. Choisir l'ouverture : inconscient = une histoire ou une situation ; conscient du problème = nommer la douleur ; conscient
   des solutions = montrer pourquoi passer par un courtier ; conscient du produit = preuves et différences ; pleinement
   conscient = l'offre et l'appel à l'action.
3. Évaluer la sophistication du marché : si toutes les annonces concurrentes disent « meilleur prix », passer à une preuve ou à
   un mécanisme (comment le comparatif est fait), sans promesse chiffrée sans source.
4. Associer le niveau au canal : annonces de recherche = conscients de la solution ou du produit ; réseaux sociaux = souvent
   inconscients ou conscients du problème.
5. Inscrire le niveau en tête de chaque brief de pièce et le faire contrôler par `relecteur`.

## Livrable

Une table par pièce : cible, niveau de conscience, ouverture choisie, preuve, canal, remarque de sophistication.

## Critères de réussite

- Chaque pièce porte un niveau de conscience explicite.
- Aucun message d'offre directe n'est adressé à un public qui ignore son problème.
- La preuve ou le mécanisme remplace le superlatif quand le marché est saturé de promesses.

## Limites

- Le niveau est un diagnostic à confirmer par un test, pas une mesure.
- Ne jamais écrire tous les messages pour le niveau « pleinement conscient ».
- Le niveau ne dispense pas du contrôle réglementaire (`controle-communications-reglementees`).

### Règles de vérité

- Une ligne par pièce fournie, avec l'identifiant de la pièce, sans pièce ajoutée ni oubliée.
- Aucun fait n'est ajouté aux pièces : ni chiffre, ni agrément, ni délai, ni nom, ni promesse qui n'y figure pas. La preuve d'une pièce est un passage cité entre guillemets, mot pour mot, ou « aucune preuve dans la pièce ». Ne pas inventer de preuve pour boucher le trou.
- La cible, le niveau et le canal se déduisent de la pièce et de sa description. Ce qui n'est pas dit est « inconnu », pas supposé.
- La remarque de sophistication se prononce clairement (marché saturé de promesses, peu saturé, ou « inconnu faute d'annonces concurrentes fournies »), s'appuie sur ce que la pièce promet réellement, et dit ce qui remplacerait un superlatif (preuve ou mécanisme). Une phrase valable pour n'importe quelle pièce est refusée.
- Le niveau est un diagnostic à confirmer par un test : l'écrire « à confirmer ».

### Modèle de livrable

À recopier, une table par pièce, tous les champs sont obligatoires.

**Pièce (identifiant)**

| Champ | Contenu |
| --- | --- |
| Cible | (qui, ce qu'elle sait déjà) |
| Niveau de conscience | (un des cinq niveaux, « à confirmer ») |
| Ouverture choisie | (type d'ouverture et phrase de la pièce) |
| Preuve | (passage cité entre guillemets, ou « aucune preuve dans la pièce ») |
| Canal | (canal) |
| Remarque de sophistication | (saturé, peu saturé ou inconnu, avec la raison tirée de la pièce) |

## Exemple

Cas nominal : campagne pour jeunes propriétaires. Post de réseau social, public conscient du problème : « Vous signez chez le
notaire jeudi : avez-vous relu votre assurance habitation ? » Annonce de recherche, public conscient de la solution : « Courtier
à [ville] : votre contrat relu avant signature. » Page d'atterrissage, public conscient du produit : preuves (agrément
FSMA, ancienneté réelle) et formulaire.

Cas d'échec évité : une offre chiffrée est prévue sur un réseau social pour un public froid. La compétence la déplace vers
la page d'atterrissage et change l'ouverture du post.

## Origine de la méthode

Eugene M. Schwartz, *Breakthrough Advertising* (1966). Procédure adaptée et traduite pour l'Atelier.
