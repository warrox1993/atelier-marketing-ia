#!/usr/bin/env bash
# Tests de scripts/repeter-montee-socle.sh (#81) sur des dépôts git SYNTHÉTIQUES fabriqués dans un dossier temporaire :
# ni le vrai socle (paperclip/), ni socle/patches/, ni le réseau, ni un vrai pnpm ne sont utilisés.
# Usage : scripts/tests/tester-repeter-montee-socle.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${RACINE}/scripts/repeter-montee-socle.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/repeter-montee-socle-test-XXXXXX")" || exit 1
ECHECS=0; TOTAL=0
nettoyer() { case "${TMP}" in "${TMPDIR:-/tmp}"/repeter-montee-socle-test-*) rm -rf -- "${TMP}" ;; esac; }
trap nettoyer EXIT

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0
export GIT_AUTHOR_NAME=Essai GIT_AUTHOR_EMAIL=essai@localhost GIT_COMMITTER_NAME=Essai GIT_COMMITTER_EMAIL=essai@localhost

# Résultat d'un cas : ok <nom> / ko <nom> <détail>
ok() { TOTAL=$((TOTAL + 1)); echo "OK     $1"; }
ko() { TOTAL=$((TOTAL + 1)); ECHECS=$((ECHECS + 1)); echo "ECHEC  $1 : $2"; [[ -n "${SORTIE:-}" ]] && echo "${SORTIE}" | tail -n 15 | sed 's/^/         /'; }

# lancer <arguments du script…> : sortie dans ${SORTIE}, code dans ${CODE}
lancer() { SORTIE="$("${SCRIPT}" "$@" 2>&1)"; CODE=$?; }

# --- Fixture : amont nu, trois correctifs, dépôt de référence, faux socle/VERSION ---
G() { git -C "$1" -c commit.gpgsign=false "${@:2}"; }
SRC="${TMP}/src"; AMONT="${TMP}/amont.git"; REF="${TMP}/reference"; PATCHES="${TMP}/patches"
git init -q -b main "${SRC}"
printf 'ligne 1\nligne 2\nligne 3\n' > "${SRC}/f1.txt"
printf 'a\nb\nc\n' > "${SRC}/f3.txt"
G "${SRC}" add -A && G "${SRC}" commit -q -m base && G "${SRC}" tag v2026.1000.0
# Correctifs locaux, faits sur v2026.1000.0
G "${SRC}" checkout -q -b local
printf 'ligne 1\nligne 2 locale\nligne 3\n' > "${SRC}/f1.txt"; G "${SRC}" commit -q -am "feat: 0001 modifie f1"
printf 'nouveau\n' > "${SRC}/nouveau.txt"; G "${SRC}" add nouveau.txt && G "${SRC}" commit -q -m "feat: 0002 ajoute nouveau"
printf 'a\nb\nc local\n' > "${SRC}/f3.txt"; G "${SRC}" commit -q -am "feat: 0003 modifie f3"
mkdir -p "${PATCHES}"
G "${SRC}" format-patch -q -3 -o "${PATCHES}" >/dev/null
# 0004 vient d'une série plus ancienne : son blob de départ (ligne « index ») n'existe dans aucun dépôt, le 3-way est impossible
printf 'ligne 1\nligne 2 locale\nligne 3 locale\n' > "${SRC}/f1.txt"; G "${SRC}" commit -q -am "feat: 0004 dépend de 0001"
PATCHES_B="${TMP}/patches-b"; mkdir -p "${PATCHES_B}"
G "${SRC}" format-patch -q -1 --start-number 4 -o "${PATCHES_B}" >/dev/null
sed -i -E 's/^index [0-9a-f]+\.\./index 1234567../' "${PATCHES_B}"/0004-*.patch
# Version suivante : f1 changé autrement, nouveau.txt identique, f3 intact, notes de version
G "${SRC}" checkout -q main
printf 'ligne 1\nligne 2 amont\nligne 3\n' > "${SRC}/f1.txt"; printf 'nouveau\n' > "${SRC}/nouveau.txt"
mkdir -p "${SRC}/packages/plugins/sdk" "${SRC}/packages/shared"; touch "${SRC}/packages/plugins/sdk/.gitkeep" "${SRC}/packages/shared/.gitkeep"
mkdir -p "${SRC}/releases"; printf '# v2026.1100.0\n- Amélioration du tableau\n- Security: fix GHSA-xxxx\n' > "${SRC}/releases/v2026.1100.0.md"
G "${SRC}" add -A && G "${SRC}" commit -q -m "1100" && G "${SRC}" tag v2026.1100.0
printf 'x\n' > "${SRC}/x.txt"; G "${SRC}" add -A && G "${SRC}" commit -q -m "1200"
G "${SRC}" tag canary/v2026.1200.0; G "${SRC}" tag v2026.1200.0-rc.1
git clone -q --bare "${SRC}" "${AMONT}"
git clone -q "${AMONT}" "${REF}"
G "${REF}" checkout -q -b atelier-local v2026.1000.0
printf 'DEPOT=%s\nTAG=v2026.1000.0\nSHA=x\n' "${AMONT}" > "${TMP}/VERSION"
export SOCLE_VERSION_FICHIER="${TMP}/VERSION" SOCLE_PATCHES="${PATCHES}" SOCLE_REFERENCE="${REF}"
export REPETITION_ESPACE_MIN_GIO=0

