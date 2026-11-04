# Observatoire : droits et politique de collecte

Statut : phase 1, politique proposée. Source : J.1, J.2 et Livrable K du plan. Ce document n'est pas un avis juridique : la dernière section liste ce qu'un juriste doit relire avant toute ouverture publique.

## 1. Principes de collecte

1. **API officielles d'abord.** Une page n'est lue que si aucune API, aucun flux Atom ou RSS ni aucun fichier officiel n'existe.
2. **`robots.txt` respecté** pour toute page ; une interdiction vaut renoncement à la source.
3. **Cadence bornée** par source, avec requêtes conditionnelles (ETag, `If-Modified-Since`) et empreinte du contenu pour ne rien retélécharger inutilement.
4. **Identification honnête** : agent utilisateur explicite avec une adresse de contact.
5. **Collecteurs sans LLM** : la collecte ne passe jamais par un modèle ; le contenu collecté est une donnée, jamais une consigne.
6. **Pas de copie intégrale publiée.** Les instantanés internes servent de preuve et restent privés.
7. **Aucune authentification contournée, aucun contenu derrière connexion ou paiement.**
8. Toute source retirée à la demande de son titulaire est retirée du registre, avec une entrée de journal.

## 2. Politique par type de source

| Source | Méthode | Limites et conditions | Notes |
| --- | --- | --- | --- |
| GitHub | API REST authentifiée, flux `releases.atom` | REST 5 000 requêtes/heure ; recherche 30 requêtes/minute (code : 10/minute) ; GraphQL 5 000 points/heure | respecter les en-têtes de limite ; licence du dépôt lue avant toute citation |
| arXiv | API officielle | 1 requête toutes les 3 secondes, une seule connexion ; métadonnées sous CC0 1.0 | les textes des articles gardent leur licence propre : liens et courtes citations seulement |
| YouTube | API Data v3 pour les métadonnées ; transcription : aucune, collecte audio interdite avant l'avis du juriste (fin de cette section, DROIT-5.3) ; aucun collecteur YouTube en code (`collecte.ts`) | 10 000 unités/jour pour l'API ; transcription pour l'étude interne seulement | décision de l'opérateur du 26/10/2026 : le texte de la transcription n'est jamais publié ; le site publie une synthèse originale, le lien vers la vidéo et des extraits courts cités ; `captions.download` reste inutilisable (il exige le droit de modifier la vidéo, d'où la transcription locale) ; `search.list` coûte 100 unités selon la doc habituelle (à relire) |
| npm, PyPI | API et flux de leurs registres | cadence faible, conditions des registres à relire par le collecteur | métadonnées et notes de version |
| Blogs et notes de version des éditeurs | flux Atom/RSS en priorité, sinon page | `robots.txt`, une page à la fois, cadence lente | conditions d'utilisation lues par source |
| Textes officiels de l'UE | sites officiels | réutilisation selon les règles de l'institution (à vérifier par le collecteur) | texte juridique cité avec référence exacte |
| Listes « awesome » | simples annuaires | chaque entrée est revérifiée à la source primaire | jamais une preuve par elle-même |

**Point à vérifier avant toute collecte vidéo (K4, phase 3).**

- Conditions d'utilisation de YouTube, lues à la source le 26/10/2026 (https://www.youtube.com/t/terms?hl=en), section « Permissions and Restrictions », point 1. Extrait mot pour mot, le reste de la phrase n'ayant pas pu être relevé intégralement : « access, reproduce, download, distribute, transmit, broadcast, display, sell, license, alter, modify ». La phrase interdit ces actes sur tout ou partie du service ou des contenus, sauf si le service les permet expressément, avec l'accord écrit préalable de YouTube et des titulaires de droits, ou si la loi applicable les autorise (reformulation, texte complet non cité : citation intégrale à relever avant la collecte). Reste à trancher si le téléchargement de l'audio pour transcription locale entre dans cette interdiction.
- Droit d'auteur : usage interne de la transcription, citation courte seulement dans les publications.
- Si la vérification conclut à un risque, JB décide avant toute collecte.
- **Décision du 30/10/2026 (DROIT-5.3, option recommandée) : aucune collecte audio YouTube (téléchargement ni
  transcription) avant l'avis écrit d'un juriste sur l'art. XI.190, 20° du Code de droit économique (fouille de textes :
  œuvre accessible de manière licite, absence de réserve du titulaire) et sur les conditions de YouTube.** La phase K4
  vidéo reste bloquée jusque-là ; la consigne de l'explorateur de sources l'interdit. Aucun collecteur audio n'existe
  dans le dépôt au 30/10/2026 : celui qui sera écrit refuse de télécharger tant que l'avis n'est pas enregistré (son
  premier test). Métadonnées par l'API officielle et page publique de la vidéo restent permises.

