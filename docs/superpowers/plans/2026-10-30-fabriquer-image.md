# Outil `fabriquer_image` : plan d'implémentation (lots I1 et I2)

> Pour l'agent qui exécute : suivre les tâches dans l'ordre, test d'abord, un commit par étape verte.

**But.** Le département Marketing livre de vraies images publicitaires finies (posts Facebook, Instagram, LinkedIn,
stories) au lieu d'un brief de visuel. Demande de l'opérateur du 30/10/2026 (« rajoute maintenant des outils »).

**Décision.** Les deux études indépendantes du 30/10 concluent la même chose (scratchpad de session,
`etude-images-a.md` et `etude-images-b.md`) :
- **I1** : composition HTML/CSS rendue en PNG fixe par le `chrome-headless-shell` déjà figé de la fabrique ;
- **I2** : en option, un fond ou une illustration SANS texte et SANS personne, générés en local sur la 3080 par
  FLUX.2 [klein] 4B (Apache-2.0, diffusers publié). L'image est posée derrière la composition d'I1.

Le texte, le logo et la mise en page restent toujours déterministes : aucun modèle n'écrit dans l'image.

**Contraintes.** Rien de payant ; jamais de bêta ; cage sans réseau ; tout en français ; aucun visage ni voix d'une vraie
personne ; design par Impeccable (règle 7, `PRODUCT.md` du dépôt) ; aucun tiret cadratin dans les gabarits.

## Choix arrêtés (tranchés par Claude d'après les deux études, à montrer à l'opérateur au test)

