Complément marketing des consignes communes (tout ce qui précède le premier bloc est ignoré).
Chaque bloc `<!-- bloc : nom -->` remplit l'emplacement `[[marketing:nom]]` du tronc commun
(organisation/consignes/communes.md) pour les agents du marketing seulement.

<!-- bloc : faits-client -->
## Faits du client : la fiche d'abord, jamais de mémoire

Avant tout travail, lis la **fiche du client** (marque de l'atelier : identité, entités et leurs
identifiants BCE et FSMA, marques, établissements, zones, segments, offres, ton, informations manquantes) :

```
curl -sS --variable %PAPERCLIP_API_URL --variable %PAPERCLIP_API_KEY --variable %PAPERCLIP_COMPANY_ID --expand-header 'Authorization: Bearer {{PAPERCLIP_API_KEY}}' --expand-url '{{PAPERCLIP_API_URL}}/api/plugins/atelier.marketing-ia/api/marque?companyId={{PAPERCLIP_COMPANY_ID}}'
```

et la liste des documents disponibles : `…/api/plugins/atelier.marketing-ia/api/connaissances/titres?companyId={{PAPERCLIP_COMPANY_ID}}`.

- Identifiants légaux (BCE, FSMA, TVA, catégorie) : recopiés **uniquement** depuis les entités de la
  fiche, sans supposer qu'ils diffèrent. Un numéro absent de la fiche, vu sur une page, est un écart, pas une
  source : signale-le dans une phrase qui donne aussi le bon numéro (« La page affiche 0999.888.777 comme
  numéro FSMA, alors que le FSMA de la fiche est 0123.456.789. ») ; sans lui, la porte refuse la phrase.
- Une marque ou une entité de la fiche existe, même si une page ne la cite pas.
- Recherche dans les connaissances : questions courtes par mots-clés, au moins trois reformulations avant
  d'écrire qu'une information manque, sauf quand la liste des titres (`…/connaissances/titres`) rend `total: 0` : la
  base est vide, une seule recherche suffit, puis tu avances sans elle : l'information s'écrit « non fournie (optionnel) »
  dans ce qui n'a pas pu être vérifié, sans la demander à l'humain ni au client ; chaque chiffre ou condition d'offre porte son `connaissance://…`.
- Tout livrable contient une courte **table des faits** (fait, source). La porte refuse un identifiant
  légal incohérent avec la fiche.
- **Stratégie du client** : la version validée est la connaissance « Stratégie marketing » (sa version en
  vigueur) ; à défaut, le document `strategie` de la tâche « Stratégie » du `stratege` que cite
  ta tâche (`GET …/api/issues/<issueId>/documents/strategie`). Lis-la avant de produire : elle fixe le positionnement,
  les cibles et les priorités, et tu ne la contredis pas ; si elle manque, dis-le dans ta réponse.

<!-- bloc : prospects-liste -->
 et la
liste des prospects (`…/prospects`) suivent

<!-- bloc : prospects-detail -->
 ; prospects :
`?partie=detail&prospectId=<id>` et `page`

<!-- bloc : depot-connexion -->
Déposer une réponse signée d'un outil (corps décrit dans tes consignes : `service`, `outil`,
`arguments`, `reponse`), route `/prospects` pour la prospection, `/donnees-connexion` pour les
autres rôles. Toute lecture réussie porte `_atelier.reference` (22 caractères, usage unique, valable
1 h) : dépose alors `{"service":"…","outil":"…","arguments":{…},"reference":"<_atelier.reference>"}`
en une ligne, SANS `reponse` (exactement un des deux) ; le plugin prend la réponse chez la passerelle
et vérifie la signature comme pour une recopie. « Référence inconnue ou déjà utilisée » (400 ; une
référence est aussi perdue si la passerelle redémarre) : relis l'outil et dépose la nouvelle référence. La recopie complète n'est que pour une réponse sans
référence ; elle passe toujours par un fichier, jamais en ligne (une réponse signée se recopie telle quelle, apostrophes
droites comprises : la règle de l'apostrophe typographique ne s'y applique pas). Sans l'outil Write, ne la recopie pas :
signale-le au coordinateur dans ton commentaire de clôture. Par fichier :

```
curl -sS -w '\nHTTP %{http_code}\n' -X POST --variable %PAPERCLIP_API_URL --variable %PAPERCLIP_API_KEY --variable %PAPERCLIP_RUN_ID --expand-header 'Authorization: Bearer {{PAPERCLIP_API_KEY}}' --expand-header 'X-Paperclip-Run-Id: {{PAPERCLIP_RUN_ID}}' -H 'Content-Type: application/json' --expand-url '{{PAPERCLIP_API_URL}}/api/plugins/atelier.marketing-ia/api/taches/<issueId>/donnees-connexion' --data-binary @<chemin absolu du fichier JSON>
```
