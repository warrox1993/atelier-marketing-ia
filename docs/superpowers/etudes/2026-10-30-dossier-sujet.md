# Étude : un « dossier du sujet » sourcé avant toute image ou vidéo (30/10/2026)

Étude seule : aucun code modifié, aucun appel à l'instance 3100 ni à la passerelle, aucun run d'agent.
Demande de l'opérateur : que l'agent qui crée une image ou une vidéo sache exactement de quoi on parle, dans les moindres
détails, grâce au travail commun des agents. Cas de test : une image et une vidéo humoristique de 15 s avec dialogue
sur un jeu vidéo d'un éditeur tiers (« World of Warcraft: Forever », classe du mage Arcane).

## Verdict

- Aujourd'hui, rien n'oblige un agent à connaître le sujet avant de fabriquer : `fabriquer_image` et `fabriquer_video`
  ne vérifient que le droit de l'agent, le schéma et le quota. Un rédacteur peut fabriquer sans aucune source (prouvé
  ci-dessous).
- L'information se perd entre tâches : les sources sont rangées par tâche, le contexte d'une tâche ne les montre pas,
  et la consigne du rédacteur ne lui dit jamais de lire la note de la veille.
- Recommandation : un document natif `dossier-sujet` produit UNE fois par la `veille` (sous-tâche du coordinateur),
  et une garde déterministe dans `deposer()` du plugin qui refuse image et vidéo si la tâche du run n'a pas accès à un
  dossier valide (structure complète, faits rattachés à des sources réellement lues). Aucun nouveau service, aucune
  nouvelle route de stockage.

## 1. Chemin actuel de l'information (prouvé)

| Étape | Ce qui se passe | Preuve |
| --- | --- | --- |
| Plan | Le coordinateur écrit le document `plan` (sous-tâches, sources et limites, table des faits) | `organisation/agents/coordinateur/AGENTS.md:72-80` |
| Recherche | La `veille` a `WebSearch` ; elle lit une page par `POST /taches/:issueId/sources` et livre une note de marché comme document de SA tâche | `organisation/registre/agents.json:258` ; `organisation/agents/veille/AGENTS.md:27-29`, `:322-327` |
| Stockage des sources | Chaque lecture est enregistrée dans la table `sources` avec l'`issueId` de la tâche qui a lu (extrait de 4000 caractères, empreinte, statut d'accès, mode) | `plugin-atelier/src/serveur/services.ts:1148-1166` ; `plugin-atelier/src/contrats/identifiants.ts:58` |
| Lecture par le rédacteur | `GET /taches/:issueId/contexte` rend brief de campagne, exigences, livrable, revues, constats, boîte ; pas les sources, ni celles des tâches voisines | `plugin-atelier/src/serveur/services.ts:598-640` |
| Sources d'une tâche | Lues uniquement par `issue_id` exact | `plugin-atelier/src/serveur/base.ts:789-791`, `:819-821` |
| Consigne du rédacteur | « Ce que tu reçois : le brief, les exigences, la charte, les sources validées » ; aucune mention de la veille ni de sa note (`grep -n veille` : 0 ligne) | `organisation/agents/contenus/AGENTS.md:35-38` |
| Fabrication | `deposer()` : agent autorisé, schéma valide, tâche du run FACULTATIVE, quota, écriture du fichier ; aucune lecture de source ni de document | `plugin-atelier/src/serveur/fabrique-outils.ts:468-516` (tâche facultative : `:480`, `:386`) |
| Schéma image | `format`, `gabarit`, `champs`, `charte` seulement | `plugin-atelier/src/serveur/fabrique-outils.ts:346-361` |
| Schéma vidéo | scènes `texte_voix`, `voix`, `visuel` ; rien sur le sujet | `plugin-atelier/src/serveur/fabrique-outils.ts:272-310` |
| Diffusion | porte franchie, décision humaine, conformité si module actif, pas de donnée de démonstration en réel, provenance IA du travail | `plugin-atelier/src/serveur/services.ts:1314-1350` |

Où elle se perd :

1. Rupture entre tâches : la note et les sources de la veille sont attachées à la tâche de la veille
   (`base.ts:790`) ; le rédacteur ne les voit que si le coordinateur recopie l'information dans la description de
   sa sous-tâche (texte libre, sans contrôle). `GET …/dossier?partie=sources` existe
   (`plugin-atelier/src/contrats/routes.ts:28`) mais il faut connaître l'identifiant de la bonne tâche, et rien ne le donne.
