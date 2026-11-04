# Étude : second avis et standard de qualité des images et vidéos (30/10/2026)

Demande de l'opérateur : un agent revérifie chaque image et chaque vidéo terminée (second avis), et un standard de qualité
« haut de gamme » est posé pour l'image et la vidéo. Étude seule : aucun code modifié, aucun appel à l'instance.
Toutes les URL ont été consultées le 30/10/2026.

## 0. Verdict

- **Second agent : oui, mais aveugle.** Un livrable public passe par trois revues obligatoires (exigences, métier,
  technique) puis par la porte et l'approbation humaine, et la diffusion est refusée sans porte franchie. Mais ni le
  relecteur ni le producteur ne voient le rendu : ils lisent un aperçu texte (poids, empreinte, transcription). Seul
  l'humain peut ouvrir le PNG ou le MP4.
- **Standard : à moitié.** La fabrique contrôle déjà le format, le codec, la durée, les dimensions et le contraste de
  la charte. Il manque la sonie, le débit, la première seconde, la lisibilité des sous-titres et les zones sûres. Un
  rendu de contrôle montre que les sous-titres 9:16 tombent dans la zone que masque l'interface de Reels.
- **Recommandation (option A) :** la fabrique mesure et refuse (étage a) et fournit une planche d'images clés. Le
  `relecteur` existant reçoit une compétence `qualite-visuels` et un outil de lecture du rendu (étage b). Aucun nouvel
  agent n'est créé.

## 1. Ce qui existe aujourd'hui (preuves)

### 1.1 Le second avis est obligatoire, à condition que la tâche soit sous porte

- Le gabarit `livrable-public` exige trois revues : `exigences`, `metier` (agent `relecteur`) et `technique`, puis une
  étape de revue par l'agent `porte` et une approbation humaine (`plugin-atelier/src/contrats/porte.ts:139-151`,
  `maxReviewRounds: 3` à la ligne 148). La conformité s'ajoute si un module est actif
  (`plugin-atelier/src/serveur/services.ts:2082-2083`).
- La porte est un programme sans modèle. Elle consolide les verdicts sans relire le contenu
  (`organisation/agents/porte/AGENTS.md:11-31`, `plugin-atelier/src/serveur/porte.ts:157`).
- La diffusion est refusée sans porte franchie sur la révision courante
  (`plugin-atelier/src/serveur/services.ts:1312`, `plugin-atelier/src/serveur/regles-diffusion.ts:60`). La provenance IA
  du fichier est revérifiée à la diffusion : empreinte, mention, voix (`services.ts:1346-1355`,
  `fabrique-provenance.ts:1-14`).
- Les producteurs livrent l'image ou la vidéo « par le document livrable … il passe ainsi par la relecture et la porte »
  (`organisation/agents/reseaux-sociaux/AGENTS.md:95-98` et `:129-132`, `organisation/agents/contenus/AGENTS.md:105`).
- La mise sous porte dépend du Coordinateur (`organisation/agents/coordinateur/AGENTS.md:419-427`). Une tâche à
  livrable sans porte n'est que signalée, pas bloquée (`services.ts:2405-2412`). Le circuit est donc obligatoire
  pour une diffusion par le plugin. Il ne l'est pas pour un humain qui télécharge le fichier depuis la page Livrables
  (`plugin-atelier/src/serveur/fabrique-remise.ts:6-8`).

### 1.2 Les critères du relecteur sont textuels

- Le relecteur vérifie les faits, les sources, la cohérence entre canaux et la charte (`organisation/agents/relecteur/AGENTS.md:18-62`).
- Pour un visuel IA, il vérifie seulement que la liste APRÈS est remplie, que la mention IA est présente et que le
  texte du post l'annonce (`relecteur/AGENTS.md:129-130`).
- Il n'a pas la compétence `design-visuel-sobre` (en-tête `relecteur/AGENTS.md:1-17`). Cette compétence dit
  d'ailleurs : « Sans capture ni rendu, la critique porte sur le brief et le dit »
  (`organisation/skills/design-visuel-sobre/SKILL.md:119`).
- Le verdict ne porte aucune note de qualité. Il contient des constats classés par gravité ; un constat critique ou
  majeur interdit `PASS` (`relecteur/AGENTS.md:381-417`, `:103-106`).

