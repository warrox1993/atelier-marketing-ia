#!/usr/bin/env bash
# Prépare la publication publique du dépôt : met à jour la branche locale « publication ».
#
# Chaque commit de « publication » a pour arbre l'état NETTOYÉ de la branche source (main par
# défaut) et pour seul parent le commit précédent de « publication ». Le premier commit est
# orphelin : l'historique détaillé de main reste local.
#
# Le script ne pousse jamais. Il affiche la commande `git push` à lancer à la fin.
#
# Déroulement :
#   1. exporte l'arbre de la branche source dans un dossier temporaire (git archive) ;
#      la copie de travail n'est jamais lue ni modifiée ;
#   2. nettoie l'export : retire les passages balisés comme privés, applique les règles de
#      scripts/publication/regles.txt ;
#   3. contrôle l'export et REFUSE de publier (code de sortie 1) si gitleaks trouve quelque
#      chose, si le nom du client apparaît (hors empreintes de lockfiles), si l'e-mail personnel
#      ou un chemin personnel subsiste, si un fichier ignoré par .gitignore est suivi, ou si un
#      balisage privé est resté ouvert ;
#   4. crée le commit avec l'identité noreply, sans toucher à la branche courante ni à l'index
#      (commandes de plomberie git : le nom du client et les termes à retirer ne sont écrits en
#      clair nulle part dans ce script).
#
# Usage : scripts/publier.sh [--source BRANCHE] [--message TEXTE] [--a-blanc] [--depot CHEMIN]
#   --source BRANCHE  branche à publier (défaut : main)
#   --message TEXTE   message du commit (défaut : daté, avec le commit source abrégé)
#   --a-blanc         exporte, nettoie et contrôle, sans créer de commit
#   --depot CHEMIN    dépôt à traiter (défaut : celui qui contient ce script ; sert aux tests)
#
# Codes de sortie : 0 = commit créé, ou rien à publier, ou contrôle à blanc réussi ;
#                   1 = publication refusée par un contrôle ; 2 = erreur d'utilisation ou d'environnement.
set -uo pipefail

# Identité de publication (adresse noreply GitHub du compte public).
NOM_PUBLICATION="Jean-Baptiste Dhondt"
COURRIEL_PUBLICATION="114347858+warrox1993@users.noreply.github.com"
BRANCHE_PUBLICATION="publication"
DEPOT_DISTANT="warrox1993/atelier-marketing-ia"

# Motifs de contrôle (un crochet autour d'une lettre : le script ne se reconnaît pas lui-même).
MOTIF_COURRIEL='dhondt[A-Za-z0-9._+-]*@|@gm[a]il\.com'
MOTIF_CHEMIN='/home/jean[-]baptiste|-home-jean[-]baptiste|JBsTowe[r]'
MOTIF_CLIENT='R[G]F'
# Balises de passages privés, assemblées en deux morceaux pour ne pas figurer en clair ici.
DEBUT_BALISE='<!-- prive'":debut -->"
FIN_BALISE='<!-- prive'":fin -->"

erreur() { echo "ERREUR : $*" >&2; exit 2; }
refus() { echo "REFUS : $*" >&2; REFUS=$((REFUS + 1)); }

