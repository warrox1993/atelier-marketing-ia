# Étude B : outil d'images publicitaires pour la fabrique (30/10/2026)

Analyste B, avis indépendant. Lecture seule : aucune installation, aucun téléchargement, aucun appel à 3100.
Une seule mesure locale : une capture PNG par le Chrome déjà figé de la fabrique, sur un HTML de test dans le
bloc-notes (rien dans le dépôt).

## Verdict

**Un nouvel outil `fabriquer_image` en deux étages, livrés dans cet ordre :**

1. **Étage 1 (à faire tout de suite) : composition HTML/CSS rendue en PNG** par le `chrome-headless-shell`
   152.0.7977.30 déjà figé, appelé directement avec `--screenshot` (sans HyperFrames ni Node), à partir de
   gabarits fixes de la fabrique, des **vraies images de la marque** (photos et logo déposés par l'humain) et de
   polices libres de qualité. Aucune dépendance nouvelle à part les polices. C'est ce qui donne l'aspect
   professionnel.
2. **Étage 2 (en option, après l'étage 1) : un fond ou une illustration générés en local par FLUX.2 [klein] 4B**
   (Apache 2.0, diffusers stable), jamais du texte, jamais une personne, posés DERRIÈRE la composition de l'étage 1.
   L'IA ne fournit qu'une couche ; la typographie, le logo et la mise en page restent déterministes.

Je déconseille l'image entièrement générée par IA en guise de publicité finie (texte et mise en page compris) :
c'est elle qui « fait IA », c'est la moins vérifiable, et c'est elle qui vieillit le plus vite.

## Ce qui est prouvé dans le dépôt et sur le poste

| Fait | Preuve |
| --- | --- |
| Le moteur de visuels sait déjà valider et échapper des champs texte d'une liste fixe de gabarits | `~/Projets/atelier-marketing-ia/fabrique/generateurs/visuels.py` : `valider_champs` (l. 125), `remplir_gabarit` (l. 162, `html.escape(..., quote=True)`, une seule passe), `construire_scene` (l. 187), `GABARITS` (l. 59), `FORMATS` (l. 52) |
| La conception a DÉJÀ prévu des « livrables image de la fabrique » réutilisables par les documents et les vidéos | `~/Projets/atelier-marketing-ia/docs/conception-execution-etroite.md` l. 219 et l. 228 ; garde-fou l. 244 « images issues de la fabrique, ré-encodées en PNG par Pillow dans la cage, dimensions ≤ 4096² » |
| Ce trou est visible dans le code : le bloc `image` des documents est refusé | `~/Projets/atelier-marketing-ia/fabrique/generateurs/documents.py` l. 169-171 « images pas encore prises en charge » ; le schéma du plugin l'accepte déjà (`~/Projets/atelier-marketing-ia/plugin-atelier/src/serveur/fabrique-outils.ts` l. 110-125, champs `livrable`, `legende`) |
| La cage sait faire des étapes GPU, sans réseau | `~/Projets/atelier-marketing-ia/fabrique/cage.py` : `TYPES_ETAPE = ("cpu","pdf","gpu")` l. 46, `--unshare-all` l. 126, périphériques NVIDIA l. 146-149, `hors_ligne` → `HF_HUB_OFFLINE=1` l. 155-156 |
| Le partage du GPU avec les jeux est déjà géré | `~/Projets/atelier-marketing-ia/fabrique/gpu.py` : `gpu_disponible`, seuil `MEMOIRE_LIBRE_MIN_MIO = 8 Gio` l. 13 |
| La provenance IPTC par exiftool existe pour la vidéo ; la porte de diffusion n'accepte que `trainedAlgorithmicMedia` | `~/Projets/atelier-marketing-ia/fabrique/provenance.py` l. 43-49, 137-157 ; `~/Projets/atelier-marketing-ia/plugin-atelier/src/serveur/fabrique-provenance.ts` l. 18 et l. 64 |
| Les seules polices de la fabrique sont DejaVu Sans et DejaVu Sans Bold | `ls /opt/atelier-fabrique/polices` |
| L'environnement voix contient déjà torch 2.6.0, diffusers 0.29.0, transformers 5.2.0 ; diffusers 0.29.0 ne connaît ni FLUX.2 ni Klein | `ls /opt/atelier-fabrique/venv-voix/lib/python3*/site-packages` ; notes de version ci-dessous |
| Poste : RTX 3080 10 240 Mio, pilote 615.71.09 ; 30 Gio de RAM (18 disponibles au moment de la mesure), 16 fils | `nvidia-smi`, `free -g`, `nproc` |
| **Mesuré** : une capture 1080x1350 par le Chrome figé prend **0,39 s** et **94 Mio** de RSS | `/usr/bin/time ... chrome-headless-shell --no-sandbox --disable-gpu --hide-scrollbars --window-size=1080,1350 --screenshot=...` → « PNG image data, 1080 x 1350 » (hors cage ; en cage, ajouter le coût de bwrap, quelques dixièmes de seconde) |
| HyperFrames 0.8.192 a une commande `snapshot` (PNG) mais son option `--describe` « runs by default when GEMINI_API_KEY is set » (analyse par Gemini) | `node .../hyperframes.mjs snapshot --help` |

## Sources externes (consultées le 30/10/2026)

| Point | Source |
| --- | --- |
| FLUX.2 [klein] 4B : Apache 2.0 ; 9B : licence non commerciale ; « Klein 4B fits in ~8GB VRAM (RTX 3090/4070 and up) » ; publié le 15/01/2026 ; filigrane invisible et C2PA recommandés | https://github.com/black-forest-labs/flux2 (README) |
| Carte du modèle : « 4 billion parameter rectified flow transformer », « as little as 13GB VRAM », 4 pas, `Flux2KleinPipeline`, `enable_model_cpu_offload()` | https://huggingface.co/black-forest-labs/FLUX.2-klein-4B |
| `Flux2KleinPipeline` entre dans une version STABLE de diffusers à la 0.37.0 (05/03/2026, PR #12982) ; Z-Image à la 0.36.0 (08/12/2025, PR #12703) | `gh api repos/huggingface/diffusers/releases` (notes v0.37.0 et v0.36.0) |
| Dernière version stable de diffusers : 0.42.1 (27/10/2026) ; pas de pré-version dans les dix dernières | https://pypi.org/project/diffusers/#history |
| FLUX.1-schnell : Apache 2.0, 12 milliards de paramètres, 1 à 4 pas, dépôt à accès conditionnel | https://huggingface.co/black-forest-labs/FLUX.1-schnell |
| SDXL base 1.0 : CreativeML Open RAIL++-M ; limites déclarées « cannot render legible text », « Faces and people in general may not be generated properly », « does not achieve perfect photorealism » | https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 |
| Z-Image-Turbo : Apache 2.0, 6 milliards, « fits comfortably within 16G VRAM consumer devices », 8 passes | https://huggingface.co/Tongyi-MAI/Z-Image-Turbo |
| ComfyUI : dernière version v0.43.0 (27/10/2026), publiée comme stable | `gh api repos/Comfy-Org/ComfyUI/releases` |
| Meta, fil Facebook : 4:5, 1440x1800 recommandé, JPG ou PNG, 30 Mo max | https://www.facebook.com/business/ads-guide/update/image/facebook-feed |
| Meta, Stories Instagram : 9:16, 1440x2560 recommandé, garder libres 14 % en haut, 35 % en bas, 6 % sur les côtés | https://www.facebook.com/business/ads-guide/update/image/instagram-story |
| LinkedIn, image unique : JPG/PNG/GIF, 5 Mo max ; 1,91:1 → 1200x628, 1:1 → 1200x1200, 4:5 → 720x900 recommandés, vertical conseillé | https://www.linkedin.com/help/lms/answer/a426534 |
| Vocabulaire IPTC : `trainedAlgorithmicMedia`, `compositeSynthetic` (« Mix or composite of several elements, at least one of which is Generative AI »), `algorithmicMedia`, `digitalCreation` | https://cv.iptc.org/newscodes/digitalsourcetype/ |

## Comparaison des options

| Option | Aspect « pro » | Durée de vie | Coût poste | Risques | Avis |
| --- | --- | --- | --- | --- | --- |
| A. Gabarits HTML/CSS → PNG (Chrome figé) | Bon à très bon SI vraies photos de marque, polices sérieuses et gabarits dessinés par un humain ; nul avec DejaVu et des aplats seuls | Excellente : HTML/CSS ne bouge pas, Chrome est déjà figé et épinglé | 0,4 s, CPU, 94 Mio ; aucun GPU | Monotonie si trop peu de gabarits ; dépend de la qualité des images de marque | **Socle retenu** |
| B. IA locale seule (Klein 4B, Z-Image, FLUX.1-schnell, SDXL) | Inégal : texte et mise en page générés = principal signe d'une production d'IA ; SDXL l'écrit lui-même (« cannot render legible text ») | Moyenne : modèles remplacés tous les 6 à 12 mois, mais poids figés par empreinte et Apache 2.0 irrévocable pour la version prise | GPU, RAM, temps, attente des jeux | Visages, ressemblance, marques et logos inventés, contrôle a posteriori difficile | Rejeté comme image finie |
| **C. A + couche IA de fond (Klein 4B)** | Le meilleur des deux : composition déterministe, matière visuelle variée | Bonne : la couche IA est remplaçable sans toucher aux gabarits | Étage 1 gratuit ; étage 2 GPU à la demande | Ceux de B, réduits par le périmètre (fond seulement, contrôle des visages) | **Retenu, en deux étages** |
| D. HyperFrames `snapshot` au lieu de Chrome direct | Identique à A | Liée au moteur vidéo | Node + Chrome | Fonction d'analyse par Gemini par défaut si une clé est présente ; outil de vérification, pas de production ; scripts injectés dans la page | Rejeté |
| E. ComfyUI | Identique à B | Écosystème de nœuds tiers très mouvant | Serveur résident, interface web | Surface d'attaque (serveur HTTP, nœuds personnalisés), mal adapté à une cage par travail | Rejeté : diffusers en script, comme la voix, colle au modèle de cage existant |

Choix du modèle de l'étage 2 :

- **FLUX.2 [klein] 4B** : seul modèle récent à la fois Apache 2.0, stable dans diffusers (0.37.0), et donné par son
  éditeur pour les GPU grand public. Les deux chiffres officiels divergent (8 Go dans le README, 13 Go dans la carte) :
  sur 10 Go il faudra `enable_model_cpu_offload()`. **À mesurer** avant toute promesse.
- Z-Image-Turbo (Apache 2.0, 6 milliards, 16 Go annoncés) : meilleur sur le photoréalisme d'après sa carte, mais au
  delà de la carte de l'opérateur ; à garder en second choix.
- FLUX.1-schnell : 12 milliards, n'entre pas en bf16 sur 10 Go sans déchargement séquentiel ou quantification
  (dépendances en plus) ; génération 2024, dépassée par Klein.
- SDXL : licence OpenRAIL++-M (restrictions d'usage à suivre), qualité inférieure, limites déclarées sur les
  visages et le photoréalisme. Écarté.
- Klein 9B : licence non commerciale. Interdit.

## Interface proposée : `fabriquer_image`

Même forme que `fabriquer_video` : schéma fermé côté plugin, revalidé côté fabrique, rendu asynchrone suivi par
`etat_fabrication`.

```text
fabriquer_image {
  format:   "fil_4x5" (1080x1350) | "carre" (1080x1080) | "story_9x16" (1080x1920)
            | "lien_191" (1200x628) | "linkedin_carre" (1200x1200)
  gabarit:  identifiant d'une liste fixe (ex. accroche_photo, chiffre_cle, citation_client,
            offre_date, avant_apres_texte, annonce_evenement)
  champs:   textes bornés propres au gabarit (titre ≤ 90, sous_titre ≤ 160, appel ≤ 30,
            chiffre ≤ 20, mention_legale ≤ 200), même `_texte` que visuels.py
  image_marque: identifiant facultatif d'une image de la bibliothèque de marque de l'entreprise
            (déposée par l'humain dans l'interface, comme le registre des voix)
  fond_ia:  facultatif { sujet: liste fermée (texture, matiere, paysage, nature_morte, architecture,
            objet_seul), description ≤ 300 caractères, palette: identifiant de la fiche client, graine: entier }
  declinaisons: liste facultative de formats (≤ 5) : même contenu, une sortie par format
}
→ livrables : image-<format>.png (sRGB, ≤ 4096², ≤ 5 Mo pour LinkedIn, ≤ 30 Mo pour Meta),
  provenance.json, apercu.txt
```

Pourquoi 1080 de large par défaut : ce sont les formats déjà utilisés par la vidéo (`FORMATS`, visuels.py l. 52),
au-dessus des minimums Meta (600 px) et LinkedIn ; un rendu à `--force-device-scale-factor` 1,333 donne
1440x1800 et 1440x2560 si l'opérateur veut coller aux recommandations Meta (simple réglage, 0 code de mise en page en plus).

Gabarits « story » : zones libres de Meta (14 % haut, 35 % bas, 6 % côtés) codées dans le CSS du gabarit, jamais
laissées à l'agent.

## Fichiers et fonctions à réutiliser

- `fabrique/generateurs/visuels.py` : `_texte`, `valider_champs`, `remplir_gabarit` (marques `{{…}}`, échappement),
  `politique_csp` (ici sans empreinte : un gabarit fixe n'a **aucun** script, donc `script-src 'none'`), constante
  `CHROME`. Le nouveau générateur `fabrique/generateurs/images.py` suit la même structure (côté hôte pur, côté cage
  `main(entree, sortie)` en `python3 -I`, stdlib seulement pour l'étage 1).
- `fabrique/cage.py` : `Etape`, `executer`, `recuperer_sortie`, `FSIZE_DOCUMENT_OCTETS` (50 Mio suffit).
- `fabrique/provenance.py` : `ecrire_xmp`, `lire_xmp` et `_ecrire_json_atomique` acceptent un MP4 ; exiftool écrit
  le même XMP dans un PNG. À généraliser par l'extension, sans dupliquer.
- `fabrique/service.py` : table des traitements l. 878-879 (`"image": traiter_image`), `verifier_quota` /
  `compter_travail` l. 269-292 (quota d'images par jour), `attendre_memoire` l. 893 (étage 2 : RAM pour le
  déchargement), `copier_vers_livrable` l. 378.
- `fabrique/gpu.py` : `gpu_disponible` avant l'étage 2, tel quel.
- `fabrique/generateurs/documents.py` l. 169-171 et le visuel « livrable image » de la vidéo : une fois l'outil livré,
  le bloc `image` peut accepter les livrables `image-*.png` (hors périmètre de ce lot, à signaler).
- Plugin : `plugin-atelier/src/serveur/fabrique-outils.ts` (`objet`, `enumeration`, `champsVisuel`) pour le schéma ;
  `fabrique-provenance.ts` pour la porte. Rôles : ajouter l'outil à `contenus` et `reseaux-sociaux` dans
  `organisation/registre/agents.json`, puis régénérer les fiches (piège connu du 30/10).
- Skill `design-visuel-sobre` : critique de l'image rendue avant livraison (déjà écrit pour cela) ; skill
  `declinaison-regies-video` : à décliner en une variante image pour le choix du format.

## Garde-fous

1. **Cage sans réseau** : `--unshare-all`, Chrome en `--disable-gpu --no-sandbox` (la cage est le bac à sable),
   page en `file://` avec CSP `default-src 'none'; script-src 'none'; style-src 'self'; img-src 'self' data:;
   font-src 'self'`. Étage 2 : étape `gpu`, `hors_ligne=True`, poids montés en lecture seule.
2. **Entrées** : textes par `_texte` + `html.escape` ; gabarit et format = identifiants de listes fixes ; aucun
   chemin, URL, HTML, CSS ni couleur libre (la couleur vient de la fiche client).
3. **Images de marque** : uniquement depuis une bibliothèque tenue par l'humain, ré-encodées en PNG par Pillow dans
   la cage, ≤ 4096² (conception l. 244), EXIF retiré.
4. **Aucun visage réel, aucune personne** : `sujet` en liste fermée sans catégorie « personne » ; refus des
   descriptions qui nomment une personne ou une marque (contrôle textuel, insuffisant seul) ; **contrôle après
   génération** par un détecteur de visages en cage (par exemple YuNet d'OpenCV Zoo, à vérifier : licence, version
   stable) : un visage détecté = image refusée, jamais livrée. Les photos de marque montrant une personne restent la
   responsabilité de l'humain qui les dépose (case « accord de la personne » dans la bibliothèque, comme
   `visages-autorises/`).
5. **Le modèle n'écrit jamais de texte** : tout le texte est posé par le gabarit ; l'invite de l'étage 2 est
   composée par la fabrique (sujet + description + palette + « no text, no letters, no logo, no people »).
6. **Provenance** : XMP dans le PNG par exiftool, relu dans une autre cage ; `provenance.json` ; valeur IPTC :
   `trainedAlgorithmicMedia` imposé par la porte actuelle. Avec un fond IA, la valeur exacte serait
   `compositeSynthetic` ; sans IA, `algorithmicMedia`. Changer la porte = décision de l'opérateur (voir plus bas).
   Mention visible « Contenu généré avec l'IA » incrustée par le gabarit dès qu'il y a une couche IA.
7. **Tailles** : dimensions fixes par format, PNG ≤ 5 Mo (contrainte LinkedIn, la plus stricte) vérifiée à la sortie,
   ré-encodage ou refus au-delà.
8. **Poids du modèle** : posés par l'opérateur, révision Hugging Face figée par commit et sha256 dans
   `fabrique/modeles.json` (même schéma que chatterbox et kokoro), safetensors seulement (conception §6.5).
   Environnement séparé `/opt/atelier-fabrique/venv-images` : diffusers 0.42.1 n'est pas compatible avec le
   0.29.0 de `venv-voix` sans risquer la voix ; on ne touche pas à `venv-voix`.

## Tests à écrire d'abord (TDD)

Étage 1, tous sans GPU :

1. `valider_image` : format inconnu, gabarit inconnu, champ inconnu ou manquant, texte trop long, octet nul,
   `image_marque` qui ressemble à un chemin (`../`, `/etc/passwd`) → `ValueError`.
2. Injection : un titre `<script>alert(1)</script>`, `{{csp}}`, `</style>`, `" onload="` apparaît tel quel à l'image
   et dans le HTML échappé (même style que `tests/test_visuels.py`).
3. CSP : la page produite contient `script-src 'none'` et aucun `<script>`.
4. Rendu en cage : PNG valide, dimensions exactes pour chacun des cinq formats, taille ≤ 5 Mo, sRGB.
5. Réseau : un gabarit de test qui charge `https://exemple.invalid/x.png` rend l'image sans elle (CSP et cage), et le
   journal ne montre aucune connexion.
6. Provenance : XMP relu dans une autre cage ; absence = `ok=False` et rien de livré ; la porte du plugin refuse un
   PNG sans `provenance.json`.
7. Story : aucun élément de texte dans les bandes 14 % / 35 % / 6 % (boîtes lues par une capture de contrôle).

Étage 2 :

8. Pur : invite composée sans mot interdit possible, graine bornée, `sujet` hors liste refusé.
9. GPU occupé (`SortiesGpu` simulées) : l'étape attend, ne démarre pas.
10. Visage : une image de test contenant un visage de synthèse fournie au contrôle → refus.
11. Mesure réelle sur la 3080 (une fois les poids posés) : VRAM de crête, RAM, temps de chargement, temps par image
    à 1080x1350 et 4 pas.

## Coût en temps et en GPU

- Étage 1 : **0,39 s mesuré** hors cage par image, CPU seul, 94 Mio. Négligeable. Aucun GPU.
- Étage 2 : **non mesuré** (aucun téléchargement permis). Ce que disent les sources : 4 pas, « under a second on
  modern hardware » (éditeur, matériel non précisé), 8 à 13 Go de VRAM selon la page. Sur 10 Go avec déchargement
  vers la RAM, je m'attends (estimation, pas preuve) à un chargement de plusieurs dizaines de secondes par travail et
  quelques secondes par image ensuite ; d'où une cage par demande qui produit toutes les déclinaisons d'un coup.
  Le déchargement occupe environ 16 Go de RAM (poids du transformeur et de l'encodeur de texte en bf16, estimation) :
  `attendre_memoire` est nécessaire. Disque : de l'ordre de 16 à 24 Go de poids (la fiche Qubrid cite ~23,7 Go de
  checkpoint, source secondaire).

## Risques

| Risque | Gravité | Parade |
| --- | --- | --- |
| Images « propres mais génériques » si les gabarits sont faits vite et en DejaVu | Élevée pour l'objectif | Gabarits dessinés avec Impeccable (règle 7), 2 à 3 polices OFL figées, photos réelles de la marque |
| VRAM : Klein 4B ne tient pas sur 10 Go aux résolutions voulues | Moyenne | Mesure d'abord ; générer à 1024 de côté et cadrer ; sinon étage 2 abandonné, l'étage 1 reste complet |
| Visages ou ressemblance avec une personne réelle dans un fond IA | Élevée (droit à l'image) | Liste fermée sans personne + détecteur en cage + approbation humaine avant diffusion |
| Logos ou marques inventés par le modèle | Moyenne | Invite fixe « no logo, no text » + relecture humaine ; pas de contrôle automatique fiable connu |
| Divergence de la valeur IPTC (porte qui n'accepte que `trainedAlgorithmicMedia`) | Faible | Garder la valeur actuelle en v1 (sur-marquage prudent) ou élargir la porte à une liste fermée sur décision de l'opérateur |
| Dérive des dépendances (diffusers bouge vite) | Moyenne | Environnement séparé, `--require-hashes`, version épinglée, poids figés par commit |
| Accès conditionnel au dépôt Hugging Face de Klein (FLUX.1-schnell l'est ; Klein non vérifié) | Faible | Le téléchargement est un geste de l'opérateur, une fois |

## Ce qui reste à l'opérateur

1. Feu vert pour l'étage 1 seul (aucun coût, aucune dépendance) puis, séparément, pour l'étage 2 (téléchargement de
   ~16 à 24 Go de poids, environnement Python en plus, GPU partagé avec les jeux).
2. Polices à figer (proposition : 2 à 3 familles sous licence OFL choisies avec Impeccable).
3. Bibliothèque d'images de marque par entreprise : qui la remplit (lui, dans l'interface) et avec quel accord pour
   les photos où figure une personne.
4. Valeur IPTC et mention visible : sur-marquer en `trainedAlgorithmicMedia` partout (porte inchangée), ou valeurs
   exactes (`algorithmicMedia` sans IA, `compositeSynthetic` avec fond IA) ; mention visible seulement avec couche
   IA ? À faire confirmer par l'étude de droit en cours (article 50 du règlement (UE) 2024/1689).
5. Résolution : 1080 de large (cohérent avec la vidéo) ou 1440 (recommandation Meta).

## Non vérifié

- Temps et VRAM réels de Klein 4B sur la 3080 (aucun téléchargement permis).
- Encodeur de texte exact de Klein 4B et taille totale des poids (la carte ne le dit pas).
- Accès conditionnel du dépôt Klein 4B.
- Licence et version stable du détecteur de visages proposé (YuNet / OpenCV).
- Rendu du Chrome figé dans la cage bwrap (mesure faite hors cage).
