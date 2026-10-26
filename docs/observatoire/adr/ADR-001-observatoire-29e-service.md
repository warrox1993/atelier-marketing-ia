# ADR-001 : l'Observatoire, 29e service de l'organisation actuelle de l'usine

- **Statut** : Accepté (JB, 26/10/2026, soir). Remplace la décision du même jour qui prévoyait une organisation
  générique et une « phase 1 bis », désormais annulée.
- **Décision de référence** : O2 du plan, révisée

## Contexte

L'instance Paperclip 3100 porte une organisation qui sert le client courtier et compte 28 services. L'Observatoire a
plusieurs buts, dans cet ordre (JB, 26/10/2026) : permettre à l'opérateur lui-même de progresser par une veille technique
fiable ; produire le site « L'Avenue de l'Observatoire », réalisé par Smidjan ; et, en plus, nourrir et améliorer
les agents de l'usine au quotidien. Ce dernier but impose que l'Observatoire vive dans cette organisation, pas à côté. La version précédente de la décision voulait généraliser l'usine (nom neutre,
client courtier sorti vers un client distinct). Des constats techniques l'ont rendue irréaliste :

- les préfixes de tâches ne sont pas modifiables par l'API ;
- les entreprises sont définitivement attachées à leur client dans le plugin (`plugin-atelier/src/serveur/liaisons/declarer.ts:58`) ;
- l'historique existant ne peut pas être déplacé d'un client à l'autre.

## Décision

1. L'Observatoire devient le **29e service de l'organisation actuelle de l'usine**, sur l'instance 3100, sous la
   forme d'une entreprise distincte de celles des autres services. Le cloisonnement natif de Paperclip (tâches,
   connaissances, secrets par entreprise) sépare ses données de celles du client courtier.
2. **Aucune généralisation de l'usine** : pas de renommage de l'organisation, pas de sortie du client courtier. La
   « phase 1 bis » est **annulée** (26/10/2026).
3. Le site public s'appelle **« L'Avenue de l'Observatoire »**, réalisé par **Smidjan**, la marque de l'opérateur.
4. Garde technique : les routes `obs.*` sont refusées hors d'une entreprise déclarée « observatoire », et les
   migrations `023_obs_*` restent inactives tant que le module est désactivé par configuration.

## Options écartées et pourquoi

- **Organisation générique et usine généraliste (phase 1 bis)** : écartée et annulée, pour les trois motifs
  techniques du contexte. Le chantier de migration aurait en outre risqué l'existant sans bénéfice pour l'opérateur.
- **Usine neuve et séparée, ou instance Paperclip séparée** : écartée, elle couperait la veille des agents existants,
  et deux instances doublent l'exploitation (ports, sauvegardes, mises à jour du socle).
- **Une organisation par service** : écartée, elle casse les budgets et le tableau de bord communs.

## Conséquences

- Positives : une seule instance à exploiter ; aucune migration de l'existant ; la veille nourrit directement les
  agents de l'usine ; isolement natif par entreprise.
- Négatives : les données de l'Observatoire résident dans l'organisation du client courtier. Le mélange accidentel
  des deux jeux de données devient un risque à surveiller (voir R37 de `../risques.md`).
- **Point de vigilance sur la propriété (O7), non tranché** : le projet reste la propriété de l'opérateur, alors que ses
  données vivront dans l'organisation du client courtier. Une séparation sera à prévoir avant l'ouverture
  publique : export du contenu et dépôt de contenu à son nom.
- Le nom du client courtier ne doit figurer dans aucun fichier du dépôt (le script de publication le refuse).

## Références

- Plan : Livrable A (D3), Livrable O (O2, O7), J.2 (séparation de propriété).
- Dépôt : `plugin-atelier/src/serveur/liaisons/declarer.ts` (ligne 58), `scripts/bootstrap-organisation.py`,
  `scripts/atelier_services.py`, `scripts/instance-essai.sh`.
