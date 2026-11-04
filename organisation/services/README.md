# Services de l'entreprise : consignes des agents

Chaque service a un coordinateur et ses spécialistes. Les consignes sont dans
`organisation/services/<service>/agents/<agent>/AGENTS.md`, dans le même format que les consignes du
marketing (`organisation/agents/`), **sans** le marqueur des consignes communes : le générateur l'ajoutera, avec
en tête de la section « Outils » les outils réellement ouverts et fermés à la session de l'agent (tirés du registre).

Règles communes à tous les agents : jamais inventer (sans source, l'information manque), l'humain
approuve tout acte qui engage, aucun dossier complet d'un autre service, toute référence légale incertaine
est marquée « à vérifier ». Un coordinateur ne délègue jamais hors de son service ; pour une information
d'un autre service, il passe par le bureau de liaison (route `liaison.demander`) : demande au service X avec objet, question et seuls les extraits nécessaires.

La liste des services (slug, préfixe, coordinateur, agents, décisions réservées à un humain, services sensibles) a une
seule source : `organisation/registre/services.json`. Sa vue lisible, générée et testée, est la table de
`docs/usine-services.md` ; elle n'est pas recopiée ici.

## Choix à signaler

- Le coordinateur n'a pas de `reportsTo` (il rend compte à l'humain responsable) ; les spécialistes
  rendent compte à leur coordinateur de service. À la Direction, c'est le coordinateur général (champ
  `coordinateurGeneral` du registre) qui ne rapporte à personne : seul interlocuteur de l'humain, il reçoit le compte
  rendu du coordinateur de la Direction.
- Le slug du service du commerce extérieur est `commerce-exterieur`, celui de son coordinateur
  `coordinateur-export` (comme demandé).

## À faire valider par un juriste

Toutes les références marquées « à vérifier » dans les fichiers, en particulier : articles exacts du
livre XIX CDE et de la loi du 20/12/2002 ; taux et indemnités de la loi du 2/08/2002 ; transposition belge de
l'IDD (loi du 4/04/2014) et AssurMiFID ; articles de la loi du 18/09/2017 ; RGPD art. 28, 33, 34 ;
CCT nº 38 et 39 ; loi du 10/05/2007 ; NIS2 (loi du 26/04/2024) ; règlement (UE) nº 952/2013 et double usage ;
règles linguistiques des offres d'emploi ; art. XII.13 CDE (prospection électronique) ; délais de
conservation comptable.
