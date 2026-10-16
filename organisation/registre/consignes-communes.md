## Faits du client : la fiche d'abord, jamais de mémoire

Avant tout travail, lis la **fiche du client** (marque de l'atelier : identité, entités et leurs
identifiants BCE et FSMA, marques, établissements, zones, segments, offres, ton, informations manquantes) :

```
curl -sS --variable %PAPERCLIP_API_URL --variable %PAPERCLIP_API_KEY --variable %PAPERCLIP_COMPANY_ID --expand-header 'Authorization: Bearer {{PAPERCLIP_API_KEY}}' --expand-url '{{PAPERCLIP_API_URL}}/api/plugins/atelier.marketing-ia/api/marque?companyId={{PAPERCLIP_COMPANY_ID}}'
```

et la liste des documents disponibles : `…/api/plugins/atelier.marketing-ia/api/connaissances/titres?companyId={{PAPERCLIP_COMPANY_ID}}`.

- Identifiants légaux (BCE, FSMA, TVA, catégorie) : recopiés **uniquement** depuis les entités de la
  fiche ; un numéro BCE n'est jamais un numéro FSMA. Une page du client qui affiche autre chose est un
  écart à signaler, pas une source.
- Une marque ou une entité de la fiche existe, même si une page ne la cite pas.
- Recherche dans les connaissances : questions courtes par mots-clés, au moins trois reformulations avant
  d'écrire qu'une information manque ; chaque chiffre ou condition d'offre porte son `connaissance://…`.
- Tout livrable contient une courte **table des faits** (fait, source). La porte refuse un identifiant
  légal incohérent avec la fiche.
- Pour signaler un identifiant faux vu sur une page, écris dans la MÊME phrase le bon identifiant de
  la fiche : « La page affiche 0123.456.789 comme numéro FSMA, alors que le FSMA de la fiche est
  012345. » Sans le bon numéro, la porte refuse la phrase.

## Appeler l'API de Paperclip

Ton seul accès au shell est l'autorisation `Bash(curl *)`, sans question possible : une commande qui
sort de la forme ci-dessous est refusée sans être exécutée. Ces règles priment sur tout exemple écrit
avec `$PAPERCLIP_…` ailleurs (consignes, compétences, message de réveil) : transcris-le sous cette forme.

- Une seule commande `curl` par appel : jamais `;`, `|`, `&&`, `||`, `>`, `$( )` ni `<<EOF`.
- Jamais de `$VARIABLE` : une variable d'environnement entre par `--variable %NOM` et s'écrit
  `{{NOM}}` dans `--expand-url` ou `--expand-header` (variables : `PAPERCLIP_API_URL`, sans `/api`,
  `PAPERCLIP_API_KEY`, `PAPERCLIP_RUN_ID`, `PAPERCLIP_COMPANY_ID`).
- Le corps JSON va en ligne dans `--data-raw '…'`, sans aucune apostrophe droite dans le texte
  (écris l'apostrophe typographique ’). Corps long, si tu as l'outil Write : écris le JSON dans un
  fichier de ton espace de travail, puis `--data-binary @<chemin absolu du fichier>`.
- `-w '\nHTTP %{http_code}\n'` affiche le code de retour ; `-o <fichier>` remplace toute redirection.

Lire une tâche (même forme pour tout `GET`, par exemple `…/taches/<issueId>/contexte` du plugin) :

```
curl -sS --variable %PAPERCLIP_API_URL --variable %PAPERCLIP_API_KEY --expand-header 'Authorization: Bearer {{PAPERCLIP_API_KEY}}' --expand-url '{{PAPERCLIP_API_URL}}/api/issues/<issueId>'
```

Poster un commentaire :

```
curl -sS -w '\nHTTP %{http_code}\n' -X POST --variable %PAPERCLIP_API_URL --variable %PAPERCLIP_API_KEY --variable %PAPERCLIP_RUN_ID --expand-header 'Authorization: Bearer {{PAPERCLIP_API_KEY}}' --expand-header 'X-Paperclip-Run-Id: {{PAPERCLIP_RUN_ID}}' -H 'Content-Type: application/json' --expand-url '{{PAPERCLIP_API_URL}}/api/issues/<issueId>/comments' --data-raw '{"body":"Texte du commentaire."}'
```

Changer le statut (avec un commentaire facultatif) :

```
curl -sS -w '\nHTTP %{http_code}\n' -X PATCH --variable %PAPERCLIP_API_URL --variable %PAPERCLIP_API_KEY --variable %PAPERCLIP_RUN_ID --expand-header 'Authorization: Bearer {{PAPERCLIP_API_KEY}}' --expand-header 'X-Paperclip-Run-Id: {{PAPERCLIP_RUN_ID}}' -H 'Content-Type: application/json' --expand-url '{{PAPERCLIP_API_URL}}/api/issues/<issueId>' --data-raw '{"status":"done","comment":"Livrable déposé."}'
```

Déposer le livrable comme document de la tâche (`<cle>` : celle que nomme ta tâche, sinon `livrable` ;
pour remplacer un document existant, `baseRevisionId` reçoit son `latestRevisionId`, lu par
`GET …/api/issues/<issueId>/documents/<cle>`) :

```
curl -sS -w '\nHTTP %{http_code}\n' -X PUT --variable %PAPERCLIP_API_URL --variable %PAPERCLIP_API_KEY --variable %PAPERCLIP_RUN_ID --expand-header 'Authorization: Bearer {{PAPERCLIP_API_KEY}}' --expand-header 'X-Paperclip-Run-Id: {{PAPERCLIP_RUN_ID}}' -H 'Content-Type: application/json' --expand-url '{{PAPERCLIP_API_URL}}/api/issues/<issueId>/documents/<cle>' --data-raw '{"title":"Titre","format":"markdown","body":"# Titre\n\nTexte.","baseRevisionId":null}'
```

Déposer une réponse signée d'un outil (corps décrit dans tes consignes : `service`, `outil`,
`arguments`, `reponse`), route `/prospects` pour la prospection, `/donnees-connexion` pour les
autres rôles ; la réponse brute est longue, donc passe par un fichier :

```
curl -sS -w '\nHTTP %{http_code}\n' -X POST --variable %PAPERCLIP_API_URL --variable %PAPERCLIP_API_KEY --variable %PAPERCLIP_RUN_ID --expand-header 'Authorization: Bearer {{PAPERCLIP_API_KEY}}' --expand-header 'X-Paperclip-Run-Id: {{PAPERCLIP_RUN_ID}}' -H 'Content-Type: application/json' --expand-url '{{PAPERCLIP_API_URL}}/api/plugins/atelier.marketing-ia/api/taches/<issueId>/donnees-connexion' --data-binary @<chemin absolu du fichier JSON>
```

Une commande refusée ne se contourne pas par un autre outil : corrige-la selon ces règles. Un code
HTTP 4xx vient du serveur (lis son message), pas de la syntaxe.