2. Le rédacteur `contenus` n'a ni `WebSearch` ni `WebFetch` (`organisation/registre/agents.json:739-745`) : il peut
   lire une URL qu'il connaît (`contenus/AGENTS.md:115-118`) mais pas chercher. Sans dossier, il écrit de mémoire.
3. Les règles « ce qui n'est pas sourcé est marqué à confirmer » et « un chiffre vérifié et sourcé »
   (`contenus/AGENTS.md:50-51`, `:71`) sont des consignes, jamais vérifiées par le plugin.
4. Droits des marques tierces : la liste de conformité couvre l'IA, les voix, les visages, la publicité trompeuse et
   la comparaison (`organisation/skills/conformite-publicite-ia/SKILL.md:3`, `:42-43`), mais rien sur l'usage du nom,
   du logo ou des personnages d'un éditeur tiers. Pour le cas de test, c'est le risque principal.

Réponse à la question « peut-on fabriquer sans source ? » : oui. Un run de `contenus` (image) ou de
`reseaux-sociaux` (image, vidéo) qui envoie une demande conforme au schéma passe `deposer()` sans qu'aucune source,
aucune note ni aucun document ne soit lu (`fabrique-outils.ts:476-516`). La porte de diffusion vérifie ensuite des
approbations, pas la justesse du sujet (`services.ts:1314-1350`).

Deux écarts de faits avec la demande initiale :

- `fabriquer_video` est interdit à `contenus` (`organisation/registre/agents.json:745`) ; seul `reseaux-sociaux` l'a
  (`agents.json:976`, `organisation/agents/reseaux-sociaux/AGENTS.md:68`). `fabriquer_image` : `contenus` et `reseaux-sociaux`.
- La fabrique ne dessine pas : l'image est du texte composé sur 4 gabarits (`plugin-atelier/src/contrats/fabrique-outils-schemas.ts:41`,
  `contenus/AGENTS.md:69-70`), la vidéo enchaîne des scènes texte et voix de synthèse (2 voix permises,
  `organisation/skills/script-video-publicitaire/SKILL.md:27`). Un dialogue à deux voix est possible ; un mage
  dessiné ne l'est pas (le fond IA est coupé, `conformite-publicite-ia/SKILL.md:60`). Le dossier rendra le texte juste,
  il ne rendra pas l'image figurative.

## 2. Qui d'autre peut apporter de l'information, et par quel mécanisme

| Apport | Département et agent | Mécanisme existant | Preuve |
| --- | --- | --- | --- |
| Faits sur le produit, vocabulaire du public, références que la communauté reconnaît | Marketing : `veille` (WebSearch, compétences `recherche-sourcee`, `veille-medias`, `veille-publications-videos`) | sous-tâche du coordinateur, même service, pas de liaison | `agents.json:258` ; `organisation/skills/recherche-sourcee/SKILL.md:68-72` |
| Cible, angle, ce que la marque veut obtenir | Marketing : `stratege` (document `strategie`) | lecture du document de la tâche citée | `veille/AGENTS.md:157-160` |
| Ton, mentions, interdits de la marque | fiche du client (route `marque`) et compétence `charte-marque` | lecture par l'agent, déjà prescrite | `reseaux-sociaux/AGENTS.md:150-154` |
| Codes des réseaux, formats | Marketing : `reseaux-sociaux` (WebSearch) | déjà producteur de la vidéo | `agents.json:971` |
| Droits, mentions IA, comparaison | Marketing : `conformite-publicitaire` (WebSearch) | revue sous porte, déjà exigée à la diffusion si un module est actif | `services.ts:1328-1331` |
| Vérification des sources citées | Marketing : `relecteur` (`recherche-sourcee`) | revue sous porte | `recherche-sourcee/SKILL.md:1-3` |
| Lecture juridique d'un usage de marque tierce | Service `juridique` (« première lecture, aucun avis engageant ») | `liaison.demander` par le coordinateur ; service sensible : approbation humaine avant départ | `organisation/registre/services.json:101` ; `organisation/skills/protocole-inter-coordinateurs/SKILL.md:44-46` ; `organisation/registre/routes-agents.md:658-672` |
| Méthode de preuve la plus stricte de l'usine | `observatoire` : affirmations avec statut, niveau de confiance et extrait exact retrouvé dans l'instantané | routes `/obs/*`, limitées à ses rôles | `routes-agents.md:719-745` ; `plugin-atelier/src/serveur/lecture-web.ts:17-27` |

