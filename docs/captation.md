# Captation de prospects : pages de destination (22/10/2026)

Objectif : recueillir des contacts DIRECTS donnés par la personne elle-même, avec son consentement. Une page par campagne, créée par un agent
(rôle Contenus) à partir de simples textes, avec un formulaire « On vous rappelle ». Rien n'est mis en ligne par un outil.

## Pièces

| Pièce | Rôle | Où |
| --- | --- | --- |
| Serveur de pages | sert `/p/<slug>`, reçoit le formulaire, relaie le suivi Umami | `passerelle/src/pages/`, unité `scripts/systemd/atelier-pages.service`, `127.0.0.1:3195` |
| Service `captation` de la passerelle | outils d'agent `creer_page_destination`, `lister_pages`, `statistiques_page` | `passerelle/src/reel/captation/outils.ts` |
| Umami 3.4.0 + PostgreSQL 18.6 | statistiques sans cookie | `scripts/installer-umami.sh`, unités `atelier-umami*`, `127.0.0.1:3196` |
| Route du plugin | crée le prospect (coordonnées chiffrées à la réception) | `prospects.particuliers.enregistrer` (existante) |
| Carte de galerie | connexion `atelier-captation` dans Paperclip | patch du socle `0092` |

Le magasin des pages est un fichier SQLite partagé (`~/.local/share/atelier/pages/pages.sqlite`, mode WAL) : la passerelle y CRÉE les pages, le serveur
de pages les SERT et y note les envois. Il ne contient AUCUNE donnée personnelle : ni nom, ni téléphone, ni e-mail.

## Ce qu'un agent peut faire

- `creer_page_destination` (écriture) : `entreprise_id`, `titre`, `accroche`, `offre_type` (`guide_gratuit` ou `rappel_conseiller`), `offre_intitule`,
  `offre_description`, `responsable` (organisation responsable du traitement), `contact_confidentialite` (où retirer son consentement). Textes simples,
  bornés, nettoyés (caractères invisibles et de direction retirés). Aucun HTML, script, image ou lien n'existe dans le schéma ; ce que l'agent écrit
  est toujours rendu échappé. Le texte de la case de consentement est construit PAR LE SERVEUR à partir de ces champs, figé avec la page et stocké
  comme preuve ; la case n'est jamais pré-cochée.
- `lister_pages`, `statistiques_page` (lecture) : vues, visiteurs, visites, vues de la page de remerciement (Umami) et envois enregistrés. Si Umami est
  indisponible, la réponse le dit et ne donne que les envois.

## Ce que fait un envoi de formulaire

1. Contrôles : hôte autorisé (anti rebond DNS), même origine, type de contenu, taille (8 Kio), jeton CSRF signé (HMAC, lié à la page et à un cookie
   `HttpOnly; SameSite=Strict`, usage unique, valable de 2 s à 2 h), champ caché « piège à robots », limite de débit (5 envois par 10 min et par adresse,
   60 par heure et par page), validation des champs, case de consentement cochée.
2. Création du prospect par `POST /api/plugins/atelier.marketing-ia/api/prospects/particuliers` : origine `formulaire_entrant` (« formulaire »),
   preuve de consentement (date, texte exact accepté, source = adresse de la page, canaux autorisés, responsable nommé, référence « envoi · page · IP tronquée ·
   numéro de téléphone donné par la personne »), adresse IP tronquée (/24 pour IPv4, /48 pour IPv6).
3. Tâche pour l'agent Prospection (API native de Paperclip) : « Rappeler sous 24 h », créneau préféré, échéance, sans aucune coordonnée.
   Si la tâche échoue, le prospect reste créé (il est signalé dans le journal du serveur de pages).
4. Si le dépôt échoue, la personne voit « vos informations n'ont pas été enregistrées », le jeton est libéré et elle peut renvoyer le même formulaire.

Les coordonnées ne sont jamais écrites dans une tâche, un journal ou le magasin des pages.

## En-têtes et protections

CSP `default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`
(aucun script ni style en ligne), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP/CORP, `X-Frame-Options: DENY`,
`X-Robots-Tag: noindex, nofollow` (désactivable par `PAGES_INDEXABLE=oui` quand une page est publiée), `Cache-Control: no-store`. Le script Umami est servi par
le même serveur (`/_s/script.js`) et la collecte relayée (`/_s/api/send`, refusée si elle ne vise pas le site des pages) : Umami n'est jamais exposé.

