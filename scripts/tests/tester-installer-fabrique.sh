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