L'Observatoire n'est pas une source de contenu pour ce cas : son périmètre est la veille de l'IA
(`services.json:910-916`), ses chapitres sont fixés pour des projets d'IA (`routes-agents.md:731`), ses routes sont
réservées à ses rôles (`lecture-web.ts:24-25`) et toute liaison vers lui attend un humain (`protocole-inter-coordinateurs/SKILL.md:44-46`).
Sa règle « extrait exact retrouvé dans la source » est en revanche la bonne idée à reprendre, à moindre coût.

La liaison (au plus 10 extraits de 4000 caractères, `routes-agents.md:668-672`) sert à une question ponctuelle d'un
autre service ; elle ne transporte pas un dossier complet (`protocole-inter-coordinateurs/SKILL.md:54`). Le dossier
doit donc vivre dans le service marketing, là où se fabriquent image et vidéo.

## 3. Options comparées

| | A. Consignes seules | B. Document `dossier-sujet` + garde dans la fabrique (recommandée) | C. Dossier tenu par l'Observatoire |
| --- | --- | --- | --- |
| Principe | compétence `dossier-sujet`, plan du coordinateur et consignes des producteurs | la veille écrit le document natif `dossier-sujet` ; `deposer()` refuse image et vidéo sans dossier valide accessible depuis la tâche du run | sous-tâche par liaison vers l'Observatoire, affirmations `/obs/affirmations` |
| Déterministe | non : repose sur l'obéissance des agents | oui : refus du plugin, testé | oui, mais hors périmètre |
| Nouveau service ou route de stockage | non | non (documents natifs, table `sources`, relations `blocks` déjà là) | extension du schéma Observatoire (chapitres, rôles) |
| Délai | nul | une sous-tâche veille avant la fabrication | liaison avec approbation humaine, 72 h au plus |
| Jetons | faible | une recherche par sujet, réutilisée par tous les producteurs et relecteurs | élevé (collecte, instantanés, deux services) |
| Affaiblit quelque chose | non | non : ajoute un refus, ne retire aucun contrôle | non, mais détourne un service public |

A ne suffit pas : l'usine a déjà ces consignes (`contenus/AGENTS.md:50-51`) et rien ne les garantit. C est trop lourd
et hors sujet. B est la plus petite option qui empêche réellement de fabriquer à l'aveugle.

## 4. Recommandation détaillée (option B)

### 4.1 Contenu minimal du dossier (document `dossier-sujet`, Markdown, rubriques `##` fixes)

1. `## Sujet` : ce qu'est le produit en 3 à 5 phrases (nature, éditeur, date de référence du dossier, version concernée).
2. `## Faits vérifiés` : tableau `| Fait | Source | Extrait |`, au moins 3 lignes ; `Source` = URL lue par
   `POST /taches/:issueId/sources` ou `connaissance://…` ; `Extrait` = phrase exacte de la source (20 caractères au moins).
   Ce qui n'est pas prouvé va dans une ligne « à confirmer », jamais dans ce tableau.
3. `## Vocabulaire et références du public` : termes, noms propres, mèmes et usages que la communauté reconnaît,
   chacun avec sa source ; pour le cas de test, ce que fait la classe et comment ses joueurs en parlent.
