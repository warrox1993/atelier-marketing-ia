# Présentation de l'Atelier Marketing IA

Réunion avec le manager, demain à 16 h. Durée visée : 20 minutes de démonstration, puis les questions.

Objectif de la réunion : que le manager voie que l'atelier fonctionne et que les comptes du courtier « se branchent » sans développement supplémentaire.

Règle de vocabulaire : on ne nomme jamais le client réel. On dit « le courtier ». Dans l'application, l'entreprise s'appelle « Courtier Démo (démonstration) ».

---

## 1. Avant la réunion

### La veille au soir

- [ ] Répéter le déroulé une fois en entier, chrono en main, sur l'application ouverte. Noter l'emplacement exact de chaque bouton cité plus bas (le texte ci-dessous donne le chemin par le menu ; les boutons à l'intérieur des pages sont à repérer pendant la répétition).
- [ ] Lancer une tâche au Coordinateur (menu de gauche, **New Task**) pour avoir un résultat à montrer demain. Exemple de demande : « Prépare une proposition de publication pour la fiche d'établissement du courtier sur l'assurance habitation, avec sources. » Vérifier le lendemain matin qu'elle a avancé et qu'un livrable attend dans **Approbations**.
- [ ] Faire des captures d'écran de secours des pages **Prospects** (liste et une fiche) et **Connaissances** (la recherche « franchise dégâts des eaux habitation » avec son résultat). Les captures existantes de `docs/captures/` couvrent déjà les campagnes, les dossiers, l'équipe, la marque, les paramètres et la galerie de connecteurs, mais pas ces deux pages.
- [ ] Choisir la fiche prospect à ouvrir en direct (une entreprise fusionnée BCE et OpenStreetMap, avec un canal refusé et sa raison). Noter son nom.

### Dix minutes avant

- [ ] L'application répond sur http://127.0.0.1:3100.
- [ ] L'entreprise sélectionnée est bien « Courtier Démo (démonstration) ».
- [ ] La tâche lancée la veille a un résultat visible, et un livrable attend une approbation.
- [ ] Le quota Claude n'est pas épuisé (fenêtre de 5 heures et semaine). Si la jauge est basse, ne pas lancer de nouvelle tâche en direct : montrer celle de la veille.
- [ ] Onglets ouverts dans cet ordre : Agents, Approbations, Connectors, Prospects, Connaissances, Marque et sources. Aucun autre onglet personnel visible.
- [ ] Notifications du poste coupées, zoom du navigateur lisible à distance.
- [ ] Captures de secours ouvertes dans une fenêtre à part.

---

## 2. Déroulé minute par minute

Total : 20 minutes.

| Temps | Durée | Étape |
| --- | --- | --- |
| 0:00 à 2:00 | 2 min | Ouverture : le problème du courtier |
| 2:00 à 5:00 | 3 min | Temps 1 : l'organisation (13 agents) |
| 5:00 à 8:00 | 3 min | Temps 2 : les garde-fous et l'approbation humaine |
| 8:00 à 11:00 | 3 min | Temps 3 : les connecteurs « en un clic » |
| 11:00 à 15:00 | 4 min | Temps 4 : les prospects |
| 15:00 à 17:00 | 2 min | Temps 5 : les connaissances du courtier |
| 17:00 à 18:30 | 1 min 30 | Temps 6 : la marque du courtier |
| 18:30 à 20:00 | 1 min 30 | Conclusion |

### 0:00 à 2:00. Ouverture : le problème du courtier

À dire, sans écran ou sur la page d'accueil :

- Le courtier vend de l'assurance aux particuliers et aux entreprises, dans la province de Liège.
- Son marketing demande beaucoup de petites tâches : surveiller le marché, trouver des prospects, écrire des contenus, suivre Google et les réseaux, tenir le CRM (le fichier clients).
- Dans un métier réglementé, une erreur coûte cher : un chiffre faux dans une offre, un appel à quelqu'un qui a refusé d'être démarché.

**La phrase :** « J'ai construit une équipe d'agents qui prépare tout ce travail, mais qui ne publie, n'envoie et ne dépense rien sans l'accord d'un humain. »

### 2:00 à 5:00. Temps 1 : l'organisation

Clics :

1. Menu de gauche, **Agents**. Montrer la liste des 13 agents.
2. Pointer le **Coordinateur** : c'est l'agent de tête, assigné par défaut.
3. Pointer les spécialistes : Veille, Prospection, Contenus, SEA (publicité payante sur Google), SEO local (être trouvé dans les recherches locales), CRM, Mesure, Exigences, Relecteur, Tests techniques. Ils tournent sur Claude.
4. Pointer les deux contrôles sans IA : **Porte de contrôle** et **Gardien des connexions**. Ce sont des programmes à règles fixes : même entrée, même verdict.
5. Menu de gauche, **Tasks**. Ouvrir la tâche lancée la veille et montrer comment le Coordinateur l'a découpée et répartie.

**La phrase :** « On parle à un seul interlocuteur, le Coordinateur, comme à un chef de projet. Il découpe la demande et la confie aux bons spécialistes. »

### 5:00 à 8:00. Temps 2 : les garde-fous

Clics :

1. Menu de gauche, page **Atelier marketing**, rubrique **Dossiers**. Ouvrir le livrable de la tâche de la veille.
2. Montrer les sources citées, puis les relectures faites par des agents indépendants de celui qui a écrit.
3. Montrer le passage par la porte de contrôle.
4. Rubrique **Approbations** : montrer que le livrable attend une décision humaine.
5. Rubrique **Paramètres** : montrer les plafonds de dépense (IA et publicité). Le client choisit un montant ou « illimité ». Une dépense publicitaire reste toujours à approuver par un humain.

**La phrase :** « Chaque livrable est sourcé, relu par d'autres agents, contrôlé par des règles fixes, et rien ne sort tant qu'un humain n'a pas approuvé. L'atelier ne contacte jamais personne lui-même. »

### 8:00 à 11:00. Temps 3 : les connecteurs

C'est le cœur de la demande du manager.

Clics :

1. Menu de gauche, **Connectors**. Montrer la galerie de 16 cartes.
2. Parcourir les familles :
   - Google : Search Console, GA4 (statistiques du site), Ads, Fiche d'établissement.
   - Réseaux : Facebook, Instagram, LinkedIn.
   - CRM : HubSpot, Pipedrive, Odoo, Teamleader.
   - Registres publics : BCE (registre belge des entreprises), BNB (comptes annuels déposés), FSMA (registre des intermédiaires d'assurance).
   - OpenStreetMap (commerces) et Particuliers (demandes de devis et clients).
3. Ouvrir la carte **OpenStreetMap** : elle tourne sur des données réelles, 147 190 établissements belges, sous licence ODbL (licence libre qui impose de citer la source), avec la mention « © les contributeurs d'OpenStreetMap ».
4. Ouvrir une carte en démonstration, par exemple **HubSpot** ou **Facebook**, et montrer le bouton de connexion.

**La phrase :** « Aujourd'hui, une carte tourne déjà sur des données réelles et les autres sur des données fictives mais réalistes. Le jour où le courtier crée ses comptes, on clique sur "connecter" : le code de connexion réelle est déjà écrit, il n'y a rien à redévelopper. »

À ajouter si le manager creuse : le code réel existe pour Google, Meta, LinkedIn, HubSpot, Pipedrive, Odoo, Teamleader, BCE, BNB et OpenStreetMap. Il sera validé sur les vrais comptes au moment de la connexion, puisque ces comptes n'existent pas encore.

### 11:00 à 15:00. Temps 4 : les prospects

Clics :

1. Page **Atelier marketing**, rubrique **Prospects**. Montrer la liste : 97 prospects, entreprises, particuliers et partenaires au même rang.
2. Expliquer le circuit en une phrase : la réponse du connecteur est signée (on sait d'où elle vient), puis contrôlée, puis filtrée par les exclusions, puis notée.
3. Montrer les 24 exclus et leur motif lisible : opposition, doublon, hors zone, déjà client.
4. Montrer l'exemple des 20 commerces OpenStreetMap reconnus comme des entreprises déjà trouvées dans la BCE (même nom, même code postal, même téléphone) : ils sont fusionnés au lieu d'être comptés deux fois.
5. Ouvrir la fiche choisie la veille :
   - le score expliqué critère par critère ;
   - les canaux permis ou refusés, avec la raison légale (RGPD, liste « Ne m'appelez plus ») ;
   - le libellé du score : « estimation ». Il ne deviendra « probabilité mesurée », avec une marge, qu'au-delà de 300 prospects et 30 ventes. Jamais « certitude ».
6. Montrer l'export CSV ou Excel, et l'export vers le CRM, qui ne part qu'après approbation.
7. Mentionner l'import guidé de la base clients (CSV ou Excel) : données personnelles chiffrées, colonnes sensibles refusées (santé, sinistre, banque).
8. Mentionner les ventes croisées : par exemple un client qui a une assurance auto sans assurance habitation.

**La phrase :** « Chaque prospect a un score qu'on peut expliquer ligne par ligne, et pour chaque canal on sait s'il est permis et pourquoi. On n'appelle pas quelqu'un qui a dit non. »

### 15:00 à 17:00. Temps 5 : les connaissances du courtier

Explication simple : l'atelier a une bibliothèque des documents du courtier, et les agents doivent y chercher et citer leurs sources avant d'écrire.

Clics :

1. Rubrique **Connaissances**. Montrer les 17 documents importés : tarifs, conditions générales, FAQ en français et en néerlandais, argumentaires. Montrer que le questionnaire de santé a été refusé.
2. Taper la recherche « franchise dégâts des eaux habitation ». Résultat attendu : article 12, 275 €, avec la citation (document, version, validité).
3. Montrer qu'un document périmé est signalé.

**La phrase :** « Un agent ne peut pas inventer un chiffre d'offre : s'il n'a pas de source, la porte de contrôle refuse le livrable. Et une consigne cachée dans un document n'a aucun effet. »

### 17:00 à 18:30. Temps 6 : la marque du courtier

Clics :

1. Rubrique **Marque et sources**.
2. Montrer : 12 offres B2C et B2B, 12 bureaux, 3 entités, 11 segments, et le module « intermédiaire d'assurance ».

**La phrase :** « Les agents écrivent avec les offres, les bureaux et les publics du courtier, pas avec des généralités. »

### 18:30 à 20:00. Conclusion

- Revenir sur la galerie **Connectors**.
- Rappeler les trois points : ça tourne, c'est contrôlé, les comptes se branchent par un clic.
- Proposer la suite : le courtier crée ses comptes, on connecte une première carte (la plus simple selon les comptes qu'il a déjà), on vérifie sur ses vraies données.

**La phrase :** « Il ne reste pas de développement à faire pour brancher ses comptes. Ce qui manque, ce sont les comptes du courtier. »

---

## 3. Le message clé pour le manager

1. L'atelier fonctionne aujourd'hui de bout en bout, avec 13 agents, sur un courtier de démonstration réaliste.
2. Les comptes se branchent par un clic : une source tourne déjà en réel, les autres attendent seulement les comptes du courtier.
3. Rien ne sort sans validation humaine : pas de publication, pas d'envoi, pas de dépense.

---

## 4. Questions probables et réponses honnêtes

**Combien ça coûte ?**
Aujourd'hui, l'atelier tourne sur mon abonnement Claude. En production, il tournera avec une clé API au nom du client, donc facturée au client selon son usage. Les plafonds de dépense IA sont réglables par le client. Je n'ai pas encore de chiffre mensuel mesuré sur un vrai usage : je préfère le mesurer sur le premier mois plutôt que d'avancer un montant.

**Et le RGPD ?**
Chaque canal de contact est vérifié avec sa base légale, la liste « Ne m'appelez plus » est prise en compte, les oppositions excluent le prospect. À l'import de la base clients, les données personnelles sont chiffrées et les colonnes sensibles (santé, sinistre, banque) sont refusées. Le cadre juridique final (registre des traitements, contrat de sous-traitance avec le client) reste à valider avec le courtier.

**Qu'est-ce qui est réel et qu'est-ce qui est de la démonstration ?**
Réel : l'application, les agents, les contrôles, les approbations, et la source OpenStreetMap (147 190 établissements). Démonstration : les données des autres connecteurs et les documents du courtier fictif. Chaque donnée de démonstration est marquée comme telle, et l'atelier refuse de l'utiliser dans une campagne réelle.

**Est-ce que c'est sécurisé ?**
Les secrets de connexion sont chiffrés sur le poste. Les agents n'ont pas le droit de publier ni de dépenser : seule une approbation humaine débloque une action. Les données de démonstration sont bloquées en mode réel. Une relecture indépendante du code a été faite et ses corrections sont en cours. Je ne dis pas « zéro faille » : je dis qu'on cherche les failles activement et qu'on les corrige.

**Combien de temps pour passer en réel ?**
Côté atelier, pas de développement : le clic de connexion. Le délai dépend du courtier : créer ses comptes, et pour Google et Meta, passer leurs validations. Ces délais dépendent de ces plateformes, je ne peux pas donner de date ferme. On peut commencer par les registres publics et OpenStreetMap, qui ne demandent rien au courtier.

**Et si l'IA se trompe ?**
C'est prévu. Un livrable passe par trois filets : la relecture par d'autres agents, la porte de contrôle à règles fixes (par exemple, un chiffre sans source est refusé) et l'approbation humaine. L'IA peut se tromper dans un brouillon ; le but est que l'erreur soit arrêtée avant de sortir.

**Est-ce que l'atelier donne des conseils en assurance ?**
Non. Il prépare du marketing. Le conseil reste au courtier et à ses collaborateurs.

---

## 5. Ce qu'il ne faut pas dire ni promettre

- Pas de « taux exact » ni de « probabilité de vente » : le score est une estimation tant que l'historique est insuffisant.
- Pas de garantie de ventes, de prospects signés ou de chiffre d'affaires.
- Pas de « l'atelier conseille les clients en assurance » : il ne fait pas de conseil.
- Pas d'« envoi automatique », de « publication automatique » ni de « dépense automatique ».
- Pas de date ferme pour les validations de Google ou de Meta.
- Pas de coût mensuel chiffré tant qu'il n'a pas été mesuré.
- Pas de « tout est déjà connecté en réel » : une seule source l'est (OpenStreetMap).
- Pas de « aucune faille ».
- Ne jamais citer le nom du client réel.

---

## 6. Plan B si quelque chose plante en direct

**Une page ne charge pas ou une erreur s'affiche.**
Ne pas déboguer devant le manager. Dire : « Je vous montre la même page en capture », et passer aux captures de secours. Reprendre le direct à l'étape suivante.

**L'application ne répond plus du tout.**
Basculer sur les captures. Si le temps le permet, relancer en fin de réunion : `scripts/arreter-instance.sh` puis `scripts/lancer-instance.sh` depuis `~/Projets/atelier-marketing-ia/`. Ne pas lancer la relance pendant la démonstration : le démarrage prend du temps.

**La tâche de la veille n'a pas abouti.**
Montrer ce qu'elle a produit jusque-là et expliquer à quelle étape elle s'est arrêtée. Ne pas en lancer une nouvelle en direct si le quota est bas.

**Le quota Claude est épuisé.**
Tout ce qui est déjà produit reste consultable : dossiers, approbations, prospects, connaissances, connecteurs. Seules les nouvelles tâches attendent. Le dire simplement.

**La recherche dans Connaissances ne renvoie pas l'article 12.**
Montrer la capture de la recherche faite la veille.

**Captures déjà disponibles** dans `~/Projets/atelier-marketing-ia/docs/captures/` : équipe, campagnes, contenus, calendrier, dossiers (prêt, approuvé, relance, reprise, preuve émise et révoquée), marque, paramètres, paramètres des connecteurs, galerie des cartes, résultats. À compléter la veille par Prospects et Connaissances.
