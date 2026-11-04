# Discussions multiples et page « Tous les agents » : plan

> Pour les agents : deux lots indépendants (fichiers disjoints), exécutés en parallèle, chacun en TDD, commit à chaque étape verte.

**But** : plusieurs discussions par entreprise avec historique, `/clear`, reprise ; une page qui montre les agents des 29 départements.

**Architecture** : tout dans le plugin `plugin-atelier` (routes serveur + vues React), aucune capacité nouvelle ; un seul patch du socle (libellé « See all agents »).

**Pile** : TypeScript, React, vitest (`pnpm test`), `pnpm typecheck`, dans `plugin-atelier/`.

**Spécification** : `docs/superpowers/specs/2026-10-27-discussions-et-tous-les-agents-design.md` (à lire en entier : elle est courte et fait foi).

## Contraintes globales

- Aucune nouvelle capacité dans `src/manifest.ts` (les routes ajoutées à `src/contrats/routes.ts:108-111` réutilisent `api.routes.register`, déjà déclarée, `manifest.ts:49` ; le blocage de mise à jour ne compare que les capacités, `paperclip/server/src/services/plugin-loader.ts:1844-1857`).
- Toute route nouvelle : `exigerHumain` + contrôle du `companyId` comme les routes voisines.
- Textes visibles en français, aucun tiret cadratin, aucun fait inventé.
- Design : skill `impeccable` (règle 7) : `critique` de l'écran actuel, puis `layout` et `polish` ; style sobre existant de l'atelier (`src/ui/styles-*.ts`), rien de décoratif.
- Tests ciblés pendant le lot (`pnpm exec vitest run tests/<fichier>`), suite complète `pnpm test` + `pnpm typecheck` une fois à la fin du lot.
- Commits : `git commit -o -F <fichier> -- <chemins exacts>` ; jamais `git add .`, `git stash`, worktree, `pkill -f`.

## Points à couvrir par des tests (risques)

1. Un `issueId` d'une autre entreprise ou sans marqueur d'origine passé à `ouvrir`/`envoyer`/`messages` : refus `introuvable`, rien d'écrit.
2. Sans `issueId`, `envoyer` vise la discussion la plus récemment active (et non le fil historique) : test avec deux discussions.
3. `/clear`, ` /Nouveau ` (casse, espaces) : nouvelle discussion, aucun commentaire posé, aucun réveil ; `/clear merci` : envoyé tel quel.
4. Le fil historique `discussion:<companyId>` apparaît dans `discussion.lister`.
5. Page agents : un département en échec de lecture n'empêche pas les autres de s'afficher, avec « Réessayer ».

---

### Lot A : discussions multiples

**Fichiers** : `src/serveur/services-discussion.ts`, `src/contrats/routes.ts` (clés `discussion.nouvelle`, `discussion.lister`, `issueId` facultatif dans les entrées existantes), `src/serveur/liaisons/cartes-services.ts:53-56`, `src/ui/vues/discussion.tsx` (+ styles), `tests/discussion.spec.ts`, `tests/cartes-services.spec.ts`. Lire aussi `whatsapp/src/atelier.ts:154-158` (appelant sans `issueId`, ne pas le casser).

**Interfaces produites** :
- `discussion.lister` → `{ discussions: { issueId, identifiant, titre, majLe, statut }[] }` (50 au plus, plus récente d'abord) ;
- `discussion.nouvelle` → même forme que `discussion.ouvrir` ;
- `discussion.ouvrir|envoyer|messages` : `issueId?` en entrée ; `envoyer` sur `/clear` rend `{ nouvelle: <forme de ouvrir> }`.

- [ ] Tests rouges des points 1 à 4 et du titre (premier message → titre de 60 caractères au plus, une ligne) ; les voir échouer.
- [ ] Serveur : `chercher` remplacé par une lecture des discussions de l'entreprise (`ctx.issues.list` par `originKind` seul, 100, filtre `originId` exact ou préfixe `discussion:<companyId>:` en mémoire, tri `updatedAt` décroissant) ; routes nouvelles ; `/clear` côté serveur ; titre au premier message. Tests verts. Commit.
- [ ] Carte des tâches reçues : toutes les discussions de l'entreprise (test dans `cartes-services.spec.ts`). Commit.
- [ ] Interface : colonne d'historique, bouton « Nouvelle discussion », reprise au clic, repli en fenêtre étroite, `aria-current`, champ qui accepte `/clear` (le serveur décide). Passer par Impeccable. Commit.
- [ ] `pnpm test` et `pnpm typecheck` ; noter les résultats.

### Lot B : page « Tous les agents »

**Fichiers** : `src/ui/vues/agents.tsx` (nouveau) + styles, `src/ui/rubriques.ts:94-124` (vue d'ensemble `agents`), `src/ui/route.ts` si la liste des vues y est, `src/ui/index.tsx:240-275` (entrée « Tous les agents » de la barre latérale, sous « Départements », même condition `aPlusieursDepartements`), `src/ui/vues/departements.tsx` (lien « Tous les agents » près du résumé ; nombre d'agents de chaque case en lien `#service=<slug>`), tests de rendu `tests/agents-vue.spec.ts` (nouveau) et `tests/departements.spec.ts`. Patch du socle : `paperclip/ui/src/components/SidebarAgents.tsx:669-678` « See all agents » → « Voir tous les agents », commit dans le clone `paperclip/`, puis `git format-patch -1 HEAD --start-number 104 -o ../socle/patches` et commit du patch dans l'usine.

**Interfaces consommées** : `departements.lister` (liste des services du client), `GET /api/companies` et `appelHote("GET", "/companies/<id>/agents")` (`src/ui/hote.ts:17`), `LECTURES_SIMULTANEES` (`vues/departements.tsx`).

- [ ] Tests rouges : regroupement par département dans l'ordre du registre, exclusion `terminated`, compteurs, filtres état + texte + département, `#service=<slug>`, département en échec isolé avec « Réessayer », lien `/<PREFIXE>/agents/<id>`.
- [ ] Vue et données ; tests verts. Commit.
- [ ] Entrées : barre latérale du plugin et liens depuis Départements (tests). Passer par Impeccable. Commit.
- [ ] Patch 0104 du socle (libellé), tests du composant natif s'il en a. Commit.
- [ ] `pnpm test` et `pnpm typecheck` ; noter les résultats.

## Après les deux lots (Claude)

Une revue unique du diff cumulé, construction et déploiement du plugin (`scripts/deployer.sh`) et redémarrage de 3100 par systemd avec les patches 0100 à 0104, essai réel dans le navigateur.