4. `## Ton` : registre voulu (ici humoristique), ce qui fait rire ce public, rappel de la charte du client.
5. `## À ne pas dire` : faits faux répandus, promesses interdites, sujets sensibles, comparaisons à éviter.
6. `## Droits` : marques, logos, captures et personnages de l'éditeur tiers interdits ou permis, avec la source de la
   règle (politique de l'éditeur si elle existe, sinon « à confirmer » et liaison juridique) ; mentions IA à porter.

### 4.2 Qui le produit, qui le lit

- Le coordinateur ajoute au plan, pour toute demande d'image ou de vidéo, une sous-tâche « Dossier du sujet » confiée
  à la `veille`, et crée la sous-tâche de fabrication bloquée par elle (`blockedByIssueIds`, mécanisme déjà décrit,
  `veille/AGENTS.md:290`).
- La `veille` cherche (WebSearch), lit chaque page par `…/sources` (la source est enregistrée sur sa tâche), puis
  dépose le document `dossier-sujet` sur SA tâche (`veille/AGENTS.md:322-327`). Le `stratege` n'est sollicité que si
  aucune stratégie n'existe.
- `contenus` et `reseaux-sociaux` lisent le dossier une fois (`GET …/api/issues/<id>/documents/dossier-sujet`) ;
  `conformite-publicitaire` et `relecteur` relisent la même révision sous porte. Personne ne refait la recherche.
- Rubrique `Droits` à « à confirmer » sur une marque tierce : le coordinateur ouvre une liaison vers `juridique`
  (approbation humaine, déjà imposée par le protocole) ; la fabrication reste permise, la diffusion attend la revue.

### 4.3 Où il est stocké

Document natif de la tâche de la veille (aucune route nouvelle). Le plugin le retrouve sans que l'agent le désigne,
dans cet ordre : tâche du run, tâches qui la bloquent (`public.issue_relations` type `blocks`, requête déjà écrite
`plugin-atelier/src/serveur/base.ts:239`), tâche parente (`issue.parentId`, déjà lu `plugin-atelier/src/serveur/chaine.ts:183`).
Lecture du document : `ctx.issues.documents.get` (déjà utilisé, `plugin-atelier/src/serveur/services-faits.ts:309`).

### 4.4 Contrôle déterministe

Dans `deposer()` (`fabrique-outils.ts:468`), pour `image` et `video` seulement, après la validation du schéma
(`:478`) et AVANT la réservation du quota (`:492`), pour qu'un refus ne consomme rien :

- tâche du run introuvable : refus (fermé par défaut ; aujourd'hui elle est facultative, `:480`) ;
- aucun `dossier-sujet` sur la tâche, ses bloquantes ou sa parente : refus « Aucun dossier du sujet : demander au
  coordinateur la sous-tâche Dossier du sujet (veille) » ;
- dossier trouvé : fonction pure `controlerDossierSujet(corps, sources, mode)` qui exige les 6 rubriques non vides,
  au moins 3 faits, chaque `Source` soit `connaissance://…`, soit une URL présente dans `sources` de la tâche qui porte
  le dossier (`base.sourcesPourGarde`, `base.ts:789`) avec statut `accessible` et, en mode réel, `mode = reel`
  (même règle que `verifierDonneesDemo`, `plugin-atelier/src/serveur/regles-donnees.ts:510-514`) ;
- extrait exact : vérifié contre l'extrait stocké de la source (4000 caractères, `identifiants.ts:58`) ; non
  retrouvé : signalé dans la réponse et le journal, non bloquant (l'extrait stocké est tronqué, un blocage rejetterait
  des faits vrais situés plus loin dans la page) ;
- succès : la référence `{ issueId, revisionId }` du dossier entre dans le fichier du travail (à côté de `tache`,
  `:481-490`) et dans la réponse de l'outil ; les relecteurs voient ainsi quelle révision a servi.

Complément de lecture, sans coût de recherche : `contexteComplet` (`services.ts:598`) ajoute `dossierSujet`
(identifiant de tâche, révision, liste des rubriques) pour que le producteur sache où lire, une seule fois.

### 4.5 Fichiers à toucher

| Fichier | Changement |
| --- | --- |
| `plugin-atelier/src/serveur/dossier-sujet.ts` (nouveau, petit) | `controlerDossierSujet` pure : rubriques, tableau des faits, sources, extraits |
| `plugin-atelier/src/serveur/fabrique-outils.ts` | dépendance `dossierSujet?(tacheId, companyId)` ; garde dans `deposer()` pour image et vidéo ; référence dans le travail |
| `plugin-atelier/src/serveur/base.ts` | `tachesBloquantes(companyId, issueId)` (relations `blocks`) |
| `plugin-atelier/src/worker.ts` (`:43-52`) | câblage : documents natifs, parente, bloquantes, `sourcesPourGarde`, mode effectif |
| `plugin-atelier/src/serveur/services.ts` (`:598-640`) | `dossierSujet` dans le contexte |
| `organisation/skills/dossier-sujet/SKILL.md` (nouveau) | gabarit des 6 rubriques, exemple, critères ; préchargé chez `veille`, lu par `contenus`, `reseaux-sociaux`, `conformite-publicitaire` |
| `organisation/agents/{coordinateur,veille,contenus,reseaux-sociaux,conformite-publicitaire}/AGENTS.md` | sous-tâche obligatoire avant image et vidéo ; production ; lecture unique ; relecture de `Droits` |
| `organisation/skills/conformite-publicite-ia/SKILL.md` | case « marque tierce : rubrique Droits du dossier sourcée » |
| `organisation/registre/agents.json` | compétence `dossier-sujet` aux 5 rôles ; puis régénérer `generer-fiches-agents.py` et `fiches-agents-marketing.ts` dans le même commit |

### 4.6 Tests à écrire

- `plugin-atelier/tests/dossier-sujet.spec.ts` : dossier complet accepté ; rubrique absente ou vide refusée ; moins de
  3 faits refusé ; fait sans source refusé ; URL non lue refusée ; source `inaccessible` ou `bloquee_ssrf` refusée ;
  source de démonstration refusée en mode réel, acceptée en démonstration ; `connaissance://` accepté ; extrait absent
  de la source signalé sans blocage ; texte d'instruction dans le dossier traité comme donnée.
- `plugin-atelier/tests/fabrique-outils.spec.ts` (586 lignes, fixtures image et vidéo à compléter) : image et vidéo
  refusées sans tâche du run, sans dossier, avec dossier invalide ; acceptées avec dossier sur la tâche, sur une
  bloquante, sur la parente ; quota inchangé après un refus ; référence du dossier présente dans le fichier ;
  `fabriquer_document` inchangé.
- Base : requête `tachesBloquantes` sur PG jetable (méthode de la mémoire « migrations du plugin sur PG jetable »).
- Consignes : le test de parité des fiches et `tester-gouvernance-agents.py` après l'ajout de la compétence.

## 5. Cas de test réel (une fois livré)

Demande humaine au coordinateur marketing : image et vidéo humoristique de 15 s avec dialogue sur le jeu et le mage
Arcane. Attendu : plan avec 1) « Dossier du sujet » (`veille`), 2) image (`contenus`) et 3) vidéo à deux voix
(`reseaux-sociaux`, compétence `script-video-publicitaire`), 2 et 3 bloquées par 1 ; un essai de fabrication avant la
fin de 1 rend le refus du plugin ; le dossier cite des pages réellement lues (date de sortie annoncée, nom exact,
classe et vocabulaire), et la rubrique `Droits` traite le nom et le logo de l'éditeur. La date de sortie du 4/11/2026
n'est pas vérifiée par cette étude : c'est précisément au dossier de l'établir.

