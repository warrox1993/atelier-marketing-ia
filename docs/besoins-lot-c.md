# Besoins de l'interface (lot C) envers l'intégrateur (lot A)

Date : 15/10/2026. Rédigé par le lot C. Aucun contrat n'a été modifié par le lot C :
chaque besoin ci-dessous est contourné ou affiché « indisponible » dans l'interface en
attendant une décision de l'intégrateur.

Suivi (15/10/2026, 15:20) : le lot A a traité B-1, B-5, B-6, B-7 et B-8 dans le commit
`81ba356` ; l'interface s'en sert désormais (code `[code]` lu par `classerErreur`, libellés
`LIBELLES_EVENEMENTS` du contrat, action `atelier.planification` dans le calendrier).
B-4 est levé (cause côté lot C). B-2 est traité le 15/10/2026 (rejet = annulation native
faite par le worker dans la même opération, `docs/contrats.md` §11). Reste ouvert, non
bloquant : B-3 (pause, limite du SDK).

## B-1 : code d'erreur perdu entre le worker et l'interface

- Constat : le pont de l'hôte ne transmet à l'interface que le **message** d'une erreur
  du worker, avec le code générique `WORKER_ERROR`
  (`paperclip/packages/plugins/sdk/src/worker-rpc-host.ts:1567-1574`,
  `paperclip/server/src/routes/plugins.ts:1284-1324`). Le `code` d'`ErreurAtelier`
  (`acces_refuse`, `non_implemente`, `revision_perimee`…) n'arrive pas au navigateur.
- Contournement actuel : `plugin-atelier/src/ui/format.ts` (`classerErreur`) déduit la
  catégorie (accès refusé, indisponible, introuvable, entrée refusée) de mots stables des
  messages français. Fragile si un message change.
- Demande : un moyen stable, par exemple préfixer le message des erreurs d'action et de
  données par le code (`[acces_refuse] …`), ou une clé de données qui renvoie
  `{ erreur, code }` au lieu de lever.

## B-2 : décision humaine en deux appels (conforme au contrat §6 bis)

- Le contrat v1.1 (`docs/contrats.md` §6 bis, 15/10/2026) prévoit deux appels :
  `atelier.decision` puis `PATCH /api/issues/:id` (`done` pour approuver, `in_progress`
  pour une correction). L'interface fait exactement cela (`src/ui/hote.ts`,
  `transitionTache`) ; un refus du serveur sur le second appel est affiché avec un renvoi
  vers la tâche native.
- Reste à préciser : l'effet natif de « rejeter » (l'interface ne touche pas la tâche et le
  dit). Suggestion, sans urgence : faire la transition dans le worker, dans la même
  opération que la décision, pour éviter une décision enregistrée sans transition.

## B-3 : pause et reprise de campagne

- `atelier.campagne.pause` et `atelier.campagne.reprendre` renvoient « non implémenté »
  (`services.ts`, `pauseNonDisponible`, et contrat §6 bis). L'interface affiche les deux
  boutons désactivés avec cette raison (`RAISON_PAUSE` dans `src/ui/vues/campagnes.tsx`).
  Rien à faire tant que le SDK n'expose pas la pause d'un projet.

## B-4 : (levé) scénario B bloqué sur l'instance d'essai du lot C

- Constat initial : le producteur recevait HTTP 403 (« Status-only recovery runs cannot
  update issue documents… »). Cause trouvée : l'instance 3140 exécutait un worker du plugin
  ANCIEN, la surveillance des fichiers n'ayant pas rechargé le worker après reconstruction
  (constat identique du lot A dans `REPRISE.md`). Après `POST /api/plugins/atelier.marketing-ia/disable`
  puis `/enable`, le scénario B passe : « RÉSUMÉ B : 15 OK, 0 ÉCART »
  (`instance/scenarios/B-20261015T130644Z.json`). Rien à faire côté lot A.
- Pour le test de décision, `tests/e2e/atelier/preparer_dossier.py` rejoue le début du
  scénario B et s'arrête à l'étape humaine.

## B-5 : compétences réellement transmises

- `atelier.equipe` renvoie toujours `source: "configuration"` sans empreinte. L'interface
  l'affiche honnêtement (« configurées, pas encore vues dans un run ») mais le cahier §12
  demande les compétences **effectivement** utilisées : il faut la source `dernier_run`.

## B-6 : libellés de la chronologie

- `atelier.chronologie` renvoie le type brut du journal comme libellé (`porte.refusee`,
  `revue.echouee`…). Contournement : `EVENEMENTS_JOURNAL` (`src/ui/format.ts`) traduit les
  types connus le 15/10/2026 ; un type nouveau s'affiche brut. Demande : un libellé français
  par événement côté serveur, ou la liste des types dans le contrat.

## B-7 : calendrier

- Aucune clé d'action ne permet à l'humain de proposer ou déplacer une date
  (`tache.planification` n'existe qu'en route agent) ; `publicationProgrammee` vaut
  toujours `null` (aucun connecteur de diffusion). L'interface affiche donc « non
  programmée » et n'offre pas de planification manuelle.

## B-8 : horodatages hors contrat

- `atelier.campagne` (et `atelier.campagnes`) renvoient `creeLe` sous la forme texte de
  PostgreSQL (`"2026-10-15 14:23:59.691232+02"`), alors que le contrat `Horodatage` exige
  l'ISO 8601 (`z.iso.datetime({ offset: true })`). Constaté sur l'instance 3140.
- Contournement : `enDate` (`src/ui/format.ts`) lit aussi cette forme. Demande : sérialiser
  en ISO côté worker (`new Date(x).toISOString()`).
