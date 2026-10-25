#!/usr/bin/env bash
# Installe la transcription de la fabrique (lot 8, sous-titres) :
#   1. whisper.cpp à l'étiquette figée v1.9.5 (commit vérifié), compilé en Release avec un cache
#      de compilation (ccache) et l'éditeur de liens mold ; CUDA seulement si le kit (nvcc) est
#      présent, sinon compilation pour processeur (dit clairement) ;
#   2. binaire /opt/atelier-fabrique/bin/whisper-cli (root, 0755), statique (aucune bibliothèque
#      whisper à monter dans la cage) ;
#   3. modèle ggml, téléchargé UNE fois à une révision Hugging Face figée, dans
#      /var/lib/atelier-fabrique/modeles/whisper-<nom>@<revision>/ (root:atelier-fabrique,
#      lecture seule), empreinte sha256 contrôlée d'après fabrique/modeles-whisper.json.
# À lancer en root (sudo). Idempotent : sans changement, ne recompile ni ne retélécharge rien.
# La compilation se fait sous l'identité de l'opérateur (SUDO_USER), dans son cache utilisateur.
set -uo pipefail

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELES_JSON="$RACINE_DEPOT/fabrique/modeles-whisper.json"
DEPOT_WHISPER="https://github.com/ggml-org/whisper.cpp"
ETIQUETTE="v1.9.5"
COMMIT_ATTENDU="d1be6fde11ac6e0407606b4e42fe72d34add8037"
RACINE="/opt/atelier-fabrique"
BINAIRE="$RACINE/bin/whisper-cli"
DONNEES="/var/lib/atelier-fabrique"
MODELES="$DONNEES/modeles"
GROUPE="atelier-fabrique"

