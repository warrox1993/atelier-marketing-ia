# Piloter l'atelier par WhatsApp

Service séparé `whatsapp/` (TypeScript, aucune dépendance d'exécution). Il reçoit vos messages WhatsApp par l'API
officielle de Meta (WhatsApp Cloud API), les relaie au coordinateur général, vous renvoie ses réponses et vous
prévient de ce qui attend une décision. C'est le SEUL service publié sur Internet, par Tailscale Funnel ; l'instance
Paperclip (3100) et la passerelle marketing (3190) restent sur la boucle locale.

## Architecture

```
WhatsApp (votre téléphone)
   │  HTTPS
Meta (Cloud API) ── webhook signé (X-Hub-Signature-256) ──► Tailscale Funnel (https://<machine>.<tailnet>.ts.net)
                                                              │
                                                              ▼
                                         passerelle WhatsApp 127.0.0.1:3195 (whatsapp/)
                                           │ 1. corps 256 Kio au plus (413 et connexion fermée au-delà), puis signature
                                           │    HMAC-SHA256 (secret de l'application), sinon 401 ; plafond global compté
                                           │    sur les seules requêtes signées
                                           │ 2. numéro WhatsApp Business attendu, expéditeur sur la liste blanche
                                           │ 3. message ni plus vieux que 48 h ni daté du futur (5 min), identifiant jamais
                                           │    vu (rejeu ignoré), débit borné par expéditeur
                                           ▼
                         Paperclip 127.0.0.1:3100 (jamais publié) : routes déjà utilisées par l'interface
                           discussion.envoyer / discussion.messages  (onglet Discussion, entreprise Direction)
                           accueil.lister, departements.lister, journal.lire  (« À faire », alertes)
                           tache.dossier, tache.decision  (garde `decider` : humain seulement)
                           /approvals/:id/approve|reject, /issues/:id/interactions/:id/accept|reject,
                           liaison.decider, /agents/:id/pause|resume, PATCH /companies/:id {status}
```

- Identité : l'instance est en mode `local_trusted` ; une requête locale sans jeton est attribuée par Paperclip au
  board humain « local-board » (`paperclip/server/src/middleware/auth.ts`, `actorMiddleware`), que le plugin traduit
  en acteur humain (`plugin-atelier/src/serveur/atelier.ts`, `acteurDepuisRequete`). Vos décisions WhatsApp sont donc
  des décisions humaines, enregistrées par la même route que l'écran et soumises aux mêmes gardes (`decider` refuse
  tout acteur non humain, exige la révision courante et le contrôle automatique réussi). Aucune capacité n'a été
  ajoutée au plugin.
- Origine « whatsapp » : le commentaire de chaque décision commence par « Décision prise par WhatsApp (origine :
  whatsapp, code de confirmation vérifié) » ; la passerelle tient en plus son registre
  `~/.local/state/atelier/whatsapp/decisions.jsonl` (0600 : demande, confirmation, exécution ou échec, clé de l'objet,
  version ; jamais de texte ni de motif). Le journal du plugin (`decision.approuver`…) ne porte pas de champ
  d'origine : l'ajouter demanderait de modifier le contrat du plugin.
- Journaux techniques (journald, `journalctl --user -u atelier-whatsapp`) : événements et compteurs seulement, aucun
  contenu de message ; un expéditeur inconnu n'apparaît que sous une empreinte courte.

## Ce que vous pouvez faire

