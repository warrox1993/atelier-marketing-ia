# Pièces fictives du banc d'essais des compétences

Les cas d'essai des études (`docs/etude-usine-v2/groupe-*.md`) décrivent des pièces (contrat, extrait bancaire,
tableau) sans les fournir. Ce dossier les matérialise : `tests/banc/pieces/<département>/<clé du cas>/`, la clé étant
celle du cas (`g3-3.3.1` : groupe 3, section 3.3, cas 1). 76 cas sur 84 ont des pièces ; les 8 autres ont un énoncé
complet (tout est dans l'entrée).

- **Aucune donnée réelle.** Noms et sociétés inventés, courriels en `@exemple.invalid`, téléphones masqués, IBAN
  fictifs à clé de contrôle `00` (jamais valides) marqués « fictif » sur la même ligne. `tester-banc.py` le vérifie.
- **Injection.** `banc_commun.tous_les_cas()` joint les pièces à chaque cas ; `texte_entree()` les ajoute à l'énoncé
  vu par le modèle local, le juge local et le juge Claude. Elles sont aussi chargées dans Phoenix (entrée de
  l'exemple : `pieces` et `entree_complete`).
- **Critères vérifiables par code.** `criteres.json` (facultatif) liste des critères en plus de ceux de l'étude :
  `nombres` (tous présents, toute graphie : `1 815,00`, `1.815,00`, `1815.00`), `un_parmi`, `nombres_interdits`,
  `mots` (variantes `a|b`), `interdits`. Jugés par code, sans juge local (source `code-piece`).
- **Tailles.** Au plus 12 000 caractères par cas (fenêtre du modèle local : 16 384 jetons). Les fichiers volumineux
  (500 lignes de clients, 300 contacts) sont remplacés par un profil chiffré et un extrait, dit comme tel dans la pièce.
- **Cohérence.** `tester-banc.py` recalcule à partir des pièces les valeurs des critères chiffrés (rapprochement
  bancaire, écarts budgétaires, coûts sur 3 ans, TVA, stock, météo des projets...).