SOURCE="main"
MESSAGE=""
A_BLANC=0
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) [[ $# -ge 2 ]] || erreur "--source demande une branche."; SOURCE="$2"; shift 2 ;;
    --message) [[ $# -ge 2 ]] || erreur "--message demande un texte."; MESSAGE="$2"; shift 2 ;;
    --a-blanc) A_BLANC=1; shift ;;
    --depot) [[ $# -ge 2 ]] || erreur "--depot demande un chemin."; RACINE="$(cd "$2" && pwd)" || erreur "dépôt introuvable : $2"; shift 2 ;;
    -h|--help) sed -n '2,/^set -uo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) erreur "option inconnue : $1 (voir --help)." ;;
  esac
done

for outil in git gitleaks perl tar grep find xargs; do
  command -v "${outil}" >/dev/null 2>&1 || erreur "outil requis absent : ${outil}."
done
GIT_DIR_REEL="$(git -C "${RACINE}" rev-parse --absolute-git-dir 2>/dev/null)" || erreur "${RACINE} n'est pas un dépôt git."
git -C "${RACINE}" rev-parse -q --verify "refs/heads/${SOURCE}" >/dev/null || erreur "branche source introuvable : ${SOURCE}."
COMMIT_SOURCE="$(git -C "${RACINE}" rev-parse "refs/heads/${SOURCE}")"
COMMIT_COURT="$(git -C "${RACINE}" rev-parse --short "${COMMIT_SOURCE}")"

# Les modifications non validées de la copie de travail ne sont PAS publiées : on prévient.
if [[ -n "$(git -C "${RACINE}" status --porcelain 2>/dev/null)" ]]; then
  echo "AVERTISSEMENT : la copie de travail a des modifications non validées ; seule la branche ${SOURCE} (${COMMIT_COURT}) est publiée." >&2
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/publier.XXXXXX")" || erreur "dossier temporaire impossible."
trap 'rm -rf "${TMP}"' EXIT   # TMP est un dossier créé ici par mktemp
EXPORT="${TMP}/export"
mkdir -p "${EXPORT}" || erreur "création de ${EXPORT} impossible."

# --- 1. Export de l'arbre de la branche source ---------------------------------------------
git -C "${RACINE}" archive --format=tar "${COMMIT_SOURCE}" | tar -x -C "${EXPORT}" \
  || erreur "export de ${SOURCE} impossible."

# --- Contrôle préalable : fichiers suivis mais ignorés (avant tout nettoyage) --------------
# Un index temporaire reçoit l'arbre source ; git liste ce qui est à la fois suivi et ignoré.
REFUS=0
export GIT_INDEX_FILE="${TMP}/index"
IGNORES="$(GIT_DIR="${GIT_DIR_REEL}" git --work-tree="${EXPORT}" read-tree "${COMMIT_SOURCE}" \
  && cd "${EXPORT}" && GIT_DIR="${GIT_DIR_REEL}" git --work-tree="${EXPORT}" ls-files -ci --exclude-standard)" \
  || erreur "contrôle des fichiers ignorés impossible."
if [[ -n "${IGNORES}" ]]; then
  refus "fichiers suivis mais ignorés par .gitignore :"
  echo "${IGNORES}" | sed 's/^/  - /' >&2
fi

# --- 2. Nettoyage de l'export --------------------------------------------------------------
REGLES="${EXPORT}/scripts/publication/regles.txt"
[[ -f "${REGLES}" ]] || erreur "fichier de règles absent de la branche ${SOURCE} : scripts/publication/regles.txt."
export REGLES DEBUT_BALISE FIN_BALISE
cat > "${TMP}/nettoyer.pl" <<'PERL'
# Exécuté par « perl -p -0777 -i » sur chaque fichier texte de l'export.
use strict;
use warnings;
our @regles;
BEGIN {
    local $/ = "\n";
    open(my $fh, '<', $ENV{REGLES}) or die "règles illisibles : $!\n";
    while (my $ligne = <$fh>) {
        chomp $ligne;
        next if $ligne =~ /^\s*(?:#|$)/;
        my ($motif, $remplacement) = split(/\t/, $ligne, 2);
        die "règle sans tabulation : $ligne\n" unless defined $remplacement;
        push @regles, [ qr/$motif/, $remplacement ];
    }
    close($fh);
}
my $debut = quotemeta($ENV{DEBUT_BALISE});
my $fin   = quotemeta($ENV{FIN_BALISE});
# Passages privés : lignes entières d'abord, puis passages en ligne.
s/^[ \t]*$debut[ \t]*\n.*?^[ \t]*$fin[ \t]*\n//msg;
s/$debut.*?$fin//sg;
for my $regle (@regles) {
    s/$regle->[0]/$regle->[1]/g;
}
PERL
# Fichiers texte seulement (grep -I écarte les binaires, comme les captures PNG).
FICHIERS_TEXTE="${TMP}/fichiers-texte.liste"
grep -rIlZ . "${EXPORT}" > "${FICHIERS_TEXTE}" 2>/dev/null
if [[ -s "${FICHIERS_TEXTE}" ]]; then
  xargs -0 perl -p -0777 -i "${TMP}/nettoyer.pl" < "${FICHIERS_TEXTE}" || erreur "nettoyage de l'export en échec."
fi

# --- 3. Contrôles de l'export nettoyé ------------------------------------------------------
# a. gitleaks sur tout l'arbre exporté.
OPTIONS_GITLEAKS=()
[[ -f "${EXPORT}/.gitleaks.toml" ]] && OPTIONS_GITLEAKS=(-c "${EXPORT}/.gitleaks.toml")
if ! gitleaks dir "${EXPORT}" --no-banner --no-color --redact --exit-code 1 "${OPTIONS_GITLEAKS[@]}" >"${TMP}/gitleaks.log" 2>&1; then
  refus "gitleaks signale des secrets potentiels :"
  sed 's/^/  | /' "${TMP}/gitleaks.log" >&2
fi
# b. nom du client : jamais, sauf dans les lignes d'empreintes (integrity) des lockfiles ;
#    les noms de fichiers sont contrôlés aussi.
HITS_CLIENT="$(grep -rIinE "${MOTIF_CLIENT}" "${EXPORT}" 2>/dev/null \
  | grep -vE '/(pnpm-lock\.yaml|package-lock\.json|yarn\.lock):[0-9]+:.*integrity' | sed "s#^${EXPORT}/##" | cut -c1-120)"
if [[ -n "${HITS_CLIENT}" ]]; then
  refus "le nom du client apparaît (hors empreintes de lockfiles) :"
  echo "${HITS_CLIENT}" | sed 's/^/  - /' >&2
fi
NOMS_CLIENT="$(find "${EXPORT}" -iname "*${MOTIF_CLIENT}*" 2>/dev/null | sed "s#^${EXPORT}/##")"
[[ -z "${NOMS_CLIENT}" ]] || { refus "le nom du client apparaît dans des noms de fichiers :"; echo "${NOMS_CLIENT}" | sed 's/^/  - /' >&2; }
# c. e-mail personnel et chemins personnels (binaires inclus : -a).
HITS_COURRIEL="$(grep -rlaE "${MOTIF_COURRIEL}" "${EXPORT}" 2>/dev/null | sed "s#^${EXPORT}/##")"
[[ -z "${HITS_COURRIEL}" ]] || { refus "une adresse e-mail personnelle subsiste dans :"; echo "${HITS_COURRIEL}" | sed 's/^/  - /' >&2; }
HITS_CHEMIN="$(grep -rlaiE "${MOTIF_CHEMIN}" "${EXPORT}" 2>/dev/null | sed "s#^${EXPORT}/##")"
[[ -z "${HITS_CHEMIN}" ]] || { refus "un chemin ou nom de machine personnel subsiste dans :"; echo "${HITS_CHEMIN}" | sed 's/^/  - /' >&2; }
# d. balisage privé resté ouvert ou orphelin.
HITS_BALISE="$(grep -rlaE '<!-- *prive:(debut|fin) *-->' "${EXPORT}" 2>/dev/null | sed "s#^${EXPORT}/##")"
[[ -z "${HITS_BALISE}" ]] || { refus "balisage privé non apparié (ouverture sans fermeture, ou l'inverse) dans :"; echo "${HITS_BALISE}" | sed 's/^/  - /' >&2; }

if [[ "${REFUS}" -gt 0 ]]; then
  echo "Publication REFUSÉE : ${REFUS} contrôle(s) en échec. Aucun commit créé." >&2
  exit 1
fi
echo "Contrôles réussis sur l'arbre nettoyé de ${SOURCE} (${COMMIT_COURT})."

# --- 4. Commit sur la branche de publication -----------------------------------------------
export GIT_DIR="${GIT_DIR_REEL}"
if ! (cd "${EXPORT}" && git --work-tree="${EXPORT}" read-tree --empty && git --work-tree="${EXPORT}" add -A -f . ); then
  erreur "indexation de l'export impossible."
fi
ARBRE="$(git write-tree)" || erreur "écriture de l'arbre impossible."
PARENT="$(git rev-parse -q --verify "refs/heads/${BRANCHE_PUBLICATION}" || true)"
if [[ -n "${PARENT}" && "$(git rev-parse "${PARENT}^{tree}")" == "${ARBRE}" ]]; then
  echo "Rien à publier : l'arbre nettoyé est identique à celui de ${BRANCHE_PUBLICATION} ($(git rev-parse --short "${PARENT}"))."
  exit 0
fi
if [[ "${A_BLANC}" -eq 1 ]]; then
  echo "Mode à blanc : un commit serait créé (arbre ${ARBRE:0:12}). Rien n'a été écrit."
  exit 0
fi
if [[ -z "${MESSAGE}" ]]; then
  if [[ -z "${PARENT}" ]]; then
    MESSAGE="Atelier Marketing IA : publication initiale"
  else
    MESSAGE="Publication du $(date +%d/%m/%Y) (état de ${SOURCE} ${COMMIT_COURT})"
  fi
fi
export GIT_AUTHOR_NAME="${NOM_PUBLICATION}" GIT_AUTHOR_EMAIL="${COURRIEL_PUBLICATION}"
export GIT_COMMITTER_NAME="${NOM_PUBLICATION}" GIT_COMMITTER_EMAIL="${COURRIEL_PUBLICATION}"
if [[ -n "${PARENT}" ]]; then
  NOUVEAU="$(printf '%s\n' "${MESSAGE}" | git commit-tree "${ARBRE}" -p "${PARENT}")" || erreur "création du commit impossible."
else
  NOUVEAU="$(printf '%s\n' "${MESSAGE}" | git commit-tree "${ARBRE}")" || erreur "création du commit orphelin impossible."
fi
git update-ref -m "publier.sh : ${MESSAGE}" "refs/heads/${BRANCHE_PUBLICATION}" "${NOUVEAU}" ${PARENT:+"${PARENT}"} \
  || erreur "mise à jour de la branche ${BRANCHE_PUBLICATION} impossible."
echo "Commit créé sur ${BRANCHE_PUBLICATION} : $(git rev-parse --short "${NOUVEAU}") (${MESSAGE})."
echo
echo "Rien n'a été poussé. Pour publier (dépôt public ${DEPOT_DISTANT}) :"
echo "  git -C ${RACINE} push https://github.com/${DEPOT_DISTANT}.git ${BRANCHE_PUBLICATION}:main"
exit 0