| Message | Effet | Code ? |
| --- | --- | --- |
| texte libre | transmis au coordinateur général (comme l'onglet Discussion) ; ses réponses vous reviennent | non |
| `aide` | liste des commandes | non |
| `attente` (ou `à faire`, `liste`) | ce qui attend une décision, tous services, numéroté | non |
| `voir N` | détail : extrait du livrable, révision, appels proposés ; approbation ; question ; liaison | non |
| `approuver N [motif]` | approuve, sans aucune action externe | **oui** |
| `approuver N appel K [motif]` | approuve ET autorise l'appel K proposé (publication, envoi, modification du CRM) | **oui** |
| `refuser N motif` | rejette (un contenu rejeté annule la tâche) ; motif obligatoire | **oui** |
| `corriger N motif` | demande une correction d'un contenu | **oui** |
| `agents`, `services` | état des agents et des services | non |
| `pause agent N`, `pause service N` | frein d'urgence immédiat | non |
| `reprendre agent N`, `reprendre service N` | relance (qui recommence à consommer) | **oui** |
| `annuler` | abandonne la décision qui attend son code | non |
| `123456` (6 chiffres) | confirme la décision en attente | — |

Code de confirmation : 6 chiffres tirés au hasard, valable 5 minutes, une seule fois, lié à LA décision demandée et à
sa version (révision du livrable, état de la porte, empreinte de l'appel, contenu de l'approbation…). Juste avant
d'exécuter, la passerelle relit l'objet : s'il a changé, rien n'est fait. Demander une autre décision annule le code
précédent ; trois codes faux annulent la décision.

Se traitent dans l'atelier (lien donné) : questions à choix (`ask_user_questions`), cartes qui exécutent un outil ou
proposent un secret, demandes d'accès et approbations natives non décidables sur place, tâches bloquées, documents à
revoir, informations manquantes, et toute **dépense publicitaire** (une campagne payante exige montant, canal et durée
précis : volontairement pas par WhatsApp).

Services couverts : ceux que `departements.lister` rend pour l'entreprise Direction. Si cette route manque ou échoue
(constaté le 17/10/2026 en lecture seule sur l'instance 3100 : plugin déployé antérieur à la route, réponse 404), seule
l'entreprise Direction est lue ; redéployer le plugin étend « attente », les alertes et `agents` à tous les services.

Alertes envoyées : nouveaux éléments « À faire » (validations, approbations, blocages, questions) et événements du
journal `cycles.epuises`, `cycles.remise_humaine`, `veilleur.abandon`. Le premier passage après démarrage ne fait
qu'inventorier (pas d'avalanche).

## Coût : ce qui est gratuit, ce qui ne l'est pas

Tarification de Meta par message depuis le 1er juillet 2025
(https://developers.facebook.com/docs/whatsapp/pricing, consultée le 17/10/2026) :

- « All non-template messages are free within an open customer service window » : nos réponses et alertes envoyées
  dans les 24 h qui suivent VOTRE dernier message sont gratuites.
- « Utility template messages sent outside of a CSW are charged » : un modèle utilitaire hors fenêtre est FACTURÉ.

Réglage par défaut, `WHATSAPP_MODELE_HORS_FENETRE=non` : rien de payant ne part. Hors fenêtre, les alertes sont mises
en attente et vous sont remises dès votre prochain message (« Pendant votre absence : … »). Cette file n'existe
qu'EN MÉMOIRE : jamais écrite dans `etat.json` (aucun contenu sur le disque), elle est perdue si la passerelle
redémarre ; l'atelier reste la source (`attente` liste tout ce qui attend, la discussion se relit dans l'écran). Écrire `aide` chaque
matin rouvre la fenêtre. Mettre `oui` n'est à faire qu'en acceptant ce coût : un modèle annonce alors le NOMBRE
d'alertes (jamais leur contenu), au plus une fois toutes les 4 heures. Jamais de modèle marketing.

## Pas à pas (à faire par vous ; Claude ne crée aucun compte et n'entre aucun identifiant)

### 1. Compte Meta Business et application

1. Avec votre compte Facebook, ouvrez https://developers.facebook.com/apps et cliquez sur **Créer une app**.
2. Nom (ex. « Atelier JB »), adresse e-mail, cas d'usage **« Connect with customers through WhatsApp »**.
3. Choisissez votre portfolio commercial (Meta Business) ou créez-en un, puis **Créer l'app**.
4. Dans **WhatsApp > API Setup**, laissez Meta créer le compte WhatsApp Business de test.

### 2. Numéro de test gratuit (pour essayer)

1. Toujours dans **API Setup** : le numéro « From » de test est fourni par Meta.
2. Dans « To », ajoutez VOTRE numéro personnel et validez le code reçu par WhatsApp (Meta limite le nombre de
   destinataires d'un numéro de test : vérifiez la limite affichée à l'écran).
3. Notez le **Phone number ID** (chiffres) : c'est `WHATSAPP_ID_NUMERO`.

### 3. Jeton permanent

Le jeton « temporaire » de la page API Setup expire vite : ne l'utilisez que pour un essai.

1. https://business.facebook.com > Paramètres > **Utilisateurs système** > Ajouter (rôle Admin), nom « atelier ».
2. **Ajouter des ressources** : votre app (contrôle total) et le compte WhatsApp Business.
3. **Générer un jeton** pour l'app, expiration **Jamais**, avec la SEULE autorisation `whatsapp_business_messaging`
   (envoi et réception). Ne cochez PAS `whatsapp_business_management` : la passerelle n'en a pas besoin, et un jeton
   volé pourrait sinon modifier le compte et les modèles. La gestion des modèles de message (étape 6) se fait à la
   main dans le gestionnaire WhatsApp de Meta, avec votre propre session. Copiez le jeton : `WHATSAPP_JETON_ACCES`.

### 4. Secret de l'application et jeton de vérification

1. Tableau de bord de l'app > **Paramètres de l'app > Général** > Clé secrète > Afficher : `WHATSAPP_SECRET_APPLICATION`.
2. Inventez le jeton de vérification : `openssl rand -hex 32` → `WHATSAPP_JETON_VERIFICATION`.

### 5. Fichier de configuration

```
mkdir -p ~/.config/atelier ~/.local/state/atelier
cp ~/Projets/atelier-marketing-ia/config/whatsapp.env.exemple ~/.config/atelier/whatsapp.env
chmod 600 ~/.config/atelier/whatsapp.env
nano ~/.config/atelier/whatsapp.env
```

Remplissez les quatre valeurs Meta, votre numéro dans `WHATSAPP_NUMEROS_AUTORISES` (ex. `32470123456`) et
`ATELIER_ENTREPRISE` (UUID de l'entreprise Direction). Le service refuse de démarrer si le fichier est lisible par
un autre compte ou si une valeur est douteuse.

### 6. Modèle utilitaire (seulement si vous voulez les alertes payantes hors fenêtre)

WhatsApp Manager (https://business.facebook.com/wa/manage/message-templates) > **Créer un modèle** :

- Catégorie : **Utilitaire** (Utility) ; nom : `alerte_atelier` ; langue : **Français** (`fr`).
- Corps (une seule variable) :

  > Atelier : {{1}} nouvelle(s) alerte(s) liée(s) à votre compte attendent votre décision. Répondez à ce message
  > pour les recevoir.

- Exemple pour {{1}} : `3`. Aucun en-tête, aucun bouton, aucun lien.

Si Meta reclasse le modèle en **Marketing**, ne l'utilisez pas (laissez `WHATSAPP_MODELE_HORS_FENETRE=non`).

### 7. Construire et lancer le service

```
cd ~/Projets/atelier-marketing-ia/whatsapp && npm ci && npm run build && npm test
cp ~/Projets/atelier-marketing-ia/scripts/systemd/atelier-whatsapp.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now atelier-whatsapp
journalctl --user -u atelier-whatsapp -n 20 --no-pager     # attendu : "evenement":"demarrage"
```

### 8. Tailscale Funnel (publie le port 3195, et lui seul)

Le 17/10/2026, `tailscaled` était arrêté et désactivé sur le poste de développement : `tailscale funnel status` n'a donc pas pu être lu.

```
sudo systemctl enable --now tailscaled
tailscale status                  # connecté à votre tailnet ?
tailscale funnel status           # DOIT être vide (sinon, ne rien écraser : voir ci-dessous)
tailscale serve status            # idem
```

Prérequis du tailnet (console https://login.tailscale.com/admin) : HTTPS activé (DNS > HTTPS Certificates) et
attribut `funnel` autorisé pour cette machine dans la politique d'accès (la commande le propose sinon).

Puis :

```
tailscale funnel --bg 3195
tailscale funnel status           # attendu : https://<machine>.<tailnet>.ts.net (Funnel on) → http://127.0.0.1:3195
```

Seul le chemin `/webhook` répond (tout le reste : 404). Pour retirer la publication : `tailscale funnel --bg 3195 off`
(ou `tailscale funnel reset`, qui retire TOUTE la configuration Funnel de la machine). Si `funnel status` montrait déjà
une configuration, ne lancez pas `reset` : dites-le et on choisira un autre port HTTPS (443, 8443 ou 10000).

### 9. Webhook chez Meta

1. App > **WhatsApp > Configuration** > Webhook > **Modifier**.
2. URL de rappel : `https://<machine>.<tailnet>.ts.net/webhook` ; jeton de vérification : la valeur de
   `WHATSAPP_JETON_VERIFICATION`. **Vérifier et enregistrer** (le journal montre `poignee_de_main` `acceptee`).
3. Champs du webhook : **S'abonner** à `messages` (et rien d'autre).
4. Depuis votre téléphone, écrivez `aide` au numéro de test : la liste des commandes revient.

### 10. Numéro définitif

Quand l'essai est concluant : WhatsApp Manager > Numéros de téléphone > **Ajouter un numéro** (un numéro qui n'est
pas déjà un compte WhatsApp, vérifié par SMS ou appel), nom affiché validé par Meta. Remplacez `WHATSAPP_ID_NUMERO`
dans `~/.config/atelier/whatsapp.env`, puis `systemctl --user restart atelier-whatsapp`.

## Confidentialité : l'API Cloud est hébergée par Meta

Tout message envoyé par la passerelle transite par les serveurs de Meta, qui devient sous-traitant des données qui
y figurent (RGPD). Par défaut, `WHATSAPP_CONTENU_SENSIBLE=non` : pour un service sensible (`juridique`,
`ressources-humaines`, `juridique-social`, `fiscalite`, `hse`, `conformite`, `sav-sinistres`), `voir N` n'envoie PAS
le contenu des livrables (titre de révision et extrait), des appels proposés (aperçu), des approbations, questions et
liaisons dont l'un des deux services est sensible : il répond « contenu sensible : à lire dans l'atelier » (la
décision reste possible par code). Les titres et raisons de la liste `attente` et des alertes, eux, partent
toujours : ils ne doivent pas contenir de données personnelles ou de secret.

Mettre `oui` envoie ce contenu aussi : c'est une DÉCISION DU CLIENT (analyse d'impact, contrat de sous-traitance avec
Meta, information des personnes concernées, transferts hors EEE), à consigner dans son registre des traitements
avant de changer la valeur.

## Texte écrit par un agent

Titres et raisons qui viennent d'un agent sont nettoyés avant d'entrer dans un message : caractères de contrôle,
sauts de ligne et caractères invisibles retirés, guillemets neutralisés, 120 caractères au plus (200 pour une
raison). Une demande de code commence toujours par une première ligne fixe qui dit l'action exacte (`APPROUVER`,
`REFUSER ET REJETER`, `APPROUVER ET AUTORISER : … (appel K)` avec canal et compte, `RELANCER …`), suivie de la ligne
« Objet : … » : le texte d'un agent ne peut ni s'y substituer ni la prolonger.

## Tests

`cd whatsapp && npm test` : faux Meta et faux atelier sur la boucle locale (`tests/faux.ts`), qui reproduisent les
règles d'identité de Paperclip et la garde `decider` du plugin. Couverts : poignée de main, signature
(valide, invalide, absente, autre secret, autre corps, corps re-sérialisé), corps trop grand (413 et connexion
fermée sans lire la suite), inondation de requêtes non signées sans effet sur les signées, messages trop anciens ou
datés du futur, file hors fenêtre absente du disque, avertissement de débit, texte d'agent piégé, services sensibles
masqués, numéro inconnu, autre
numéro Business, rejeu (y compris après redémarrage), débit, message non texte, absence de contenu dans les journaux,
codes (juste, faux, expiré, réutilisé, d'une autre décision, trois essais, annulation), décision enregistrée comme
humaine par la route `tache.decision`, nouvelle révision entre code et confirmation, appel exact approuvé, pause et
reprise, alertes (premier passage silencieux, nouveautés, cycles épuisés), file hors fenêtre, modèle utilitaire hors
fenêtre et son espacement, configuration refusée (écoute publique, instance distante, Graph non chiffré).