photo() { { G "${REF}" status --porcelain; G "${REF}" rev-parse HEAD; G "${REF}" for-each-ref; sha256sum "${PATCHES}"/*; } | sha256sum; }

[[ -x "${SCRIPT}" ]] || { echo "ECHEC  script absent ou non exécutable : ${SCRIPT}"; }
AVANT="$(photo)"
D1="${TMP}/d1"
lancer --dossier "${D1}"
RAPPORT="${D1}/rapport.md"

# 1
if [[ "${CODE}" -eq 0 && "${SORTIE}" == *"Cible : v2026.1100.0"* && "${SORTIE}" != *"canary"* && "${SORTIE}" != *"1200"* ]]; then
  ok "1. cible = version stable la plus récente : v2026.1100.0, étiquettes canary et rc ignorées"
else ko "1. cible" "code ${CODE}, cible attendue v2026.1100.0"; fi

# 2
L1="$(grep -E '^\| 0001' "${RAPPORT}" 2>/dev/null || true)"; L2="$(grep -E '^\| 0002' "${RAPPORT}" 2>/dev/null || true)"; L3="$(grep -E '^\| 0003' "${RAPPORT}" 2>/dev/null || true)"
if [[ "${L1}" == *"| conflit |"*"f1.txt"* && "${L2}" == *"déjà en amont"* && "${L3}" == *"sans conflit"* \
      && "${SORTIE}" == *"Sans conflit : 1"* && "${SORTIE}" == *"En conflit : 1"* && "${SORTIE}" == *"Déjà en amont : 1"* ]]; then
  ok "2. tableau : 0001 conflit (fichier nommé), 0002 déjà en amont, 0003 sans conflit ; totaux 1, 1, 1"
else ko "2. tableau" "lignes « ${L1} » / « ${L2} » / « ${L3} »"; fi

# 3
if grep -qF 'Security: fix GHSA-xxxx' "${RAPPORT}" 2>/dev/null; then
  ok "3. ligne de sécurité des notes de version recopiée dans le rapport"
else ko "3. sécurité" "ligne absente de ${RAPPORT}"; fi

# 4
APRES="$(photo)"
if [[ "${AVANT}" == "${APRES}" && -s "${RAPPORT}" ]]; then
  ok "4. clone de référence et dossier des correctifs inchangés : status, HEAD, refs et sha256 des correctifs identiques avant et après"
else ko "4. lecture seule" "empreinte avant ${AVANT}, après ${APRES}"; fi

# 5
lancer --tag v2026.1000.0 --si-nouvelle --dossier "${TMP}/d5"
if [[ "${CODE}" -eq 0 && "${SORTIE}" == *"déjà à jour"* && ! -e "${TMP}/d5" ]]; then
  ok "5. --si-nouvelle quand la cible est le TAG de socle/VERSION : rien n'est cloné, code 0, « déjà à jour »"
else ko "5. --si-nouvelle" "code ${CODE}, dossier créé : $([[ -e "${TMP}/d5" ]] && echo oui || echo non)"; fi

# 6
R6="ok"
for d in "${RACINE}/zz-essai-refus-repetition" "${REF}/zz-essai" "${PATCHES}/zz-essai"; do
  lancer --dossier "${d}"
  if [[ "${CODE}" -ne 2 || -e "${d}" ]]; then R6="code ${CODE}, ${d} existe : $([[ -e "${d}" ]] && echo oui || echo non)"; break; fi
done
if [[ "${R6}" == "ok" ]]; then ok "6. dossier de travail dans le dépôt ou dans la référence : refusé, code 2, rien de créé"
else ko "6. dossier refusé" "${R6}"; fi

# 7
REPETITION_ESPACE_MIN_GIO=999999999 lancer --dossier "${TMP}/d7"
if [[ "${CODE}" -eq 2 && "${SORTIE}" == *"espace"* && ! -e "${TMP}/d7" ]]; then
  ok "7. espace libre sous REPETITION_ESPACE_MIN_GIO : refusé, code 2, avant tout clone"
else ko "7. espace libre" "code ${CODE}"; fi

# 8
D8="${TMP}/d8"
lancer --dossier "${D8}"; C_SANS="${CODE}"; CLONE_SANS=non; [[ -e "${D8}/clone" ]] && CLONE_SANS=oui
RAP_SANS=non; [[ -s "${D8}/rapport.md" ]] && RAP_SANS=oui
D8G="${TMP}/d8g"
lancer --dossier "${D8G}" --garder; C_GARDE="${CODE}"; CLONE_GARDE=non; [[ -d "${D8G}/clone/.git" ]] && CLONE_GARDE=oui
if [[ "${C_SANS}" -eq 0 && "${C_GARDE}" -eq 0 && "${CLONE_SANS}" == non && "${RAP_SANS}" == oui && "${CLONE_GARDE}" == oui ]]; then
  ok "8. le clone est supprimé à la fin et rapport.md reste ; --garder le conserve"
else ko "8. nettoyage" "sans : clone ${CLONE_SANS} rapport ${RAP_SANS} ; garder : clone ${CLONE_GARDE}"; fi

# --- Construction facultative : faux pnpm en tête de PATH ---
mkdir -p "${TMP}/bin"
cat > "${TMP}/bin/pnpm" <<'FAUX'
#!/usr/bin/env bash
echo "${PWD} pnpm $*" >> "${FAUX_PNPM_JOURNAL}"
case "$1" in
  pack) dest=""; while [[ $# -gt 0 ]]; do [[ "$1" == --pack-destination ]] && dest="$2"; shift; done
        mkdir -p "${dest}"; : > "${dest}/paquet-$(basename "${PWD}").tgz" ;;
  typecheck) if [[ "${FAUX_PNPM_TYPECHECK:-}" == echec ]]; then echo "src/x.ts(3,1): error TS2339: propriété absente"; exit 2; fi ;;
esac
exit 0
FAUX
chmod +x "${TMP}/bin/pnpm"
export FAUX_PNPM_JOURNAL="${TMP}/pnpm.journal"
LOCK_AVANT="$(sha256sum "${RACINE}/plugin-atelier/pnpm-lock.yaml" 2>/dev/null)"
STATUT_AVANT="$(git -C "${RACINE}" status --short -- plugin-atelier)"

# 9
: > "${FAUX_PNPM_JOURNAL}"; D9="${TMP}/d9"
PATH="${TMP}/bin:${PATH}" lancer --dossier "${D9}" --construire
J="$(cat "${FAUX_PNPM_JOURNAL}")"
if [[ "${CODE}" -eq 0 && "${J}" == *"/clone pnpm install --frozen-lockfile"* && "${J}" == *"/clone pnpm build"* \
      && "${J}" == *"/clone/packages/plugins/sdk pnpm pack"* && "${J}" == *"/clone/packages/shared pnpm pack"* \
      && "${J}" == *"${D9}/plugin-atelier pnpm install --no-frozen-lockfile"* && "${J}" == *"${D9}/plugin-atelier pnpm typecheck"* \
      && "${J}" != *"${RACINE}/"* && "${SORTIE}" == *"typecheck : ok"* ]]; then
  ok "9. --construire : install figée et build dans le clone, pack de sdk et shared, typecheck dans une copie de plugin-atelier, jamais dans le dépôt"
else ko "9. --construire" "code ${CODE}, journal : ${J}"; fi

# 10
D10="${TMP}/d10"
FAUX_PNPM_TYPECHECK=echec PATH="${TMP}/bin:${PATH}" lancer --dossier "${D10}" --construire
if [[ "${CODE}" -eq 0 && "$(cat "${D10}/rapport.md" 2>/dev/null)" == *"typecheck : échec, 1 erreur"* ]]; then
  ok "10. --construire avec typecheck en échec : rapport « typecheck : échec, 1 erreur », code 0"
else ko "10. typecheck en échec" "code ${CODE}"; fi

# 11
LOCK_APRES="$(sha256sum "${RACINE}/plugin-atelier/pnpm-lock.yaml" 2>/dev/null)"
# Comparé à l'état d'avant les cas 9 et 10 : une modification locale déjà présente sous plugin-atelier ne fait pas échouer le cas.
if [[ "$(git -C "${RACINE}" status --short -- plugin-atelier)" == "${STATUT_AVANT}" && "${LOCK_AVANT}" == "${LOCK_APRES}" ]]; then
  ok "11. --construire : plugin-atelier du dépôt inchangé (git status --short plugin-atelier identique, lockfile identique)"
else ko "11. plugin-atelier du dépôt" "modifié"; fi

# 12
D12="${TMP}/d12"
SOCLE_PATCHES="${PATCHES_B}" lancer --dossier "${D12}"
L4="$(grep -E '^\| 0004' "${D12}/rapport.md" 2>/dev/null || true)"
if [[ "${CODE}" -eq 0 && "${L4}" == *"conflit"* && "${L4}" == *"f1.txt"* && "${L4}" == *"3-way impossible"* ]]; then
  ok "12. correctif dont les objets de départ sont absents : conflit avec les fichiers du correctif, « 3-way impossible »"
else ko "12. 3-way impossible" "ligne « ${L4} »"; fi

# 13
lancer -h
if [[ "${CODE}" -eq 0 && "${SORTIE}" == *"Usage :"* && "${SORTIE}" == *"Codes :"* && "${SORTIE}" != *"set -E"* ]]; then
  ok "13. -h : l'aide reprend l'en-tête du script, sans la ligne set"
else ko "13. aide" "code ${CODE}"; fi

echo "----"
echo "${TOTAL} cas, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 && "${TOTAL}" -ge 13 ]]
