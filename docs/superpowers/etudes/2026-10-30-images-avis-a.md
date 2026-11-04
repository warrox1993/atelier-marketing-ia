# Étude A : outil d'images publicitaires pour la fabrique (avis indépendant, 30/10/2026)

Lecture seule. Rien n'a été installé, téléchargé ni modifié. Sources web consultées le 30/10/2026.

## 1. Verdict

**Option retenue : (c) livrée en deux lots, (a) d'abord.**

1. **Lot I1, tout de suite** : un outil `fabriquer_image` qui rend des gabarits HTML en PNG fixe avec le
   chrome-headless-shell déjà figé dans la fabrique. Pas d'IA dans l'image, pas de GPU, rien à télécharger. Le
   texte et le logo sont posés par le gabarit, donc l'orthographe, les accents et la charte sont garantis.
2. **Lot I2, après décision de l'opérateur** : un champ facultatif `fond_ia`, c'est-à-dire un fond ou une illustration
   SANS texte générée en local sur la 3080 par **FLUX.2 [klein] 4B** (Apache-2.0, diffusers stable depuis 0.37.0),
   puis posée dans le même gabarit sous le texte et le logo. Secours, si la mesure de mémoire vidéo échoue :
   SDXL base 1.0.
3. **On n'utilise jamais un modèle pour écrire le texte dans l'image.** C'est le point faible de tous les modèles
   compatibles avec la 3080, et la fiche officielle de klein le dit elle-même.

## 2. Ce que montre le dépôt (prouvé)