echec() { echo "erreur : $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || echec "à lancer en root (sudo)"
[[ -f "$MODELES_JSON" ]] || echec "fichier introuvable : $MODELES_JSON"
[[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]] || echec "lancer par sudo depuis le compte opérateur (SUDO_USER requis pour la compilation)"
getent group "$GROUPE" >/dev/null || echec "groupe $GROUPE absent (lancer scripts/installer-fabrique.sh d'abord)"
[[ -d "$MODELES" ]] || echec "$MODELES absent (lancer scripts/installer-fabrique.sh d'abord)"

MAISON="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
[[ -n "$MAISON" && -d "$MAISON" ]] || echec "dossier personnel de $SUDO_USER introuvable"
SOURCE="${ATELIER_WHISPER_SOURCE:-$MAISON/.cache/atelier-fabrique/whisper.cpp}"
ETAT="$SOURCE/.etat-installation"
en_operateur() { runuser -u "$SUDO_USER" -- "$@"; }

# Outillage : cache de compilation et éditeur de liens rapide (paquets stables Ubuntu).
manquants=()
for outil in git cmake curl ccache mold; do
  command -v "$outil" >/dev/null || manquants+=("$outil")
done
if ((${#manquants[@]})); then
  echo "Installation des outils manquants : ${manquants[*]}"
  apt-get install -y "${manquants[@]}" >/dev/null || echec "installation de ${manquants[*]} impossible"
fi

# CUDA : seulement si le kit est présent.
NVCC="$(command -v nvcc || true)"
[[ -z "$NVCC" && -x /usr/local/cuda/bin/nvcc ]] && NVCC=/usr/local/cuda/bin/nvcc
if [[ -n "$NVCC" ]]; then
  VARIANTE="cuda"
  echo "Kit CUDA présent ($NVCC) : compilation avec CUDA."
else
  VARIANTE="cpu"
  echo "Kit CUDA absent (nvcc introuvable) : compilation POUR PROCESSEUR seulement (pas de GPU)."
fi

# 1. Source à l'étiquette figée.
install -d -o "$SUDO_USER" -m 0755 "$(dirname "$SOURCE")" || echec "création de $(dirname "$SOURCE") impossible"
if [[ ! -d "$SOURCE/.git" ]]; then
  en_operateur git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$ETIQUETTE" "$DEPOT_WHISPER" "$SOURCE" \
    || echec "clonage de $DEPOT_WHISPER ($ETIQUETTE) impossible"
fi
commit="$(en_operateur git -C "$SOURCE" rev-parse "$ETIQUETTE^{commit}" 2>/dev/null)" \
  || echec "étiquette $ETIQUETTE absente de $SOURCE (supprimer le dossier pour recloner)"
[[ "$commit" == "$COMMIT_ATTENDU" ]] \
  || echec "l'étiquette $ETIQUETTE pointe sur $commit au lieu de $COMMIT_ATTENDU : arrêt"
echo "whisper.cpp $ETIQUETTE, commit $commit"

# 2. Compilation et installation du binaire.
attendue="$ETIQUETTE-$commit-$VARIANTE"
if [[ -x "$BINAIRE" && -f "$ETAT" && "$(cat -- "$ETAT")" == "$attendue" ]]; then
  echo "Binaire déjà à jour : $BINAIRE ($attendue)"
else
  build="$SOURCE/build-fabrique"
  options=(-DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF
    -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_BUILD_SERVER=OFF
    -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache
    -DCMAKE_EXE_LINKER_FLAGS=-fuse-ld=mold)
  [[ "$VARIANTE" == "cuda" ]] && options+=(-DGGML_CUDA=ON)
  debut=$SECONDS
  en_operateur cmake -S "$SOURCE" -B "$build" "${options[@]}" >/dev/null || echec "configuration CMake impossible"
  en_operateur cmake --build "$build" --target whisper-cli -j "$(nproc)" >/dev/null || echec "compilation impossible"
  echo "Temps de compilation : $((SECONDS - debut)) s (ccache, appels en cache : $(en_operateur ccache -s 2>/dev/null | grep -m1 -E '^ +Hits:' | sed 's/^ *//'))"
  produit="$build/bin/whisper-cli"
  [[ -x "$produit" ]] || echec "binaire non produit : $produit"
  umask 022
  install -d -o root -g root -m 0755 "$RACINE" "$RACINE/bin" || echec "création de $RACINE/bin impossible"
  install -o root -g root -m 0755 "$produit" "$BINAIRE.nouveau" || echec "installation du binaire impossible"
  mv -f -- "$BINAIRE.nouveau" "$BINAIRE" || echec "remplacement du binaire impossible"
  printf '%s' "$attendue" >"$ETAT" && chown "$SUDO_USER" "$ETAT"
  echo "Binaire installé : $BINAIRE"
fi

# 3. Modèle, d'après modeles-whisper.json.
mapfile -t lignes < <(python3 -I - "$MODELES_JSON" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
m = d["modeles"][0]
f = m["fichier"]
print(m["nom"], m["depot"], m["revision"], f["nom"], f["sha256"], f["taille"], sep="\t")
PYEOF
) || echec "lecture de $MODELES_JSON impossible"
IFS=$'\t' read -r nom depot revision fichier sha256 taille <<<"${lignes[0]}"
cible="$MODELES/$nom@$revision"
if [[ -f "$cible/$fichier" ]] && [[ "$(sha256sum -- "$cible/$fichier" | cut -d' ' -f1)" == "$sha256" ]]; then
  echo "Modèle déjà en place : $cible/$fichier"
else
  tmp="$(mktemp -d "$MODELES/.whisper-XXXXXX")" || echec "mktemp impossible"
  trap 'rm -rf -- "$tmp"' EXIT
  echo "Téléchargement de $fichier ($taille octets) depuis $depot@$revision"
  curl -fsSL --retry 3 -o "$tmp/$fichier" "https://huggingface.co/$depot/resolve/$revision/$fichier" \
    || echec "téléchargement impossible"
  obtenu="$(sha256sum -- "$tmp/$fichier" | cut -d' ' -f1)"
  [[ "$obtenu" == "$sha256" ]] || echec "empreinte sha256 inattendue : $obtenu au lieu de $sha256"
  rm -rf -- "$cible"
  install -d -o root -g "$GROUPE" -m 0750 "$cible" || echec "création de $cible impossible"
  install -o root -g "$GROUPE" -m 0440 "$tmp/$fichier" "$cible/$fichier" || echec "installation du modèle impossible"
  echo "Modèle installé : $cible/$fichier"
fi
echo "Terminé : whisper-cli $ETIQUETTE ($VARIANTE), modèle $nom@$revision"
