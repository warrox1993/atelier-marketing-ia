#!/usr/bin/env bash
# Installe (ou retire avec --retirer) le service systemd de la fabrique.
# À lancer en root (sudo) par l'opérateur qui dépose dans la file : son uid devient
# FABRIQUE_UID_DEPOSANT de l'unité. Idempotent.
#
# Entreprises autorisées : le service refuse toute entreprise absente de
# /var/lib/atelier-fabrique/entreprises.json (root:atelier-fabrique 0640, créé vide à l'installation,
# jamais écrasé ensuite). Commande d'opérateur pour en ajouter une (idempotente) :
#   sudo bash scripts/installer-fabrique.sh --autoriser-entreprise <identifiant>
set -uo pipefail

RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_LIB="/opt/atelier-fabrique/lib"
ETAT="/var/lib/atelier-fabrique"
LISTE_ENTREPRISES="$ETAT/entreprises.json"
UNITE="/etc/systemd/system/atelier-fabrique.service"

echec() { echo "erreur : $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || echec "à lancer en root (sudo)"

if [[ "${1:-}" == "--retirer" ]]; then
  systemctl stop atelier-fabrique.service 2>/dev/null
  systemctl disable atelier-fabrique.service 2>/dev/null
  rm -f -- "$UNITE" || echec "retrait de l'unité impossible"
  rm -rf -- "$DEST_LIB/fabrique" || echec "retrait du code impossible"
  systemctl daemon-reload || echec "daemon-reload impossible"
  echo "Service retiré (les données de /var/lib/atelier-fabrique sont conservées)."
  exit 0
fi

# Crée la liste des entreprises autorisées si elle manque (vide) ; ne l'écrase jamais.
preparer_liste() {
  id atelier-fabrique >/dev/null 2>&1 || echec "utilisateur atelier-fabrique absent"
  install -d -o atelier-fabrique -g atelier-fabrique -m 0750 "$ETAT" || echec "création de $ETAT impossible"
  if [[ ! -e "$LISTE_ENTREPRISES" ]]; then
    install -o root -g atelier-fabrique -m 0640 /dev/null "$LISTE_ENTREPRISES" || echec "création de la liste impossible"
    echo "[]" > "$LISTE_ENTREPRISES" || echec "écriture de la liste impossible"
  fi
  chown root:atelier-fabrique "$LISTE_ENTREPRISES" && chmod 0640 "$LISTE_ENTREPRISES" \
    || echec "droits de la liste impossibles"
}

if [[ "${1:-}" == "--autoriser-entreprise" ]]; then
  [[ $# -eq 2 && "$2" =~ ^[A-Za-z0-9-]{1,64}$ ]] || echec "usage : installer-fabrique.sh --autoriser-entreprise <identifiant [A-Za-z0-9-]{1,64}>"
  preparer_liste
  python3 -I - "$LISTE_ENTREPRISES" "$2" <<'PYEOF' || echec "mise à jour de la liste impossible"
import json, os, sys
chemin, entreprise = sys.argv[1], sys.argv[2]
with open(chemin, encoding="utf-8") as f:
    liste = json.load(f)
if not isinstance(liste, list):
    sys.exit("la liste existante n'est pas un tableau JSON")
if entreprise not in liste:
    liste.append(entreprise)
temporaire = chemin + ".tmp"
with open(temporaire, "w", encoding="utf-8") as f:
    json.dump(sorted(set(liste)), f, indent=2)
os.chmod(temporaire, 0o640)
os.rename(temporaire, chemin)
PYEOF
  chown root:atelier-fabrique "$LISTE_ENTREPRISES" && chmod 0640 "$LISTE_ENTREPRISES" || echec "droits de la liste impossibles"
  echo "Entreprise $2 autorisée (liste : $LISTE_ENTREPRISES)."
  exit 0
fi

[[ $# -eq 0 ]] || echec "usage : installer-fabrique.sh [--retirer | --autoriser-entreprise <identifiant>]"

# uid de l'opérateur : celui qui a lancé sudo, sinon l'utilisateur courant.
UID_DEPOSANT="${SUDO_UID:-}"
[[ -n "$UID_DEPOSANT" ]] || echec "SUDO_UID absent : lancer avec sudo depuis le compte de l'opérateur"
[[ "$UID_DEPOSANT" =~ ^[0-9]+$ && "$UID_DEPOSANT" -ne 0 ]] || echec "uid de l'opérateur invalide : $UID_DEPOSANT"
id atelier-fabrique >/dev/null 2>&1 || echec "utilisateur atelier-fabrique absent"
preparer_liste

# exiftool pose le XMP IPTC des vidéos (provenance IA) : paquet Ubuntu, installé s'il manque.
if ! command -v exiftool >/dev/null 2>&1; then
  echo "exiftool absent : installation de libimage-exiftool-perl"
  apt-get install -y libimage-exiftool-perl || echec "installation de libimage-exiftool-perl impossible"
  command -v exiftool >/dev/null 2>&1 || echec "exiftool introuvable après installation"
fi
[[ -f "$RACINE_DEPOT/fabrique/service.py" ]] || echec "fabrique/service.py introuvable"

# Code copié hors de /home (ProtectHome le cache), sans les tests, propriété de root.
install -d -o root -g root -m 0755 "$DEST_LIB" "$DEST_LIB/fabrique" || echec "création de $DEST_LIB impossible"
find "$DEST_LIB/fabrique" -mindepth 1 -delete || echec "nettoyage de l'ancien code impossible"
for source in "$RACINE_DEPOT"/fabrique/*.py; do
  install -o root -g root -m 0644 "$source" "$DEST_LIB/fabrique/" || echec "copie de $source impossible"
done
# Générateurs (montés en lecture seule sur /code dans la cage) : sources seulement, sans tests.
install -d -o root -g root -m 0755 "$DEST_LIB/fabrique/generateurs" || echec "création de generateurs impossible"
for source in "$RACINE_DEPOT"/fabrique/generateurs/*.py; do
  install -o root -g root -m 0644 "$source" "$DEST_LIB/fabrique/generateurs/" || echec "copie de $source impossible"
done

# Données lues par le code : révisions des modèles de voix (modeles.json).
for source in "$RACINE_DEPOT"/fabrique/*.json; do
  [[ -e "$source" ]] || continue
  install -o root -g root -m 0644 "$source" "$DEST_LIB/fabrique/" || echec "copie de $source impossible"
done
# Gabarits HyperFrames et empreintes CSP (lus par generateurs/visuels.py, côté hôte).
DEST_HF="$DEST_LIB/fabrique/hyperframes"
[[ -f "$RACINE_DEPOT/fabrique/hyperframes/csp-hashes.json" ]] || echec "fabrique/hyperframes/csp-hashes.json introuvable"
install -d -o root -g root -m 0755 "$DEST_HF" || echec "création de $DEST_HF impossible"
install -o root -g root -m 0644 "$RACINE_DEPOT/fabrique/hyperframes/csp-hashes.json" "$DEST_HF/" \
  || echec "copie de csp-hashes.json impossible"
(cd "$RACINE_DEPOT/fabrique/hyperframes" && find gabarits -type d -exec install -d -o root -g root -m 0755 "$DEST_HF/{}" \;) \
  || echec "création des dossiers de gabarits impossible"
(cd "$RACINE_DEPOT/fabrique/hyperframes" && find gabarits -type f -exec install -o root -g root -m 0644 {} "$DEST_HF/{}" \;) \
  || echec "copie des gabarits impossible"

# Unité : on place l'uid du déposant dans le modèle.
TMP="$(mktemp)" || echec "mktemp impossible"
trap 'rm -f -- "$TMP"' EXIT
sed "s/__UID_DEPOSANT__/$UID_DEPOSANT/" "$RACINE_DEPOT/fabrique/systemd/atelier-fabrique.service" > "$TMP" \
  || echec "génération de l'unité impossible"
install -o root -g root -m 0644 "$TMP" "$UNITE" || echec "installation de l'unité impossible"

systemctl daemon-reload || echec "daemon-reload impossible"
systemctl enable atelier-fabrique.service || echec "enable impossible"
systemctl restart atelier-fabrique.service || echec "démarrage impossible (voir journalctl -u atelier-fabrique)"
systemctl is-active --quiet atelier-fabrique.service || echec "service inactif après démarrage"
echo "Service atelier-fabrique installé et actif (déposant uid $UID_DEPOSANT)."