## 3. Droit d'auteur et licences

- Synthèses originales rédigées par le département ; aucune republication intégrale.
- Extraits courts, entre guillemets, avec attribution et lien vers la source.
- Liens plutôt que copies ; attribution systématique (auteur, source, date de consultation). Le droit de citation exige
  la mention de la source et du nom de l'auteur (Code de droit économique, art. XI.189) : la porte refuse une preuve dont
  la source n'a pas d'auteur enregistré (OBS-15, `politique_collecte.auteur`, voir `regles-porte.md`).
- Logos et images : seulement selon la licence indiquée par le titulaire ; à défaut, aucun logo.
- Licence du projet décrit : relevée et affichée sur la fiche ; un projet sans licence connue est décrit sans reproduction de son contenu.
- Code collecté : analysé en cage, jamais republié.
- Une demande de retrait d'un titulaire est traitée en priorité, par dépublication puis examen.
- **Réponse et retrait (DROIT-5.4).** Une entreprise ou une personne nommée dans une conclusion sensible (toute
  affirmation négative sur elle : définition dans `politique-versions.md`, section 1) peut demander une réponse, une
  correction ou le retrait, par l'adresse de contact de la page « Mentions » du site. La demande va sur une carte à l'opérateur,
  en priorité ; une erreur reconnue se corrige par la section `## Corrections` de l'article (révision suivante, même
  chaîne) ; une réponse acceptée y est citée avec sa date. Le Code de droit économique (art. VI.104) s'applique en plus
  si l'éditeur du site est concurrent de l'entreprise visée.

## 4. RGPD et données personnelles

Le corpus contient peu de données personnelles (noms d'auteurs publics). Les comptes du site, les questions posées et les journaux en contiennent.

- **Minimisation** : ne collecter que les noms d'auteurs publics utiles à l'attribution ; aucune donnée de profil superflue.
- **Conservation proposée** : questions et journaux associés conservés 90 jours, puis supprimés ou anonymisés (durée à confirmer).
- **Export et suppression** : un utilisateur peut obtenir l'export de ses données et leur suppression ; procédure à définir avant l'ouverture.
- **Droit d'opposition des auteurs cités (DROIT-5.5, décision du 30/10/2026)** : simple et documenté. Base légale :
  intérêt légitime (informer sur des outils publics, citer leurs auteurs comme le droit de citation l'exige). Information :
  la page « Mentions » du site dit quelles données sont traitées (nom public et rôle dans le projet, source citée), pourquoi,
  combien de temps (tant que l'article est en ligne) et comment s'y opposer. Procédure : demande par l'adresse de contact
  de cette page ; carte à l'opérateur ; réponse dans le mois (RGPD, art. 12.3) ; à l'acceptation, le nom est retiré de la révision
  suivante (avec la citation qu'il attribuait, le droit de citation exigeant le nom) et la demande est notée au registre
  des traitements (compétence `registre-traitements-rgpd`), sans autre donnée que la date et l'article.
- **Registre des traitements** : à tenir avec la compétence `registre-traitements-rgpd`.
- **Sous-traitant** : Anthropic est à déclarer comme sous-traitant si l'API sert des tiers (V1 : JB seul, sans tiers).
- **Séparation de propriété** : produit personnel de l'opérateur ; instance, dépôts de contenu, domaine, clés d'API et facturation à son nom et séparés de tout ce qui concerne un client professionnel ; aucune donnée ni aucun secret réutilisé. Les contrats éventuels de l'opérateur ne sont pas connus : à confirmer par lui.
- Aucune donnée personnelle dans un dépôt public.

## 5. Mise en oeuvre dans le registre

Chaque source du registre (voir `sources-initiales.md`) porte : méthode, cadence, licence ou conditions connues, date de dernière vérification des conditions, et un indicateur « conditions relues » mis à jour par le collecteur. Une source sans conditions relues n'est collectée qu'en métadonnées.

## 6. À faire relire par un juriste avant l'ouverture publique

1. Conditions d'utilisation de chaque source collectée par page (et non par API).
2. Limites du droit de citation et de la synthèse pour des contenus d'éditeurs, selon le droit belge et européen.
3. Usage des logos et marques des projets présentés.
4. Politique de conservation (90 jours) et procédures d'export et de suppression.
5. Rôle d'Anthropic comme sous-traitant, clauses et transferts hors UE si l'API sert des tiers.
6. Conditions d'utilisation de l'abonnement et de l'API pour un service qui répond à des tiers.
7. Mentions légales, pages légales et cookies ou analytics du site public.
8. Statut de l'éditeur du site et partage de propriété avec tout employeur ou client professionnel de l'opérateur.