- **Formats** : `1080x1080`, `1080x1350`, `1440x1800` (4:5 recommandé par l'aide de Meta), `1080x1920` (story),
  `1200x628` (valeur de l'aide officielle de LinkedIn ; 627 refusé). `1440x2560` écarté tant qu'il n'est pas vérifié
  sur le guide de Meta.
- **Gabarits** : `accroche`, `chiffre_cle`, `liste_3_points`, `offre`. Les champs sont bornés par gabarit (même principe
  que `CHAMPS_GABARIT` des vidéos) : `titre` ≤ 90, `sous_titre` ≤ 160, `chiffre` ≤ 20, `points` = 3 × ≤ 80,
  `appel_action` ≤ 30, `mentions_legales` ≤ 200.
- **Charte** : identifiant `^[a-z0-9-]{1,64}$` qui renvoie au registre humain `chartes-autorisees/<entreprise>/<id>.json`,
  sur le modèle de `voix-autorisees/`. Il contient :
  - les couleurs `#RRGGBB` ;
  - une police prise dans une liste fixe ;
  - un logo PNG d'au plus 1 Mo et 2000×2000 (dimensions lues dans IHDR).

  L'agent ne fournit jamais ni fichier, ni URL, ni couleur.
- **Polices** : 2 ou 3 familles sous licence OFL, figées par empreinte SHA-256, comme DejaVu aujourd'hui ; choisies
  pendant le passage Impeccable.
- **Sorties** :
  - `image.png` en sRGB, sans transparence, de 8 Mo au plus ;
  - `provenance.json` ;
  - XMP IPTC dans le PNG ;
  - un aperçu dans `etat_fabrication`.
- **Mention IA** : un bandeau posé par le gabarit, **obligatoire** dès qu'il y a `fond_ia`. Pour une image purement
  typographique, on suit la règle des documents. La valeur IPTC reste `trainedAlgorithmicMedia` en v1, la plus prudente,
  que la porte exige déjà.
- **CSP** : `default-src 'none'; script-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'`.

## Lot I1 (CPU seul, aucun téléchargement de modèle)

1. **Porte** : `plugin-atelier/src/serveur/fabrique-provenance.ts:20`. Ajouter `png` (et `jpg`) à
   `EXTENSIONS_CONTROLEES`, accepter le type `image`, exiger la mention visible quand il y a `fond_ia`.
   Test rouge d'abord : un `.png` sans provenance passe aujourd'hui.
2. **Générateur** `fabrique/generateurs/images.py`, sur le modèle de `visuels.py`. Il importe `_texte`, `CHROME`,
   `POLICES`, `MEMOIRE_CAGE_OCTETS` et `PROCESSUS_MAX_CAGE`, sans les recopier. Dans la cage, il lance :
   `chrome-headless-shell --screenshot=/sortie/image.png --window-size=L,H --hide-scrollbars --force-device-scale-factor=1 file:///tmp/projet/index.html`.
3. **Gabarits** : `fabrique/hyperframes/gabarits-images/<gabarit>/{index.html,scene.css}`, passés par Impeccable
   (`critique`, `typeset`, `layout`, `polish`). Chaque gabarit est rendu au plafond de caractères (« W »), pour chaque
   format, sans débordement.
4. **Provenance** : `fabrique/provenance.py`, `ecrire_xmp` et `poser_provenance` généralisés au PNG (PerTh reste réservé
   à la vidéo).
5. **Service** : `fabrique/service.py`, `REGISTRE["image"]` et un quota `images` par jour.
6. **Plugin** : dans `fabrique-outils-schemas.ts`, `NOM_OUTIL_FABRIQUER_IMAGE`, `FORMATS_IMAGE` et `GABARITS_IMAGE` ;
   dans `fabrique-outils.ts`, `validerDemandeImage`, sur le modèle de `validerDemandeVideo`, avec un schéma fermé à chaque
   niveau. L'outil est ajouté au manifeste (`src/manifest.ts`, `tools`). Il est classé dans `organisation/registre/agents.json`
   et autorisé pour `contenus` et `reseaux-sociaux` ; `verifier-organisation.py` (DOC-A1) refuse un outil non classé.
7. **Consignes et skills** : Contenus et Réseaux sociaux livrent une image finie par `fabriquer_image` (et non plus un
   simple brief) ; le skill `conformite-publicite-ia` couvre l'image. Régénérer les fiches d'agents et la fiche des routes.

**Tests d'I1** :
- validations : gabarit, champ ou format inconnu ; plafond dépassé de 1 ; 1200x627 refusé ;
- échappement : `<script>`, `{{titre}}` et les guillemets restent du texte ;
- charte : hors registre, logo trop gros ou couleur hors motif sont refusés ;
- rendu réel en cage (test lent) :
  - dimensions exactes ;
  - image non uniforme ;
  - aucune ressource `http` chargée ;
  - XMP relu ;
- porte : un `.png` sans provenance est refusé ;
- plugin : un champ en trop est refusé ; `fond_ia` est refusé tant qu'I2 est coupé.

## Lot I2 (après I1)

- Poids de FLUX.2 [klein] 4B, environ 16 Go en safetensors :
  - posés par l'opérateur ;
  - révision Hugging Face fixée par commit, SHA-256 ;
  - `HF_HUB_OFFLINE=1`.

  Un `venv-image` séparé, avec une version publiée de diffusers.
- `fabrique/generateurs/fond_ia.py` : étape `type="gpu"`, `hors_ligne=True`, poids montés en lecture seule ; la règle des
  jeux de `gpu.py` s'applique. La consigne fixe ajoute « no people, no faces, no text, no logos ». La sortie `fond.png` est
  contrôlée (signature, dimensions) puis posée sous le gabarit.
- Mesure sur la 3080 : mémoire vidéo maximale inférieure à 8 Gio, et temps par image. Si la mesure échoue, secours SDXL
  base 1.0.
- Tests :
  - GPU occupé, la demande passe `en_attente_gpu` ;
  - poids absents ou SHA-256 faux, refus clair ;
  - mauvaises dimensions, refus.

## Fin

- Une seule revue `securite`, sur l'ensemble des lots de la soirée.
- Déploiement : plugin, fabrique et `appliquer`.
- Cas 4 des tests réels du Marketing (mémoire `tests-marketing-4-cas`).
