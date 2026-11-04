# Discussions multiples avec le Coordinateur et page « Tous les agents »

Date : 27/10/2026. Demandes de l'opérateur (captures du 27/10) : « comment on clear une discussion dans paperclip ? … pouvoir avoir un système d'historique façon claude ou chatgpt » et « il y a 29 départements mais quand je clique sur agents il n'y a que quelques agents ». Choix de l'opérateur : « Oui, tout » (nouvelle discussion, /clear, colonne d'historique, reprise) et « Page Tous les agents ».

## 1. Pourquoi

- **Discussion** : la vue `discussion` du plugin n'a qu'un fil permanent par entreprise (une issue native, `originId = discussion:<companyId>`, `plugin-atelier/src/serveur/services-discussion.ts:84-90`). Il grossit sans fin : pas moyen de repartir à zéro, ni de retrouver un ancien échange. Comme Paperclip ouvre une session Claude par tâche (`taskKey: issue.id`, `paperclip/server/src/services/heartbeat/run-state.test.ts:134`), le Coordinateur reprend aussi un contexte de plus en plus lourd et cher.
- **Agents** : chaque département est une entreprise Paperclip distincte (cloisonnement voulu). La page native « Agents » ne montre que l'entreprise courante (9 agents pour la Direction), alors que l'usine en compte 233.

## 2. Buts, non-buts, anti-buts

Buts :
- plusieurs discussions par entreprise, une colonne d'historique (plus récente en haut), un bouton « Nouvelle discussion », la commande `/clear` (et `/nouveau`) tapée seule qui fait la même chose, la reprise d'une ancienne discussion par un clic ;
- une page « Tous les agents » qui montre les agents de tous les départements du client, regroupés par département, avec état, filtre et lien vers la fiche native de chaque agent.

Non-buts : supprimer une discussion (rien n'est jamais supprimé dans l'usine), renommer une discussion à la main, rechercher dans le texte des messages, modifier la page native « Agents » de Paperclip.

Anti-buts (échec même si ça marche) : perte ou masquage de l'historique existant ; une discussion qui réveille le mauvais agent ou une autre entreprise ; une nouvelle capacité dans le manifeste du plugin (piège prouvé : bloque la mise à jour) ; contourner le cloisonnement entre entreprises ; allure « produite par IA », tiret cadratin, texte en anglais.

## 3. Discussions : décisions

1. **Une discussion = une issue native** marquée `originKind = plugin:<id>:discussion`. Nouvelles discussions : `originId = discussion:<companyId>:<uuid>`. Le fil existant (`discussion:<companyId>`) reste la plus ancienne discussion de l'historique, inchangé.
2. **Nouvelle discussion** (route `discussion.nouvelle`) : crée l'issue (statut `backlog`, assignée au coordinateur actuel, titre « Nouvelle discussion »), journalise `discussion.nouvelle`. Les discussions précédentes ne sont PAS fermées (choix de Claude après relecture : fermer une discussion où le Coordinateur travaille encore ferait arriver sa réponse dans un fil fermé ; une discussion ne réveille le Coordinateur que lorsque l'humain y écrit, donc la laisser ouverte ne coûte rien). Aucune action sur le coordinateur : la session neuve naît au premier message (clé de session = issue).
3. **Titre** : au premier message de l'humain dans une discussion intitulée « Nouvelle discussion », l'issue prend pour titre ce message aplati sur une ligne et coupé à 60 caractères.
4. **Historique** (route `discussion.lister`) : issues de l'entreprise de la requête avec le marqueur d'origine, dont `originId` vaut `discussion:<companyId>` ou commence par `discussion:<companyId>:`, hors `cancelled`, triées par dernière activité décroissante, 50 au plus. Rend `{issueId, identifiant, titre, majLe, statut}`.
5. **Ouvrir** : `discussion.ouvrir` accepte un `issueId` facultatif. Avec : ouvre cette discussion, après vérification qu'elle appartient à l'entreprise de la requête et porte le marqueur (sinon `introuvable`). Sans : la discussion la plus récemment active ; s'il n'y en a aucune, création comme aujourd'hui. `discussion.envoyer` et `discussion.messages` acceptent le même `issueId` facultatif (même contrôle) ; sans lui, ils visent la discussion la plus récemment active, comme `ouvrir` (choix de Claude : le pont WhatsApp, `whatsapp/src/atelier.ts:154-158` et `whatsapp/src/veille.ts:83`, appelle ces routes sans `issueId` et doit suivre la discussion que l'opérateur utilise). Écrire dans une discussion `done` la rouvre (règle actuelle d'`envoyer`). Ordre « plus récemment active » : `ctx.issues.list` n'expose pas de tri, lire large (100) puis trier en mémoire sur `updatedAt`.
6. **`/clear`** : `/clear` ou `/nouveau` seul (casse et espaces ignorés) déclenche « Nouvelle discussion » au lieu d'envoyer le texte. Le traitement est fait CÔTÉ SERVEUR dans `discussion.envoyer` (choix de Claude : il marche ainsi aussi depuis WhatsApp) ; la réponse indique la nouvelle discussion. Tout autre texte commençant par `/` est envoyé tel quel.
7. **Écran** : colonne gauche (bouton « Nouvelle discussion » en tête, puis la liste : titre sur une ligne, date relative, discussion ouverte marquée), fil à droite comme aujourd'hui. Fenêtre étroite : la colonne se replie derrière un bouton « Discussions ». Clavier : la liste est atteignable au Tab, `aria-current` sur la discussion ouverte.
8. **Ancienne télécommande** : les actions `atelier-actions` et les cartes natives restent liées à la discussion ouverte.
9. **Carte « tâches reçues à suivre » de la Direction** (`plugin-atelier/src/serveur/liaisons/cartes-services.ts:53-56`, aujourd'hui limitée au fil historique par `originId` exact) : elle couvre toutes les discussions de l'entreprise (choix de Claude : une tâche confiée depuis une nouvelle discussion ne doit pas disparaître du suivi). `chaine.ts:254` accepte déjà toute la famille `discussion:`.

## 4. Page « Tous les agents » : décisions

1. **Vue d'ensemble** `agents` (adresse `/atelier/agents`, rubrique des vues d'ensemble comme `departements`, `plugin-atelier/src/ui/rubriques.ts:94-124`), visible pour un client à au moins deux services.
2. **Données** : la liste des services vient de `departements.lister` (jamais un service d'un autre client) croisée avec `GET /api/companies` ; puis, pour chaque service, les agents par l'API de l'hôte avec le `companyId` de ce service (l'hôte vérifie l'accès), six lectures à la fois au plus (`LECTURES_SIMULTANEES`, `vues/departements.tsx`). Chaque département se remplit ou échoue seul, avec « Réessayer ». Agents `terminated` exclus.
3. **Affichage** : un groupe par département (ordre du registre), en-tête avec le nom et les compteurs ; par agent : nom, intitulé, état (actif, en pause, en erreur, en cours d'exécution), modèle, dernier battement en date relative, lien vers `/<PREFIXE>/agents/<id>` (comme `organigramme-service.tsx:514`). Ligne de résumé : « 233 agents dans 29 départements · 5 en cours · 2 en erreur ».
4. **Filtres** : onglets d'état (Tous, Actifs, En pause, En erreur, En cours), champ de recherche sur le nom et l'intitulé, choix d'un département. `#service=<slug>` à l'ouverture pré-filtre un département.
5. **Liens d'entrée** : sur la page Départements, un lien « Tous les agents » près de la ligne de résumé, et le nombre d'agents de chaque case devient un lien vers `/atelier/agents#service=<slug>`.
6. **« See all agents »** (barre latérale native, `paperclip/ui/src/components/SidebarAgents.tsx:669-678`, libellé écrit en dur, lien vers `/agents/all` de l'entreprise courante) : traduit en « Voir tous les agents » par patch numéroté du socle ; le lien natif reste natif (le cœur ne connaît pas le plugin). L'accès cohérent passe par une entrée « Tous les agents » dans les liens de la barre latérale du plugin, à côté de « Départements », si le mécanisme existant le permet sans nouvelle capacité (sinon, le lien depuis la page Départements suffit).

## 5. Contraintes

- Plugin seulement (sauf le libellé du point 4.6) ; aucune nouvelle capacité dans le manifeste ; les routes ajoutées suivent `exigerHumain` et le contrôle de `companyId` des routes existantes.
- Design par Impeccable (règle 7) : `critique` sur la vue Discussion et la page Départements actuelles, puis `layout` et `polish` ; style sobre de l'atelier, rien de décoratif, tout en français, aucun tiret cadratin.
- Tests : unitaires des routes (`plugin-atelier/tests/`), rendu des vues, et un essai réel sur l'instance 3100 après déploiement.
- Au plus 3 agents en parallèle sur ce dépôt.

## 6. Laissé au constructeur

Noms internes des composants, découpage des fichiers, forme exacte de la date relative, ordre des colonnes dans une ligne d'agent.
