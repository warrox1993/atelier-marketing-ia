#!/usr/bin/env bash
# APP-2 : la requête des indicateurs de la porte (scripts/observatoire/photo_obs.py, indicateurs_porte_sql) jouée sur un
# PostgreSQL jetable : taux de PASS au premier passage par auteur de la révision évaluée et par semaine.
# Aucune instance, aucun réseau (socket local seulement). À lancer : bash scripts/tests/tester-indicateurs-observatoire.sh
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
BIN_PG=""
for c in "${RACINE}"/paperclip/node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64/native/bin /usr/lib/postgresql/*/bin; do
  if [[ -x "${c}/initdb" && -x "${c}/pg_ctl" ]]; then BIN_PG="${c}"; break; fi
done
[[ -n "${BIN_PG}" ]] || { echo "ERREUR : initdb introuvable (lancer scripts/preparer-socle.sh)"; exit 1; }
nettoyer() { "${BIN_PG}/pg_ctl" -D "${TMP}/pgd" -m immediate -w stop >/dev/null 2>&1 || true; rm -rf "${TMP}"; }
trap nettoyer EXIT
"${BIN_PG}/initdb" -D "${TMP}/pgd" -U essai --auth=trust >/dev/null
"${BIN_PG}/pg_ctl" -D "${TMP}/pgd" -w -l "${TMP}/pg.log" -o "-p 5498 -c listen_addresses='' -k ${TMP}" start >/dev/null
p() { psql -h "${TMP}" -p 5498 -U essai -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

OBS=11111111-1111-4111-8111-111111111111
p <<SQL
create table agents (id uuid primary key, name text);
create table document_revisions (id uuid primary key, created_by_agent_id uuid);
create schema plugin_atelier_f0322cc62c;
create table plugin_atelier_f0322cc62c.evaluations_porte (id uuid primary key, company_id uuid, issue_id uuid, revision_id uuid, decision text, cree_le timestamptz);
insert into agents values ('a0000000-0000-4000-8000-000000000001', 'Analyste'), ('a0000000-0000-4000-8000-000000000002', 'Rédacteur');
insert into document_revisions values ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'), ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002');
-- Analyste : livrable 1 refusé puis passé (2 évaluations), livrable 2 passé du premier coup ; Rédacteur : livrable 3 refusé.
-- Une évaluation d'une autre entreprise ne compte pas.
insert into plugin_atelier_f0322cc62c.evaluations_porte values
  ('e0000000-0000-4000-8000-000000000001', '${OBS}', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'REFUS', '2026-10-27 10:00+00'),
  ('e0000000-0000-4000-8000-000000000002', '${OBS}', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'PASS', '2026-10-27 12:00+00'),
  ('e0000000-0000-4000-8000-000000000003', '${OBS}', 'c0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'PASS', '2026-10-28 10:00+00'),
  ('e0000000-0000-4000-8000-000000000004', '${OBS}', 'c0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004', 'REFUS', '2026-10-28 11:00+00'),
  ('e0000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000004', 'PASS', '2026-10-28 11:00+00');
SQL
REQ="$(cd "${RACINE}/scripts/observatoire" && python3 -I -c "import sys; sys.path.insert(0, '.'); import photo_obs; print(photo_obs.indicateurs_porte_sql('${OBS}'))")"
OBTENU="$(p -F '|' -c "${REQ}")"
ATTENDU="Analyste|2026-10-26|2|1|50|1.5
Rédacteur|2026-10-26|1|0|0|1.0"
if [[ "${OBTENU}" == "${ATTENDU}" ]]; then
  echo "OK indicateurs de la porte : ${OBTENU//$'\n'/ ; }"
else
  printf 'ÉCHEC indicateurs de la porte\nattendu :\n%s\nobtenu :\n%s\n' "${ATTENDU}" "${OBTENU}"
  exit 1
fi
