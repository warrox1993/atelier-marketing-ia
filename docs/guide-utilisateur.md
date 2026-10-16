# Guide d'utilisation de l'Atelier marketing

Ce guide s'adresse à la personne qui pilote l'atelier au quotidien. Il ne demande aucune connaissance technique. Les noms entre guillemets sont ceux des boutons et des menus à l'écran.

## 1. Parler à l'équipe

**À quoi ça sert.** Vous écrivez à votre Coordinateur, comme à un collègue. Il connaît l'état de l'atelier et répartit le travail entre les autres agents.

**Comment faire**
1. Cliquez sur « Nouvelle tâche ». Cela ouvre la Discussion avec le Coordinateur.
2. Écrivez votre message dans le champ « Écrivez au Coordinateur ». Des suggestions sont proposées (par exemple « Où en sont les missions ? » ou « Qu'est-ce qui est bloqué ? »).
3. Cliquez sur « Envoyer ».
4. Lisez la réponse. Elle cite des numéros de tâche cliquables et des chiffres lus dans l'atelier.
5. Si le Coordinateur propose une action réservée à vous (pause d'un agent, réglage, plafond, approbation, publication, envoi, dépense, suppression), une carte « Confirmer » apparaît dans la discussion. Cliquez sur « Confirmer » ou sur « Annuler ».

**Bon à savoir**
- Trois cas se présentent. Une question d'état : il lit et répond. Une action simple qu'il a le droit de faire (créer une routine, lancer une prospection, créer un projet) : il la fait, puis dit ce qui a été fait. Un vrai travail (campagne, étude) : il crée une mission à part et vous donne son numéro. Le plan à valider se trouve alors sur cette mission, pas dans la discussion.
- Le Coordinateur ne peut pas faire à votre place ce qui est réservé à un humain. Il vous indique l'écran où le faire.
- La discussion reste ouverte. Elle n'est jamais « terminée » : elle attend votre message suivant.

## 2. Dicter un message

**À quoi ça sert.** Parler au lieu de taper. La voix est transformée en texte, que vous relisez avant l'envoi.

**Comment faire**
1. Dans la Discussion, cliquez sur « Dicter ».
2. Autorisez le micro si le navigateur le demande (la première fois seulement).
3. Parlez. Le bouton devient « Arrêter la dictée ». Cliquez dessus quand vous avez fini.
4. Attendez la transcription (le bouton affiche « Transcription… »). Le texte arrive dans le champ de message.
5. Corrigez le texte si besoin, puis cliquez sur « Envoyer ».

**Bon à savoir**
- La transcription se fait sur votre poste, avec Whisper, un outil de reconnaissance vocale installé en local. L'enregistrement ne quitte pas le poste et n'est pas conservé.
- Le texte est toujours modifiable. Rien n'est envoyé sans votre clic sur « Envoyer ».
- Un enregistrement est limité en taille (environ 600 Ko d’audio) ; la durée correspondante dépend du navigateur. Au-delà, la dictée s’arrête avec un message : dictez alors en plusieurs fois. Si le texte était déjà dans le champ, il est ajouté à la suite de ce que vous avez écrit.
- Si le bouton est grisé, la dictée locale n'est pas disponible sur ce poste.

## 3. Parler en direct

**À quoi ça sert.** Tenir une vraie conversation vocale avec un assistant qui connaît l'état de l'atelier (missions, tâches bloquées, résumé des prospects).

**Comment faire**
1. Vérifiez qu'une clé OpenAI a été configurée par la personne qui administre l'atelier. Sans clé, la fonction répond qu'elle n'est pas configurée.
2. Dans la Discussion, cliquez sur « Parler en direct » et autorisez le micro.
3. Parlez normalement. L'assistant répond à voix haute. Son état s'affiche (connexion, écoute, réflexion, parole).
4. Quand vous voulez agir, l'assistant propose un texte à transmettre au Coordinateur. Relisez-le, puis cliquez sur « Transmettre ». Cliquez sur « Annuler » pour ne rien envoyer.
5. Cliquez sur « Arrêter » pour finir.

**Bon à savoir**
- L'assistant lit l'état de l'atelier. Il ne modifie rien lui-même. Aucune demande ne part vers le Coordinateur sans votre clic sur « Transmettre ».
- Ce que vous dites passe par OpenAI, un service extérieur. Ne dictez pas d'information que vous ne voulez pas lui confier. La dictée du chapitre 2, elle, reste sur votre poste.
- Le micro n'est accessible qu'en connexion sécurisée (HTTPS) ou à l'adresse locale du poste. Sinon un message l'explique.

## 4. Prospects

**À quoi ça sert.** Savoir quels prospects valent un contact, et pourquoi.

**Le badge.** Chaque prospect porte un badge.
- « Qualifié » : le prospect correspond à votre cible et n'a pas été exclu.
- « Écarté » : il a été exclu ou refusé, ou un critère va à l'encontre de votre cible.
- « À vérifier » : tous les autres cas. Le détail indique souvent combien de critères manquent encore.

**La confiance.** Elle se calcule à partir de critères (par exemple la taille connue de l'entreprise). Chaque critère actif a un poids. Un prospect est qualifié quand sa confiance atteint le seuil réglé.

**Modifier un critère à la main**
1. Ouvrez la fiche du prospect, puis la liste de ses critères.
2. Cliquez sur « Modifier » à côté du critère.
3. Choisissez le nouveau statut.
4. Écrivez une justification. Elle est obligatoire (3 caractères au moins) et elle est conservée avec votre nom.
5. Cliquez sur « Enregistrer la décision », ou sur « Annuler ».
6. Pour défaire votre décision, cliquez sur « Revenir au calcul automatique ».

**Les critères personnalisés.** Vous pouvez ajouter vos propres critères (par exemple « possède un toit plat »). L'agent Prospection les évalue lui-même sur chaque prospect. Votre décision manuelle passe toujours avant la sienne.

**Les réglages.** Ils se trouvent dans Paramètres, section « Critères des leads ».
1. Cochez ou décochez un critère pour l'activer ou non.
2. Réglez son poids, de 0 à 100.
3. Réglez le « Seuil de qualification (%) ».
4. Pour un critère personnalisé, remplissez « Ajouter un critère personnalisé » (libellé, poids, description facultative) puis « Ajouter le critère ».
5. Cliquez sur « Enregistrer ».

**Bon à savoir**
- Gardez au moins un critère actif avec un poids. Sinon l'enregistrement est refusé et le message dit pourquoi.

## 5. Quand un agent bloque

**À quoi ça sert.** Éviter qu'un livrable médiocre parte, et éviter que l'équipe tourne en rond.

**Ce qui se passe**
1. Un livrable est contrôlé. S'il est refusé, l'agent le corrige. C'est un cycle de correction.
2. Après 3 cycles refusés, l'agent s'arrête et la tâche passe en « décision humaine requise ». 3 est la valeur par défaut. Elle se règle dans Paramètres, section « Réglages » (« Cycles de correction avant escalade »).
3. Vous décidez : vous pouvez par exemple relancer la correction avec une information ou une consigne en plus. Toute décision de votre part remet le compteur à zéro.
4. Un veilleur surveille les tâches restées sans suite. Il réveille l'agent concerné, au plus 3 fois pour une même tâche, puis il s'arrête.

**Où voir les blocages**
- Dans la rubrique « Équipe » : la colonne « Blocages » indique le nombre de blocages de chaque agent. Cliquer sur un agent donne le détail.
- Dans la Discussion : demandez « Qu'est-ce qui est bloqué ? ».
- Dans Paramètres, section « Diagnostic », la ligne « Blocages de revue ».

**Bon à savoir**
- Un livrable dont le contrôle n'est pas réussi ne part jamais. Il n'y a pas d'exception « malgré les défauts ».
- Si le serveur est arrêté en cours de route, le travail ne reprend pas tout seul : une action de votre part est nécessaire.

## 6. Sur téléphone

**À quoi ça sert.** Faire sur téléphone la même chose que sur ordinateur.

**Comment faire**
1. Barre du bas : le bouton « Atelier » remplace « Accueil » quand l'atelier est prêt. « Nouvelle tâche » ouvre la Discussion.
2. Dans une tâche : touchez « Propriétés » pour changer le statut, la priorité et les autres champs. Le panneau s'ouvre en feuille et se referme avec son bouton.
3. Dans Paramètres : utilisez le sommaire en haut. Un toucher ouvre la section choisie. Les sections sont repliables.
4. Dans Prospects : touchez « Filtres » pour ouvrir le volet des filtres. Le titre indique combien de filtres sont actifs.
5. La barre d'onglets de l'atelier défile de côté. Une ombre sur le bord droit indique qu'il en reste.

**Accès à distance.** L'idée est d'ouvrir l'atelier depuis un téléphone hors de chez vous, par Tailscale (un réseau privé entre vos appareils) avec un compte. C'est en préparation et ce n'est pas encore actif. Pour l'instant, l'atelier s'utilise depuis le poste ou le réseau local.

**Bon à savoir**
- Les boutons et les champs font au moins 44 pixels sous 640 pixels de large, pour être faciles à toucher.

## 7. Ce qui reste en anglais ou en démonstration

Soyons clairs sur les limites actuelles.

- Certains écrans de la plateforme qui héberge l'atelier (Routines, Agents, tâches, boîte de réception) contiennent encore de l'anglais. La traduction se fait écran par écran.
- Les données de l'atelier sont des données de démonstration tant que le mode réel n'est pas activé. Les chiffres de démonstration sont signalés comme tels.
- Les connexions aux outils extérieurs (Google, réseaux sociaux, CRM) sont simulées en mode démonstration. Les connexions réelles se mettent en place une par une.
- Le bouton « Diffuser » est visible mais grisé : aucun connecteur de publication n'existe encore. Rien n'est publié ni envoyé sans votre décision.
- La voix en direct n'a pas encore été essayée avec une vraie clé OpenAI sur ce poste. Elle est livrée et testée sans clé.
- L'accès à distance (chapitre 6) n'est pas actif.

## 8. Petit glossaire : les mots de l'atelier

Le nom de l'entreprise active s'affiche en haut de chaque page (« Entreprise : … »), avec la mention « Démonstration » ou « Client réel ». Vérifiez-le avant d'agir.

| Mot affiché | Ce que cela veut dire | Ancien mot technique |
| --- | --- | --- |
| Contrôle automatique | Vérification faite par le serveur, sans IA, avant qu'un livrable vous soit présenté : exigences couvertes, preuves, revues réussies. | porte, porte déterministe |
| Passage | Une exécution d'un agent sur une tâche. | run |
| Exigence (avec son titre) | Une demande précise tirée du brief. Le repère court (REQ-001) reste affiché en petit pour retrouver la ligne. | REQ-xxx affiché seul |
| Politique de relecture verrouillée | Les relectures obligatoires ne peuvent pas être contournées. | P1 |
| Contrôle automatique imposé par le serveur | Le serveur refuse de terminer une tâche sans contrôle réussi. | P2 |
| Paperclip | La plateforme qui héberge l'atelier et fait tourner les agents. | moteur natif |
| Données fictives fixes | Données de démonstration toujours identiques, sans IA ni appel extérieur. | fixtures déterministes |