## 6. Risques, inconnus, décisions

- Risque de casse : les parcours qui fabriquent aujourd'hui sans dossier (dont les tests « image » et « vidéo » des
  4 cas marketing) seront refusés tant que le coordinateur n'a pas la nouvelle sous-tâche. Livrer consignes et garde
  ensemble, puis rejouer les 4 cas.
- Coût : une sous-tâche veille de plus par sujet ; compensé par la réutilisation du dossier pour image, vidéo et
  relectures. Un dossier par sujet peut servir plusieurs fabrications d'une même campagne (même parente).
- Inconnu : si le SDK expose la liste des tâches sœurs (non vérifié) ; la recommandation s'en passe (bloquantes et parente).
- Inconnu : la politique de contenu de fans de l'éditeur ; elle doit être sourcée dans le dossier, pas supposée.
- Limite de la fabrique : texte composé et voix de synthèse seulement ; une image humoristique figurative reste un brief.
- Fichiers partagés (`bootstrap-organisation.py`, fiches, `agents.json`) : un seul agent à la fois, commit par blocs vérifiés.
- À décider par l'opérateur : (1) garde fermée par défaut pour image et vidéo dès la livraison (recommandé) ou période de simple
  avertissement ; (2) extrait exact bloquant ou seulement signalé (recommandé : signalé) ; (3) liaison juridique
  systématique pour une marque tierce ou seulement quand la rubrique `Droits` reste « à confirmer » (recommandé : la seconde).
