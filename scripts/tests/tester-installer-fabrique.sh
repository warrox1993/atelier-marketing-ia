#!/usr/bin/env bash
# Contrôle statique de scripts/installer-fabrique.sh (lot I1 des images) : aucune exécution, aucun root.
# - registre chartes-autorisees/ créé comme voix-autorisees/ (root:atelier-fabrique, 0750), charte d'exemple
#   posée par entreprise seulement si elle manque, jamais écrasée ;
# - gabarits d'images et polices copiés avec le code ; chaque police vérifiée par empreinte avant la copie.
# Usage : scripts/tests/tester-installer-fabrique.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${RACINE}/scripts/installer-fabrique.sh"
ECHECS=0; TOTAL=0
ok() { TOTAL=$((TOTAL + 1)); echo "OK     $1"; }
ko() { TOTAL=$((TOTAL + 1)); ECHECS=$((ECHECS + 1)); echo "ECHEC  $1"; }
contient() { if grep -qF -- "$2" "${SCRIPT}"; then ok "$1"; else ko "$1 : « $2 » absent"; fi; }

bash -n "${SCRIPT}" && ok "syntaxe bash" || ko "syntaxe bash"

contient "registre des chartes créé comme celui des voix" \
  'install -d -o root -g atelier-fabrique -m 0750 "$CHARTES"'
contient "dossier de l'entreprise dans le registre des chartes" \
  'install -d -o root -g atelier-fabrique -m 0750 "$CHARTES/$2"'
contient "charte d'exemple posée seulement si elle manque" '[[ ! -e "$CHARTES/$2/sobre.json" ]]'
contient "charte d'exemple en lecture seule pour le service" \
  'install -o root -g atelier-fabrique -m 0640 "$CHARTE_EXEMPLE" "$CHARTES/$2/sobre.json"'
contient "gabarits d'images copiés avec les gabarits vidéo" 'find gabarits gabarits-images -type d'
contient "fichiers des gabarits d'images copiés" 'find gabarits gabarits-images -type f'
# Sélection recopiée par ecart-fabrique.sh : l'installeur doit garder ces motifs.
contient "sources Python copiées (motif repris par ecart-fabrique.sh)" '"$RACINE_DEPOT"/fabrique/*.py'
contient "générateurs copiés (motif repris par ecart-fabrique.sh)" '"$RACINE_DEPOT"/fabrique/generateurs/*.py'
contient "JSON copiés (motif repris par ecart-fabrique.sh)" '"$RACINE_DEPOT"/fabrique/*.json'
contient "empreintes CSP copiées (motif repris par ecart-fabrique.sh)" 'fabrique/hyperframes/csp-hashes.json'
contient "empreinte de chaque police vérifiée" 'sha256sum -- "$source"'
contient "police refusée si l'empreinte diffère" 'echec "empreinte inattendue'

# L'empreinte est contrôlée AVANT la copie de la police.
ligne_controle="$(grep -nF 'sha256sum -- "$source"' "${SCRIPT}" | head -1 | cut -d: -f1)"
ligne_copie="$(grep -nF '"$DEST_LIB/fabrique/polices/$fichier"' "${SCRIPT}" | head -1 | cut -d: -f1)"
if [[ -n "${ligne_controle}" && -n "${ligne_copie}" && "${ligne_controle}" -lt "${ligne_copie}" ]]; then
  ok "contrôle d'empreinte avant la copie"
else
  ko "contrôle d'empreinte avant la copie (lignes ${ligne_controle:-?} et ${ligne_copie:-?})"
fi

# Garde de travail en cours : AVANT l'effacement de l'ancien code (les générateurs sont relus depuis /opt à chaque étape).
ligne_garde="$(grep -nF 'travail en cours : relancer quand la file est vide' "${SCRIPT}" | head -1 | cut -d: -f1)"
ligne_nettoyage="$(grep -nF 'find "$DEST_LIB/fabrique" -mindepth 1 -delete' "${SCRIPT}" | head -1 | cut -d: -f1)"
if [[ -n "${ligne_garde}" && -n "${ligne_nettoyage}" && "${ligne_garde}" -lt "${ligne_nettoyage}" ]]; then
  ok "garde de travail en cours avant le nettoyage de l'ancien code"
else
  ko "garde de travail en cours avant le nettoyage de l'ancien code (lignes ${ligne_garde:-?} et ${ligne_nettoyage:-?})"
fi
contient "garde : seulement si le service est actif" 'if systemctl is-active --quiet atelier-fabrique.service'
contient "garde : lit les etat.json des livrables" 'find "$ETAT/livrables" -mindepth 3 -maxdepth 3 -name etat.json'