### 1.3 Personne ne voit le rendu

- Le relecteur n'a aucun outil de la fabrique : `relecteur`, `exigences`, `tests-techniques`, `conformite-publicitaire`
  et `porte` ont une liste vide. Seuls `contenus` et `reseaux-sociaux` peuvent fabriquer des images, et seul
  `reseaux-sociaux` des vidéos (calcul fait sur `organisation/registre/agents.json`).
- `etat_fabrication` n'est ouvert qu'aux agents fabricants ou à celui qui a déposé le travail
  (`plugin-atelier/src/serveur/fabrique-outils.ts:583-594`). Il rend `resultat` et un aperçu texte
  (`fabrique-outils.ts:620-625`).
- Pour une image, l'aperçu donne seulement le format, le gabarit, la charte, le poids, l'empreinte et l'indication
  « fond IA » (`fabrique/service.py:915-919`). Pour une vidéo, il donne la durée, la résolution et la transcription SRT
  (`fabrique/service.py:808-813`).
- Un outil de plugin ne peut rendre que du texte : `ToolResult` ne contient que `content`, `data` et `error`
  (`plugin-atelier/node_modules/@paperclipai/plugin-sdk/dist/types.d.ts:114-121`). Pour qu'un agent voie une image, il
  faut un fichier qu'il ouvre lui-même avec Read, dans son espace (`scripts/bootstrap-organisation.py:999-1006`).
  L'essai fait pour cette étude le confirme : Read affiche bien un PNG.

### 1.4 Contrôles déterministes déjà en place

| Objet | Contrôle | Preuve |
| --- | --- | --- |
| Vidéo | MP4, un flux H.264 yuv420p et un flux AAC, résolution exacte, 0 < durée ≤ plan + 1 s | `fabrique/generateurs/montage.py:305-326`, `:365` |
| Vidéo | 30 i/s constants, CRF 23 en preset `veryfast`, AAC 160 kb/s 48 kHz stéréo, `faststart` | `montage.py:55`, `:208-211` |
| Vidéo | 180 s et 30 scènes au plus ; mention IA permanente en haut | `montage.py:56-61`, `:229-233` |
| Vidéo | Sonie : aucune mesure ni normalisation. Un limiteur 0,95 n'existe qu'avec musique, sans musique aucun traitement | `montage.py:201`, `:204` |
| Image | Dimensions exactes, PNG 8 bits sans transparence, 8 Mo au plus | `fabrique/generateurs/images.py:280-290`, `:52` |
| Charte | Contraste texte/fond ≥ 4,5, accent/fond ≥ 3 | `fabrique/registre_charte.py:48-49`, `:128-131` |

### 1.5 Défauts mesurés ou calculés pour cette étude

1. **Sous-titres 9:16 dans la zone masquée (mesuré).** L'en-tête ASS est fixé à 1920x1080, quel que soit le format
   (`fabrique/generateurs/sous_titres.py:116-125`). Un rendu de contrôle par ffmpeg avec `ecrire_ass` a été fait sur
   un fond 1080x1920. Le bloc de texte occupe la bande de 6,7 % à 21,2 % au-dessus du bas de l'image. Or Meta demande
   de laisser libres les 35 % du bas (voir 2.1). En 16:9, le bloc occupe la bande de 6,8 % à 10,8 % au-dessus du bas.
2. **Mention IA vidéo dans la zone haute (calculé).** La mention est à 4 % du haut, en 45 px pour une largeur de 1080
   (`montage.py:231-232`). Elle tombe donc dans les 14 % du haut que Meta réserve à son interface.
3. **Gabarits vidéo 9:16 (calculé).** La marge est de 96 px, soit 5 % (`fabrique/hyperframes/gabarits/_commun/base.css:8`) :
   le texte des scènes peut entrer dans les zones de 14 % (haut) et de 35 % (bas).
4. **Image story (calculé).** Le haut est de 23,5 × 10,8 = 254 px (13,2 %), le bas de 31,5 × 10,8 = 340 px (17,7 %)
   (`fabrique/hyperframes/gabarits-images/_commun/base.css:40-43`). Le bas est donc deux fois plus court que la zone de
   35 % de Meta (672 px).