## Installation

```bash
cd ~/Projets/atelier-marketing-ia/passerelle && npm run build
umask 077; openssl rand -hex 32 > ~/.config/atelier/pages-secret; chmod 600 ~/.config/atelier/pages-secret
install -m 644 ~/Projets/atelier-marketing-ia/scripts/systemd/atelier-pages.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now atelier-pages
curl -s http://127.0.0.1:3195/sante          # {"ok":true}
```

Passerelle : ajouter `captation` à `PASSERELLE_SERVICES_REELS` dans `instance/passerelles/3190.env`, puis `scripts/passerelles.sh arreter 3190 && scripts/passerelles.sh demarrer 3190`.
Réglages facultatifs de la passerelle : `PASSERELLE_PAGES_BASE`, `PASSERELLE_PAGES_URL` (adresse rendue aux agents), `PASSERELLE_PAGES_UMAMI_FICHIER`
(`~/.config/atelier/umami-admin.env` par défaut). Réglages du serveur de pages (`~/.config/atelier/pages.env`, chemins et adresses seulement) :
`PAGES_PORT`, `PAGES_URL_PUBLIQUE`, `PAGES_HOTES_AUTORISES`, `PAGES_COOKIE_SECURISE`, `PAGES_CONFIANCE_PROXY`, `ATELIER_API`, `ATELIER_CLE_BOARD_FICHIER`
(jeton d'API « board » si l'instance n'est pas en `local_trusted`).

## Publier une page (décision humaine, non faite par l'atelier)

Le serveur n'écoute que sur la boucle locale. Pour la rendre publique : un tunnel ou un proxy inverse HTTPS (par exemple Cloudflare Tunnel ou Caddy) qui vise
`127.0.0.1:3195` et ne transmet QUE `/p/*`, `/_a/*` et `/_s/*`. Puis, dans `~/.config/atelier/pages.env` :

```
PAGES_URL_PUBLIQUE=https://pages.exemple.be
PAGES_HOTES_AUTORISES=pages.exemple.be
PAGES_COOKIE_SECURISE=oui
PAGES_CONFIANCE_PROXY=oui        # seulement si le proxy pose X-Forwarded-For lui-même
PAGES_PROXY_SAUTS=1                # nombre de mandataires de confiance devant le serveur (1 par défaut : un tunnel ou Caddy seul)
```

`X-Forwarded-For` se lit de droite à gauche : chaque mandataire ajoute à droite l'adresse qu'il a vue, la valeur de gauche est fournie par le visiteur et n'est
jamais retenue. L'adresse retenue (limites de débit, IP tronquée gardée comme preuve de consentement) est celle à `PAGES_PROXY_SAUTS` rangs depuis la droite ; liste
trop courte ou valeur qui n'est pas une adresse IP : adresse de la connexion. Limites : seuls les envois VALIDES (jeton, délai, formulaire) consomment les plafonds
par adresse (5 en 10 min) et par page (60 par heure) ; les POST refusés ont leur propre plafond par adresse (30 en 10 min, réponse 429) qui ne bloque jamais un envoi valide.

et dans `instance/passerelles/3190.env` : `PASSERELLE_PAGES_URL=https://pages.exemple.be` (l'adresse rendue aux agents). Avant publication : relire le texte de
consentement de la page, vérifier que l'adresse de `contact_confidentialite` est lue, et que le responsable du traitement a une politique de confidentialité
(RGPD : information de la personne, durée de conservation, droit de retrait traité par l'adresse indiquée).

## Tests

- `passerelle/tests/pages/` : injection HTML et script (reste du texte), consentement exigé, CSRF (absent, falsifié, autre page, autre cookie, expiré, rejeu),
  piège à robots (champ caché, délai), limite de débit, en-têtes, hôte étranger, panne du dépôt, contrat du corps envoyé validé par le VRAI schéma du plugin.
- `passerelle/tests/reel-captation/` : outils (catalogue, création, lecture, statistiques, repli sans Umami) et intégration réelle sur Umami 3.4.0
  (visite relayée, formulaire, statistiques lues ; ignorée si `umami-admin.env` est absent).
- `plugin-atelier/tests/captation-formulaire.spec.ts` : vrai serveur de pages + vrai dépôt + VRAIE route `prospects.particuliers.enregistrer` (aiguillage et
  services réels, base en mémoire, entreprise en mode réel) : prospect, preuve de consentement, coordonnées chiffrées, tâche de rappel.