# Garde EXÉCUTÉE avec de fausses commandes (id, systemctl, install, chown, exiftool) dans un PATH temporaire et un ETAT
# et un DEST_LIB jetables : jamais de root, jamais le vrai /var/lib ni /opt. La fausse « install » s'arrête sur la création
# de DEST_LIB : le message « création de <DEST_LIB> impossible » prouve que la garde est franchie.
TMP="$(mktemp -d "${TMPDIR:-/tmp}/installeur-test-XXXXXX")" || exit 1
trap 'case "${TMP}" in "${TMPDIR:-/tmp}"/installeur-test-*) rm -rf -- "${TMP}" ;; esac' EXIT
mkdir -p "${TMP}/bin"
printf '#!/usr/bin/env bash\n[[ "$1" == "-u" ]] && echo 0\nexit 0\n' > "${TMP}/bin/id"
printf '#!/usr/bin/env bash\nexit 0\n' > "${TMP}/bin/chown"
printf '#!/usr/bin/env bash\nexit 0\n' > "${TMP}/bin/exiftool"
cat > "${TMP}/bin/systemctl" <<EOF
#!/usr/bin/env bash
[[ "\$1" == "is-active" && -e "${TMP}/service-actif" ]] && exit 0
exit 3
EOF
cat > "${TMP}/bin/install" <<EOF
#!/usr/bin/env bash
case "\$*" in *"${TMP}/opt"*) exit 1 ;; esac
exit 0
EOF
chmod +x "${TMP}/bin/"*

# garde_cas <nom> <actif|inactif> <refus|passe> : prépare ETAT (travaux et livrables déjà posés par l'appelant).
garde_cas() {
  local nom="$1" service="$2" attendu="$3" code sortie
  if [[ "${service}" == "actif" ]]; then touch "${TMP}/service-actif"; else rm -f "${TMP}/service-actif"; fi
  mkdir -p "${TMP}/opt/fabrique"; echo x > "${TMP}/opt/fabrique/ancien.py"
  sortie="$(PATH="${TMP}/bin:${PATH}" SUDO_UID=1000 ATELIER_FABRIQUE_ETAT="${TMP}/etat" \
    ATELIER_FABRIQUE_DEST_LIB="${TMP}/opt" bash "${SCRIPT}" 2>&1)"; code=$?
  if [[ "${attendu}" == "refus" ]]; then
    if [[ "${code}" -ne 0 && "${sortie}" == *"travail en cours"* && -f "${TMP}/opt/fabrique/ancien.py" ]]; then ok "${nom}"
    else ko "${nom} : code ${code}, sortie « ${sortie} »"; fi
  else
    if [[ "${sortie}" == *"création de ${TMP}/opt impossible"* && "${sortie}" != *"travail en cours"* ]]; then ok "${nom}"
    else ko "${nom} : code ${code}, sortie « ${sortie} »"; fi
  fi
}
nouvel_etat() { rm -rf -- "${TMP}/etat"; mkdir -p "${TMP}/etat/travaux" "${TMP}/etat/livrables/ent"; }

nouvel_etat; mkdir -p "${TMP}/etat/travaux/aaaa-bbbb"
garde_cas "garde exécutée : dossier travaux sans etat.json refusé" actif refus
nouvel_etat; mkdir -p "${TMP}/etat/livrables/ent/t1"
echo '{"etat": "en_attente_gpu"}' > "${TMP}/etat/livrables/ent/t1/etat.json"
garde_cas "garde exécutée : etat.json en_attente_gpu refusé" actif refus
nouvel_etat; mkdir -p "${TMP}/etat/livrables/ent/t1" "${TMP}/etat/livrables/ent/t2"
echo '{"etat": "en_cours"}' > "${TMP}/etat/livrables/ent/t1/etat.json"
garde_cas "garde exécutée : etat.json en_cours refusé" actif refus
nouvel_etat; mkdir -p "${TMP}/etat/livrables/ent/t1" "${TMP}/etat/livrables/ent/t2"
echo '{"etat": "termine"}' > "${TMP}/etat/livrables/ent/t1/etat.json"
echo '{"etat": "echec"}' > "${TMP}/etat/livrables/ent/t2/etat.json"
garde_cas "garde exécutée : aucun travail (terminés seulement), la garde passe" actif passe
nouvel_etat; mkdir -p "${TMP}/etat/travaux/aaaa-bbbb"
garde_cas "garde exécutée : service inactif avec travaux, la garde passe" inactif passe

# Le dossier des polices est créé lui-même en 0755 (sinon l'umask 027 le ferme au service : « erreur interne » du 30/10).
if grep -qF 'install -d -o root -g root -m 0755 "$DEST_LIB/fabrique/polices" ' "${SCRIPT}"; then
  ok "dossier des polices créé en 0755"
else
  ko "dossier des polices créé en 0755"
fi

# La charte d'exemple référencée par l'installeur existe dans le dépôt et passe le registre.
if python3 -I - "${RACINE}" <<'PYEOF'
import os, shutil, sys, tempfile
from pathlib import Path
racine = Path(sys.argv[1])
sys.path.insert(0, str(racine))
from fabrique import registre_charte
with tempfile.TemporaryDirectory() as dossier:
    os.mkdir(Path(dossier) / "acme")
    cible = Path(dossier) / "acme" / "sobre.json"
    shutil.copyfile(racine / "fabrique" / "chartes-exemple" / "sobre.json", cible)
    cible.chmod(0o640)
    registre_charte.resoudre("sobre", "acme", dossier, uid_proprietaire=os.getuid())
PYEOF
then ok "charte d'exemple acceptée par le registre"; else ko "charte d'exemple acceptée par le registre"; fi
contient "chemin de la charte d'exemple" 'CHARTE_EXEMPLE="$RACINE_DEPOT/fabrique/chartes-exemple/sobre.json"'

echo "${TOTAL} contrôles, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 ]]