5. **Corps de texte trop petit sur téléphone (calculé).** Un sous-titre « p » en charge « p » mesure
   1,65 × 12 × 0,74 = 14,7 px en 1200x628, et 3 × 10,8 × 0,74 = 24 px en 1080x1080. Les mentions mesurent
   1,05 × 12 × 0,82 = 10,3 px en 1200x628 (`base.css:29`, `:52`, `:70`, `:134`). Ramené à un affichage pleine largeur
   sur un téléphone de 390 pt, cela donne 4,8 pt, 8,7 pt et 3,4 pt, sous les 11 pt d'Apple (voir 2.2).
6. **Contraste des mentions (calculé).** Les mentions sont composées en `color-mix(texte 74 %, fond)` (`base.css:134`).
   Une charte acceptée à 4,54:1 (#767676 sur blanc) donne des mentions à 2,81:1. Le calcul a été fait avec
   `registre_charte.contraste` ; le mélange sRGB a été reproduit à la main.

## 2. Standard « haut de gamme »

Légende : **[source]** valeur lue à la source (URL dans la colonne) ; **[maison]** choix interne à calibrer sur des
rendus réels ; **[à confirmer]** source secondaire, inaccessible ou ambiguë.

### 2.1 Étage a : vidéo (mesuré par la fabrique, refus = pas de fichier livré)

| Contrôle | Valeur | Statut et source |
| --- | --- | --- |
| Format 9:16 | 1080x1920 accepté ; Meta recommande 1440x2560 (largeur mini 500 px à partir de 30 s) | [source] https://www.facebook.com/business/ads-guide/update/video/instagram-reels |
| Codec | H.264, progressif, pixels carrés ; AAC stéréo ≥ 128 kb/s (déjà 160) | [source] même page Meta |
| Images/s | Constant (déjà 30). LinkedIn écrit « Less than 30 FPS » : il faut confirmer que 30 passe, sinon produire en 25 pour LinkedIn | [à confirmer] https://www.linkedin.com/help/lms/answer/85306 |
| Durée | 3 s au moins (LinkedIn), 180 s au plus (déjà en place) ; 15 à 30 s visées | [source] page LinkedIn ci-dessus |
| Débit vidéo | ≥ 516 kb/s (plancher TikTok) ; haut de gamme : CRF 20 en preset `medium` au lieu de 23 en `veryfast`, et débit moyen ≥ 4 Mb/s en 1080p | [source] https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads ; CRF et 4 Mb/s [maison] |
| Crête vraie | ≤ −1 dBTP | [source] EBU R 128-2023 (V5, novembre 2023), point m, https://tech.ebu.ch/docs/r/r128.pdf |
| Sonie intégrée | −16 LUFS ± 1 LU pour un mélange voix et musique (−23 LUFS est la cible de la diffusion télévisée, trop basse pour un réseau social) | −23 [source] EBU R 128-2023, point h ; −16 et −18 (voix seule) [à confirmer] : AES TD1008 (2021) lu par https://productionadvice.co.uk/td1008/, PDF de l'AES refusé (403) ; Meta et TikTok ne publient aucune cible |
| Première seconde | Aucune image noire (`blackdetect` sur [0 ; 1 s]) ; la voix démarre avant 0,5 s (`silencedetect`) | [maison] ; message dans les 3 premières secondes : Meta, page non datée, https://www.facebook.com/business/news/updated-features-for-video-ads |
| Sous-titres | Obligatoires pour une publicité : « most video ads in mobile feed are viewed without sound » | [source] page Meta ci-dessus (l'aide de LinkedIn exige le format SRT) |
| Lignes de sous-titres | 42 caractères par ligne au plus, 2 lignes au plus, 17 caractères par seconde au plus | [source] https://partnerhelp.netflixstudios.com/hc/en-us/articles/217351577-French-France-Timed-Text-Style-Guide (journal du 2025-10-17) |
| Durée d'un sous-titre | De 5/6 s à 7 s | [source] https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements |
| Zones sûres 9:16 | Rien d'important dans les 14 % du haut, les 35 % du bas et les 6 % de chaque côté (sous-titres, mention IA, texte des scènes) | [source] page Meta Reels ci-dessus ; TikTok ne publie pas de valeurs fixes, seulement un fichier à télécharger (page TikTok ci-dessus) |
| Voix | Écart de mots entre la transcription Whisper brute et le texte de référence ≤ 10 % (une prononciation ratée se voit dans cet écart) | [maison] ; l'alignement existe déjà (`sous_titres.py:1-15`) |

### 2.2 Étage a : image

| Contrôle | Valeur | Statut et source |
| --- | --- | --- |
| Dimensions, profondeur, poids | Exactes, 8 bits, ≤ 8 Mo (déjà en place) ; Meta accepte 30 Mo en story | [source] https://www.facebook.com/business/ads-guide/update/image/instagram-story |
| Contraste | Texte ≥ 4,5:1, grand texte ≥ 3:1, **mesuré sur la couleur réellement composée** (mentions comprises) | [source] WCAG 2.2, critère 1.4.3, 12/12/2024, https://www.w3.org/TR/WCAG22/#contrast-minimum |
| Corps minimal | Chaque texte ≥ 11 pt à l'affichage, soit ≥ 3,05 % de la largeur de l'image (33 px en 1080, 37 px en 1200). En dessous, les mentions passent dans le texte du post | 11 pt [à confirmer] : https://developer.apple.com/design/tips/ (page ancienne) ; largeur d'affichage de 390 pt [maison] |
| Zones sûres story | 14 % en haut, 35 % en bas, 6 % sur les côtés | [source] page Meta story ci-dessus |
| Débordement | Aucun texte hors de son cadre. Le témoin existe en test (`images.py:87`) ; à mesurer en production | [maison] |

### 2.3 Étage b : grille du second avis (relecteur, sur le rendu)

Chaque critère est noté 0 (raté), 1 (passable) ou 2 (net), sur la planche ou sur le PNG vu à la taille d'un téléphone
(360 px de large) et non en pleine résolution.

| # | Critère | Ce que le relecteur regarde |
| --- | --- | --- |
| 1 | Accroche | Vidéo : images de 0, 1 et 2 s et première phrase dite. Image : le titre se lit en premier |
| 2 | Une seule idée | Un message, un bénéfice ; rien qui se dispute l'attention |
| 3 | Hiérarchie | Titre, puis preuve, puis appel ; l'œil suit cet ordre |
| 4 | Lisibilité sur téléphone | Tout le texte se lit à 360 px de large, sans zoom |
| 5 | Rythme (vidéo) ou respiration (image) | Scènes de 2 à 5 s, pas de mur de texte ; marges régulières |
| 6 | Voix et ton | La transcription correspond au script ; le ton correspond à la cible du dossier du sujet ; un humour qui tombe à plat ou qui exclut une partie du public vaut 0 |
| 7 | Appel à l'action | Un seul appel, clair, réalisable ; il correspond à l'offre confirmée |
| 8 | Dossier du sujet | Chaque fait, chiffre et nom vient du dossier ou de la fiche ; **éliminatoire** |
| 9 | Charte | Couleurs, police et logo de la charte, sans rien en plus ; **éliminatoire** |
| 10 | Mention IA et conformité | Mention visible dès le début, liste APRÈS remplie ; **éliminatoire** |

**Publiable** : 16/20 au moins, aucun 0, et 2/2 sur les critères 8, 9 et 10. En dessous, verdict `CHANGES_REQUESTED`
avec un constat `majeure` par critère sous 2. La catégorie est `marque`, `technique`, `affirmation_non_sourcee` ou
`autre` : ces catégories existent déjà (`relecteur/AGENTS.md:401`), il ne faut pas modifier le schéma. La note et le
détail vont dans `justification`. Le seuil de 16 est un choix [maison] à recalibrer après 20 rendus jugés aussi par l'opérateur.

## 3. Qui donne le second avis, et comment il voit le rendu

- **Étage a : la fabrique, pas la porte.** Le contrôle se fait au moment où le fichier existe, comme le contrôle de
  sortie actuel (`montage.py:365-368`, `images.py:346-348`). Un rendu hors norme n'est pas livré, le producteur reçoit
  le motif et redépose (règle existante : une seule reprise, `reseaux-sociaux/AGENTS.md:125-128`). La fabrique écrit
  en plus `controle-qualite.json` (mesures et alertes non bloquantes) et l'ajoute à `resultat.json`. La porte n'a rien
  à relire : l'empreinte du fichier est déjà revérifiée à la diffusion (`fabrique-provenance.ts:75`).
- **Planche de la vidéo.** ffmpeg est déjà dans la cage de montage (`montage.py:43`). Le poste dispose des filtres
  `select`, `tile`, `thumbnail`, `blackdetect`, `silencedetect`, `ebur128` et `loudnorm` (vérifié par
  `ffmpeg -filters`). Une seconde étape en cage, hors réseau, sur le modèle de `controler_sortie`
  (`montage.py:286-302`), produirait :
  - `planche.png` : les images de 0, 1 et 2 s, puis la première image de chaque scène, réduites à 360 px de large et
    assemblées par `tile` (30 scènes au plus, soit une grille de 6 x 6) ;
  - la transcription, qui existe déjà dans l'aperçu (`service.py:808-813`) ;
  - les mesures `ebur128`, `blackdetect` et `silencedetect` dans `controle-qualite.json`.
- **Outil de lecture du rendu pour le relecteur.** Un outil de plugin ne rend que du texte (1.3). Il faut donc un
  outil en lecture seule, par exemple `voir_rendu(travail)`, réservé aux relecteurs désignés de la tâche qui cite le
  travail. Il copie `image.png` ou `planche.png`, déjà présents dans `resultat.json`, dans l'espace de l'agent, vérifie
  l'empreinte et rend le chemin. L'agent ouvre ensuite le fichier avec Read. Le droit d'écrire dans l'espace de
  l'agent depuis le worker du plugin est [à confirmer] au premier lot. La vidéo elle-même n'est jamais transmise.
- **Boucle.** `CHANGES_REQUESTED`, puis le producteur refabrique et dépose une nouvelle révision, puis le relecteur
  relit (`relecteur/AGENTS.md:117-118`). Le plafond est de 3 cycles par défaut
  (`plugin-atelier/src/contrats/identifiants.ts:46`). Une fois les cycles épuisés, la tâche remonte à l'humain
  (`porte.ts:309-325`). Le quota borne le coût : 10 vidéos et 30 images par jour et par entreprise
  (`reseaux-sociaux/AGENTS.md:90`, `:112`). Une vidéo refaite trois fois consomme 4 unités du quota.

## 4. Options et recommandation

| | A. Fabrique mesure, relecteur voit (recommandée) | B. Nouvel agent « directeur artistique » | C. Mesures seules, goût laissé à l'humain |
| --- | --- | --- | --- |
| Second avis sur le rendu | Oui, par le relecteur | Oui, par un agent dédié | Non |
| Ce qu'il faut créer | 1 compétence, 1 outil, contrôles dans la fabrique | Rôle `RoleRevue` en plus, gabarit de porte, bootstrap, agent, compétence, outil | Contrôles dans la fabrique |
| Coût par livrable | 1 lecture d'image en plus dans une revue qui existe déjà | 1 run d'agent en plus pour tout livrable public, visuel ou non | Nul |
| Risque | Le relecteur porte deux casquettes (faits et visuel) | Changement de schéma et de porte, plus de jetons | Ne répond pas à la demande de l'opérateur |

**Recommandation : A.** La revue `metier` est déjà obligatoire, indépendante du producteur et bornée en cycles. Il lui
manque les yeux (l'outil et la planche) et la grille (la compétence). Créer un agent B n'apporte rien de plus tant que
la grille tient en une compétence. B ne se justifie que si les rendus refusés par l'opérateur après un `PASS` du relecteur
restent fréquents (seuil proposé : plus de 1 sur 5 sur 20 rendus).

### Fichiers à toucher (option A), en quatre lots

1. **Fabrique, vidéo** : `fabrique/generateurs/montage.py` (`loudnorm` à −16 LUFS et −1,5 dBTP, CRF et preset,
   mesures `ebur128`, `blackdetect` et `silencedetect` dans le contrôle de sortie, planche), puis
   `fabrique/generateurs/sous_titres.py` (en-tête ASS à la taille du format, marge basse ≥ 36 % en 9:16, coupe à 42
   caractères et 2 lignes, contrôle des 17 caractères par seconde et de l'écart Whisper), puis
   `fabrique/service.py` (`controle-qualite.json`, planche dans `resultat.json`, aperçu enrichi), et enfin la mention
   IA de `montage.py:229-233` et les marges de `fabrique/hyperframes/gabarits/_commun/base.css` (zones de 14 %, 35 %
   et 6 %).
2. **Fabrique, image** : `fabrique/hyperframes/gabarits-images/_commun/base.css` (bas de la story à 35 %, corps
   minimal par format, mentions sans `color-mix` ou contraste mesuré), puis `fabrique/generateurs/images.py`
   (`controle-qualite.json`), puis `fabrique/registre_charte.py` (refuser une charte dont la couleur des mentions
   composée passe sous 4,5).
3. **Plugin** : `plugin-atelier/src/contrats/fabrique-outils-schemas.ts` et `plugin-atelier/src/serveur/fabrique-outils.ts`
   (outil `voir_rendu`, accès réservé aux relecteurs désignés de la tâche) ; `sous_titres` forcé à vrai pour une
   vidéo publicitaire, sur décision de l'opérateur.
4. **Organisation** : nouvelle compétence `organisation/skills/qualite-visuels/SKILL.md` (grille 2.3) ; outil et
   compétence ajoutés au relecteur dans `organisation/registre/agents.json` et `organisation/agents/relecteur/AGENTS.md` ;
   livraison des producteurs avec `controle-qualite.json`. Ensuite, régénérer les fiches dans le même commit
   (`generer-fiches-agents.py` et `fiches-agents-marketing.ts`, piège connu) et repasser `scripts/test-assurer-fabrique.py`.

### Tests à écrire

- `fabrique/tests/test_montage.py` : une sonie hors de −16 ± 1 LUFS ou une crête au-dessus de −1 dBTP est refusée ;
  une première seconde noire est refusée ; la planche contient 3 images plus une par scène.
- `fabrique/tests/test_sous_titres.py` : l'en-tête ASS a la taille du format ; un rendu 1080x1920 mesuré comme au
  point 1.5.1 garde le texte au-dessus de 35 % du bas ; une ligne de plus de 42 caractères est coupée ; plus de 17
  caractères par seconde donne une alerte.
- `fabrique/tests/test_images.py` : pour chaque format et chaque charge, le corps de texte ≥ 3,05 % de la largeur ;
  le texte de la story reste dans les zones sûres ; le contraste des mentions composées est ≥ 4,5.
- Plugin (`plugin-atelier/tests/fabrique-outils.spec.ts`) : `voir_rendu` refuse un agent qui n'est pas relecteur
  désigné, refuse un fichier absent de `resultat.json` et refuse une empreinte différente.
- `scripts/test-assurer-fabrique.py` : le relecteur reçoit `voir_rendu`, mais ni `fabriquer_image` ni
  `fabriquer_video`.

## 5. Risques et ce qui reste à l'opérateur

- **Sécurité** : `voir_rendu` copie un fichier vers l'espace d'un agent et élargit un accès. Une seule revue par
  l'agent `securite` est à prévoir à la fin de l'ensemble des lots.
- **Temps de calcul** : passer de `veryfast` en CRF 23 à `medium` en CRF 20 allonge l'encodage. Il faut le mesurer
  dans le budget de 30 min (`fabrique/service.py:53`, `:823`).
- **Valeurs [à confirmer]** : la cible de −16 LUFS (texte AES non lu), les « Less than 30 FPS » de LinkedIn, et les
  11 pt d'Apple sur un écran de 390 pt. Un envoi réel sur chaque régie tranchera.
- **Décisions pour l'opérateur** :
  1. rendre les sous-titres obligatoires pour toute vidéo publicitaire ;
  2. accepter le seuil de 16/20 et la liste des trois critères éliminatoires ;
  3. ajouter ou non le format Meta recommandé 1440x2560 ;
  4. garder pour l'humain ce qui relève du goût : choix de la voix et de la musique, humour, et « est-ce beau ».
     L'approbation humaine reste la dernière étape (`contrats/porte.ts:146-151`). La grille l'informe, elle ne la
     remplace pas.
- **Non couvert** : les fonds d'image générés par l'IA (lot I2, études `2026-10-30-images-avis-a.md` et `-b.md`).
  Ils ajouteront des critères d'étage b (mains, texte parasite, cohérence) à la même grille.
