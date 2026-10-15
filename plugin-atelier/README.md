# Plugin de l'Atelier Marketing IA

Plugin Paperclip officiel (`atelier.marketing-ia`) : exigences REQ-xxx, couverture et
preuves, revues structurées, porte déterministe, messages typés, sources protégées,
imports contrôlés, dossier humain et interface marketing en français.

- Contrats et décisions : `../docs/contrats.md`.
- Préparation reproductible : `../scripts/preparer-plugin.sh` (empaquette le SDK du socle
  épinglé dans `.paperclip-sdk/`, installation figée, typecheck, tests, build).
- Installation dans l'instance lancée :
  `cd ../paperclip && pnpm paperclipai plugin install --local "$PWD/../plugin-atelier"`.
- Une installation locale exécute du code local de confiance (documentation amont).

Arborescence : `src/contrats/` (schémas Zod gelés), `src/serveur/` (logique du worker),
`src/ui/` (interface, lot C), `migrations/` (schéma `plugin_atelier_f0322cc62c`),
`demo/` (agents de démonstration déterministes), `tests/`.