| Élément | Où | Ce qui sert à l'image |
| --- | --- | --- |
| Gabarits HTML à champs échappés | `~/Projets/atelier-marketing-ia/fabrique/generateurs/visuels.py` l. 63-80 (`FORMATS`, `GABARITS`, `LIMITES`), l. 109-147 (`_texte`, `valider_champs`), l. 161-184 (`remplir_gabarit` : `html.escape` en une passe, marque sans valeur = erreur), l. 187-206 (`construire_scene`) | réutilisables tels quels ; gabarit = identifiant d'une liste fixe, jamais un chemin |
| CSP de la page | même fichier, l. 56-57 (`CSP_EXACTE`), l. 86-106 (empreintes des 3 scripts du moteur HyperFrames) | pour une image fixe, **aucun script n'est nécessaire** : on peut passer à `script-src 'none'`, plus strict que la vidéo |
| Moteur figé | l. 35-42 : HyperFrames 0.8.192, chrome-headless-shell 152.0.7977.30 dans `/opt/atelier-fabrique/chrome/…`, polices DejaVu | Chrome sert directement à la capture (voir §4) |
| Cage | `~/Projets/atelier-marketing-ia/fabrique/cage.py` l. 40-48 (`PERIPHERIQUES_GPU`, `TYPES_ETAPE = ("cpu","pdf","gpu")`), l. 140-168 (bwrap : `/entree` en lecture seule, `/sortie`, `/tmp` en tmpfs, GPU monté seulement pour `type="gpu"`, `HF_HUB_OFFLINE=1` si `hors_ligne`, seccomp, prlimit) | la cage CPU sert au lot I1, la cage GPU au lot I2, sans rien changer |
| Mesures de la cage Chrome | `visuels.py` l. 50 (`MEMOIRE_CAGE_OCTETS = 128 Gio` d'espace d'adressage, MESURÉ), l. 53 (`PROCESSUS_MAX_CAGE = 512`, MESURÉ) | à réutiliser pour Chrome ; ne pas les redécouvrir |
| GPU partagé avec les jeux | `~/Projets/atelier-marketing-ia/fabrique/gpu.py` l. 13 (8 Gio libres au moins), l. 77-101 `gpu_disponible()` | se réutilise tel quel ; un jeu en cours met l'image en `en_attente_gpu` |
| Provenance | `~/Projets/atelier-marketing-ia/fabrique/provenance.py` l. 47-49 (IPTC `trainedAlgorithmicMedia`, « Contenu généré avec l'IA »), l. 137-155 `ecrire_xmp` (exiftool en cage, **câblé en dur sur `video.mp4`**), l. 233 `poser_provenance` (**exige un `.mp4`**) | à généraliser au PNG : exiftool écrit le XMP dans un PNG |
| Aiguillage des travaux | `~/Projets/atelier-marketing-ia/fabrique/service.py` l. 877-880 `REGISTRE = {"document", "video"}` ; quotas l. 269-291 ; file GPU l. 1054-1056 | on ajoute `"image": traiter_image` et un quota d'images |
| Outils d'agent | `~/Projets/atelier-marketing-ia/plugin-atelier/src/contrats/fabrique-outils-schemas.ts` l. 8-37 (noms, `FORMATS_SORTIE_VIDEO`, `GABARITS_VIDEO`, limites) ; `~/Projets/atelier-marketing-ia/plugin-atelier/src/serveur/fabrique-outils.ts` l. 236-290 (`CHAMPS_GABARIT`, `champsVisuel`, `validerDemandeVideo`), l. 400 (`type: "document" \| "video"`) | même forme pour `validerDemandeImage` |
| **Porte de diffusion** | `~/Projets/atelier-marketing-ia/plugin-atelier/src/serveur/fabrique-provenance.ts` l. 20 `EXTENSIONS_CONTROLEES = mp4, pdf, docx, xlsx, pptx`, l. 63 (type `video`/`document` seulement), l. 65 (mention visible exigée pour la vidéo) | **TROU à combler AVANT le lot I1** : un `.png` n'est pas contrôlé aujourd'hui ; une image échapperait à la porte |
| Environnement GPU actuel | `/opt/atelier-fabrique/venv-voix` : torch 2.6.0, diffusers **0.29.0**, transformers 5.2.0 (relevé par `ls … dist-info`) | diffusers 0.29 ne connaît ni klein (0.37.0) ni Z-Image (0.36.0) : il faut un `venv-image` séparé, sans toucher à la voix |
| Règles sur les poids | `~/Projets/atelier-marketing-ia/docs/conception-execution-etroite.md` §6.5 (poids posés à la main, révision fixée par commit, SHA-256, safetensors seulement, `pip install --require-hashes`), §7 (mention IA, porte de diffusion) | s'applique tel quel au lot I2 |

## 3. Comparaison des options

### (a) Gabarit sans IA, PNG fixe

- **Pour** : aucun téléchargement ; moteur déjà figé et mesuré dans la cage ; résultat **déterministe** (même entrée,
  même PNG, donc testable par empreinte) ; texte exact, accents français compris (DejaVu) ; charte respectée ; aucun
  visage possible ; aucun risque de licence de modèle ; rien à payer.
- **Contre** : visuels typographiques (aplats, dégradés, logo, photo du client si on en donne une), moins « riches »
  qu'une illustration.
- **Temps** : une capture d'une page statique sans script prend quelques secondes de CPU **[probable, non mesuré]**.

### (b) IA locale seule (le modèle dessine aussi le texte)

| Modèle | Licence (source officielle) | Taille, mémoire vidéo annoncée | Texte dans l'image (fiche officielle) | Diffusers stable | Verdict sur la 3080 10 Go |
| --- | --- | --- | --- | --- | --- |
| FLUX.1 [schnell] | Apache-2.0 | 12 Md de paramètres, BF16 ; l'exemple officiel appelle `enable_model_cpu_offload()` | rien d'annoncé | oui | transformeur de ~24 Go en BF16 **[calcul : 12 Md × 2 octets]** : seulement avec déchargement séquentiel ou quantification, donc lent ; écarté |
| **FLUX.2 [klein] 4B** | Apache-2.0 (la variante 9B est en licence non commerciale) | 4 Md ; « fits in ~13GB VRAM… RTX 3090/4070 and above » ; 4 pas | « text rendered may be inaccurate or subject to distortion » | `Flux2KleinPipeline` depuis **v0.37.0 (05/03/2026)** | au-dessus des 10 Go annoncés : il faut `enable_model_cpu_offload()` (encodeur de texte et transformeur chargés tour à tour). **Probable** que ça passe sous 8 Gio, **à mesurer** |
| Z-Image-Turbo | Apache-2.0 | 6 Md ; « fits comfortably within 16G VRAM » ; 8 pas ; poids F32 dans le dépôt | annoncé précis en **chinois et anglais** seulement, le français n'est pas cité | `ZImagePipeline` depuis **v0.36.0 (08/12/2025)** ; la fiche recommande pourtant diffusers « depuis les sources » | 16 Go annoncés, 10 Go disponibles ; transformeur de ~12 Go en BF16 **[calcul]** : quantification nécessaire. Meilleur texte, mais français non garanti et trop gros ; écarté pour la v1 |
| SDXL base 1.0 | CreativeML Open RAIL++-M (usage commercial permis, avec une liste d'usages interdits) | ~3 Md (UNet 2,6 Md) ; tient en FP16 sur 10 Go **[probable]** | « The model cannot render legible text » ; visages « may not be generated properly » | oui, depuis longtemps | qualité plus ancienne (2023) ; **secours** de klein |
| FLUX.1 [dev], FLUX.2 [klein] 9B | non commerciales | - | - | - | **exclus** (usage commercial pour les clients) |

Conclusion sur (b) : aucun modèle qui tient sur la 3080 n'écrit de façon fiable un texte français exact.
Une publicité avec une faute ou une lettre déformée ne peut pas sortir. **(b) seul est écarté.**

### (c) Fond IA local + texte et logo posés par gabarit

Elle garde les points forts de (a) (texte exact, charte, logo, test par empreinte de la partie gabarit) et ajoute
l'illustration. Le modèle reçoit une consigne d'image **sans texte** ; le gabarit pose le texte par-dessus (bande ou
voile pour la lisibilité). C'est la cible, mais elle dépend de décisions de l'opérateur (téléchargement de ~16 Go de poids
**[estimation : 4 Md BF16 + encodeur de texte 4 Md BF16 + VAE]**, mesure de la mémoire vidéo, registre des sujets
autorisés). D'où le découpage : I1 livre (a) et prévoit la place du fond, I2 ajoute le fond.

## 4. Interface proposée

### Outil d'agent `fabriquer_image` (schéma fermé, `additionalProperties: false` partout)

```
{
  "format": "1080x1080" | "1080x1350" | "1080x1920" | "1200x628" | "1440x1800" | "1440x2560",
  "gabarit": "accroche" | "chiffre_cle" | "liste_3_points" | "offre",
  "champs": {                      // par gabarit, comme CHAMPS_GABARIT
    "titre": str ≤ 90, "sous_titre": str ≤ 160, "chiffre": str ≤ 20,
    "points": [3 × str ≤ 80], "appel_action": str ≤ 30, "mentions_legales": str ≤ 200
  },
  "charte": id "^[a-z0-9-]{1,64}$",   // couleurs, polices, logo : registre humain, jamais fourni par l'agent
  "fond_ia": {                        // LOT I2 seulement, facultatif
    "sujet": str ≤ 200,               // texte libre borné, normalisé par _texte
    "ambiance": "lumineuse" | "sobre" | "chaleureuse" | "nature" | "urbaine" | "abstraite",
    "graine": entier 0..2^31-1         // facultatif : reproductibilité
  }
}
```

- **Formats** : ceux de la demande, sauf que **1200x627 devient 1200x628**. C'est la valeur de l'aide officielle de
  LinkedIn (« 1.91:1 … 1200 x 628 pixels ») ; 627 vient des guides tiers, et deux valeurs pour le même rapport
  feraient doublon. J'ajoute 1440x1800 : le guide officiel de Meta recommande « 1440 x 1800 pixels » au format 4:5
  pour le fil (1080x1350 reste accepté : minimum 600x750, tolérance de 3 %). 1440x2560 pour les stories est une
  valeur de guides tiers, **[à vérifier sur le guide de Meta]** avant de l'ajouter.
- **Charte** : un registre `chartes-autorisees/<entreprise>/<id>.json` tenu par l'humain (même principe que
  `voix-autorisees/`, §7 de la conception) avec les couleurs (`#RRGGBB` validées par motif), le choix de police dans
  une liste fixe et le logo (PNG seulement, ≤ 1 Mo, dimensions lues dans l'en-tête IHDR ≤ 2000×2000, recopié dans la
  scène : `img-src 'self'`). L'agent ne fournit **jamais** de fichier, d'URL ni de couleur libre.
- **Sorties** : `image.png` (sRGB, sans transparence), `image.jpg` facultatif (qualité 90, si une régie l'exige),
  `provenance.json`, aperçu texte pour `etat_fabrication` (dimensions, poids, empreinte, gabarit, présence du fond
  IA). Taille plafonnée à 8 Mo (le plafond de Meta est 30 Mo ; un PNG 1440x2560 aplat tient largement **[probable]**).
- **Mention IA** : bandeau « Contenu généré avec l'IA » posé par le gabarit, **obligatoire** dès qu'il y a un
  `fond_ia` (`mention_visible: true`, aucun champ pour la retirer) ; réglable par l'humain pour une image purement
  typographique (même logique que les documents, décision JB n°7 de la conception).

### Où ça s'insère (réutilisation, pas de moteur nouveau)

1. `fabrique/generateurs/images.py` (nouveau, sur le modèle de `visuels.py`). Il **importe** `_texte`,
   `remplir_gabarit` (ou une variante sans `duree`), `CHROME`, `POLICES`, `MEMOIRE_CAGE_OCTETS`,
   `PROCESSUS_MAX_CAGE`, sans les recopier. Côté cage, il lance directement :
   `chrome-headless-shell --screenshot=/sortie/image.png --window-size=L,H --hide-scrollbars --force-device-scale-factor=1 file:///tmp/projet/index.html`.
   Le guide officiel de Chrome documente `--screenshot` et `--window-size` (developer.chrome.com/blog/headless-chrome),
   et Chrome 132 et suivants gardent ce mode « ancien headless » dans le binaire `chrome-headless-shell`. Pas de
   HyperFrames, pas de GSAP, pas de script, donc la CSP devient `script-src 'none'`. (HyperFrames 0.8.192 a bien
   une commande `snapshot --at`, `dist/snapshot-4YM4NNWJ.js` l. 1166-1213, mais elle est décrite « for visual
   verification » et passe par Puppeteer : inutile pour une image fixe.)
2. `fabrique/hyperframes/gabarits-images/<gabarit>/{index.html,scene.css}` : gabarits statiques ; `_commun/base.css` réutilisé.
3. `fabrique/provenance.py` : `ecrire_xmp`/`poser_provenance` généralisés au PNG (nom de fichier et extension en
   paramètre, liste fixe `.mp4`/`.png`/`.jpg`), PerTh seulement pour la vidéo.
4. `fabrique/service.py` : `REGISTRE["image"] = traiter_image`, quota `images` par jour, file GPU seulement si `fond_ia`.
5. Plugin : `NOM_OUTIL_FABRIQUER_IMAGE`, `FORMATS_IMAGE`, `GABARITS_IMAGE` dans `fabrique-outils-schemas.ts` ;
   `validerDemandeImage` dans `fabrique-outils.ts` (même style que `validerDemandeVideo`) ; l. 400 type `"image"` ;
   **`fabrique-provenance.ts` : `png`/`jpg` dans `EXTENSIONS_CONTROLEES`, type `image` accepté, mention visible
   exigée si `fond_ia`**.
6. Lot I2 : `fabrique/generateurs/fond_ia.py`, étape `type="gpu"`, `hors_ligne=True`, poids montés en lecture seule
   par `montages_modeles`, `venv-image` séparé ; la sortie `fond.png` est contrôlée (signature PNG, dimensions
   exactes) puis recopiée dans la scène du lot I1. Le texte de l'agent n'entre que dans la consigne du modèle, jamais
   dans du HTML.

## 5. Garde-fous

- **Cage sans réseau** : la cage existante (bwrap, seccomp, prlimit, `/entree` en lecture seule), page en `file://`,
  CSP `default-src 'none'; script-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'`.
- **Entrées** : identifiants dans des listes fixes ; textes passés par `_texte` (contrôles retirés, longueur bornée)
  puis `html.escape` ; aucune balise, aucun chemin, aucune URL ; marque sans valeur = erreur (déjà le cas).
- **Débordement de texte** : sans script dans la page, la fabrique ne peut pas mesurer la hauteur du texte rendu.
  Le gabarit fixe donc la taille de police par format, avec des plafonds de caractères prudents, et un test rend
  chaque gabarit au plafond, en caractères larges (« W »), pour chaque format. Le relecteur humain voit l'aperçu
  avant la diffusion.
- **Provenance** : `provenance.json` + XMP IPTC dans le PNG + empreinte SHA-256, vérifiés par la porte (après
  correction du trou de la l. 20).
- **Pas de visage réel** : lot I1, aucun visage possible (pas de photo fournie par l'agent). Lot I2 : la consigne fixe
  ajoute « no people, no faces, no text, no logos ». Un filtre de mots sur `sujet` ne peut pas garantir
  l'absence d'une vraie personne, d'où (1) des `ambiance` sans personnage, (2) l'approbation humaine avant
  diffusion, déjà obligatoire, (3) en option, un détecteur de visage après génération (à décider, il ajoute une
  dépendance).
- **Taille max** : dimensions exactes contrôlées dans l'en-tête PNG, poids ≤ 8 Mo, `fsize` de la cage.
- **Poids du modèle (I2)** : posés à la main par l'opérateur, révision Hugging Face fixée par commit, SHA-256,
  safetensors seulement, `HF_HUB_OFFLINE=1` (déjà dans `cage.py` via `hors_ligne`).

## 6. Tests à écrire d'abord (TDD)

Lot I1 (`fabrique/tests/test_images.py`, `plugin-atelier/tests/fabrique-outils.spec.ts`, `fabrique-porte.spec.ts`) :

1. `valider_champs_image` : gabarit inconnu, champ inconnu, champ manquant, plafond +1, format inconnu, 1200x627 refusé.
2. `remplir_gabarit` : `<script>`, `{{titre}}` dans un champ et guillemets restent du texte ; la CSP contient `script-src 'none'`.
3. Charte : identifiant hors registre refusé ; logo non PNG, > 1 Mo ou > 2000 px refusé ; couleur hors motif refusée.
4. Rendu réel en cage (marqué lent) : pour chaque format, PNG aux **dimensions exactes**, image non uniforme, deux
   rendus identiques = même SHA-256 (déterminisme ; **à confirmer à la mesure**, l'anticrénelage peut varier).
5. Rendu sans réseau : une page de gabarit qui référence `http://…` ne charge rien (journal de la cage).
6. Provenance : XMP relu dans le PNG, `provenance.json` présent, empreinte égale.
7. **Porte** : un `.png` sans provenance est refusé (test rouge aujourd'hui) ; `fond_ia` sans `mention_visible` refusé.
8. Plugin : `validerDemandeImage` refuse un champ en trop à chaque niveau, un `fond_ia` tant que le lot I2 est coupé.

Lot I2 : GPU occupé, donc `en_attente_gpu` (réutiliser les cas de `gpu.py`) ; poids absents ou SHA-256 faux, donc
refus clair ; sortie aux mauvaises dimensions refusée ; mesure de la mémoire vidéo maximale (`torch.cuda.max_memory_allocated`)
inscrite dans le journal, seuil < 8 Gio.

## 7. Coût en temps et en GPU

- **I1** : CPU seul, quelques secondes par image **[probable]** ; GPU : aucun ; disque : rien de nouveau.
  Développement : un lot court (générateur ~150 lignes, 4 gabarits, schéma, porte, tests).
- **I2** : téléchargement de ~16 Go une fois **[estimation]** ; un `venv-image` (diffusers 0.42.1, dernière stable du
  27/10/2026 sur PyPI ; version de torch exigée **à vérifier**) ; temps par image **inconnu** (4 pas, 1 Mpx, avec
  déchargement sur le CPU : de l'ordre de dizaines de secondes **[hypothèse à mesurer]**) ; occupe la 3080 :
  la règle des jeux de `gpu.py` s'applique.

## 8. Risques

1. **Trou de la porte** (prouvé, l. 20 de `fabrique-provenance.ts`) : sans la correction, une image sortirait sans
   contrôle. À corriger dans le même lot, test d'abord.
2. klein 4B peut **dépasser 10 Go** même avec déchargement (prouvé : 13 Go annoncés sans déchargement ; le reste est
   probable, pas mesuré) ; dans ce cas, SDXL en secours, ou la quantification (bitsandbytes), à vérifier selon la règle « pas de bêta ».
3. Les fiches de klein et de Z-Image recommandent diffusers « depuis les sources » ; on s'en tient à une version
   **publiée** (0.37.0 ou plus). C'est conforme à la règle, mais le chemin est moins rodé que l'installation par les sources.
4. La version 0.x de diffusers (décision JB n°3 de la conception, même cas que HyperFrames).
5. Le rôle de « fournisseur » au sens de l'article 50 du règlement IA pour un fond généré pour un client reste à
   confirmer par un juriste (déjà noté dans `conformite-publicite-ia`, « Limites »).
6. Valeur IPTC : la fabrique pose `trainedAlgorithmicMedia` partout et la porte l'exige (l. 64). Pour un gabarit
   avec un fond IA, `compositeSynthetic` (« au moins un élément issu de l'IA générative », vocabulaire IPTC) serait plus
   exact ; changer de valeur touche la porte. Je propose de garder `trainedAlgorithmicMedia` en v1, au plus prudent.
7. Charte : seule DejaVu est figée aujourd'hui ; une publicité soignée demandera 2 ou 3 polices libres (licence OFL)
   ajoutées au registre, à faire figer comme les autres.
8. Le skill `conformite-publicite-ia` ne parle que de vidéo et d'audio : il faudra y ajouter l'image (hors de ce lot,
   je le signale seulement).

## 9. Ce qui reste à l'opérateur (rien de payant)

1. Accord pour le lot I1 (aucun téléchargement).
2. Mention IA visible sur une image **purement typographique** : toujours, ou réglable par entreprise ?
3. Lot I2 : accord pour télécharger ~16 Go de poids klein 4B (Apache-2.0) et pour une mesure sur la 3080 hors jeu.
4. Lot I2 : détecteur de visage après génération (une dépendance de plus) ou seulement l'approbation humaine.
5. Liste des polices libres de la charte de chaque entreprise, et dépôt des logos dans le registre (humain).

## 10. Non vérifié

- Temps et mémoire réels de klein 4B et de SDXL sur la 3080 (aucune exécution : étude en lecture seule).
- Déterminisme octet pour octet de la capture de chrome-headless-shell.
- Tailles exactes des fichiers de poids de klein 4B (estimation à partir du nombre de paramètres).
- 1440x2560 pour les stories selon le guide officiel de Meta (seulement des guides tiers lus).
- Version de torch exigée par diffusers 0.42.1.

## Sources (consultées le 30/10/2026)

- FLUX.1 [schnell], fiche officielle : https://huggingface.co/black-forest-labs/FLUX.1-schnell (Apache-2.0, 12B, 1 à 4 pas, `enable_model_cpu_offload`)
- FLUX.2 [klein] 4B, fiche officielle : https://huggingface.co/black-forest-labs/FLUX.2-klein-4B (Apache-2.0, ~13 Go, texte « inaccurate or subject to distortion »)
- Licences de la famille FLUX.2 : https://github.com/black-forest-labs/flux2/wiki et https://bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence (4B en Apache-2.0, 9B en licence non commerciale)
- Z-Image-Turbo, fiche officielle : https://huggingface.co/Tongyi-MAI/Z-Image-Turbo (Apache-2.0, 6B, 16 Go, texte en chinois et en anglais)
- SDXL base 1.0, fiche officielle : https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 (OpenRAIL++-M, « cannot render legible text »)
- diffusers sur PyPI : https://pypi.org/project/diffusers/ (0.42.1 du 27/10/2026) ; versions sur GitHub par `gh api repos/huggingface/diffusers/releases` : Z-Image dans v0.36.0 (08/12/2025, PR #12703), Flux2 Klein dans v0.37.0 (05/03/2026, PR #12982)
- Meta, guide des publicités image : https://www.facebook.com/business/ads-guide/update/image (4:5, 1440x1800 recommandé, JPG/PNG, 30 Mo, minimum 600x750)
- LinkedIn, publicités à image unique : https://www.linkedin.com/help/lms/answer/a426534 et https://business.linkedin.com/advertise/ads/sponsored-content/single-image-ads-specs (1.91:1 en 1200x628)
- Chrome headless : https://developer.chrome.com/blog/headless-chrome (`--screenshot`, `--window-size`) et https://developer.chrome.com/docs/chromium/headless (`chrome-headless-shell` = ancien mode depuis Chrome 132)
- IPTC Digital Source Type : https://cv.iptc.org/newscodes/digitalsourcetype/
