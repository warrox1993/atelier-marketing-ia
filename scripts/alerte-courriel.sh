#!/usr/bin/env bash
# Envoie une alerte de l'Atelier par courriel réel (second canal à côté de notify-send, EXP-C3).
# Usage : scripts/alerte-courriel.sh [--journal <unité>] "<sujet>" "<corps>"
#   --journal  ajoute au corps, parmi les 30 dernières lignes de « journalctl --user -u <unité> » (unité en échec), les seules
#              lignes de résultat de systemd (horodatage, unité, « Failed with result … ») ; aucun texte de message (B5, B-2)
# Réglages (aucun secret) : ATELIER_ALERTE_CONFIG, défaut ~/.config/atelier/alerte-courriel.env, qui définit
#   ATELIER_ALERTE_A       destinataire
#   ATELIER_ALERTE_DE      expéditeur (le compte SMTP)
#   ATELIER_ALERTE_SMTP    serveur, par exemple smtps://smtp.exemple.org:465 (TLS exigé)
#   ATELIER_ALERTE_NETRC   fichier netrc du mot de passe, défaut ~/.config/atelier/alerte-courriel.netrc (mode 600)
# Code de sortie : 0 = envoyé, ou canal non configuré (message sur la sortie d'erreur) ; 1 = échec d'envoi
# ou réglage refusé ; 2 = mauvais usage. Le transport est curl (SMTP) : les tests le remplacent par une doublure.
set -uo pipefail

usage() { echo "Usage : $0 [--journal <unité>] \"<sujet>\" \"<corps>\"" >&2; exit 2; }
UNITE=""
if [[ "${1:-}" == "--journal" ]]; then
  [[ "${2:-}" =~ ^[A-Za-z0-9@._:-]+$ ]] || usage
  UNITE="$2"; shift 2
fi
[[ $# -eq 2 && -n "$1" ]] || usage
SUJET="${1//[$'\r\n']/ }"; CORPS="$2"
# B5 / B-2 : le journal porte des données de tiers (corps de requête, prospects, numéros, noms) et des secrets ; une liste de
# masquage ne les attrape jamais tous. Le courriel ne joint donc AUCUN texte de message : seulement, pour chaque ligne de
# résultat de systemd, l'horodatage, l'unité et « Failed with result '<code>' » (forme stricte). Le reste se lit sur le poste.
if [[ -n "${UNITE}" ]]; then
  RESULTATS="$(journalctl --user -u "${UNITE}" -n 30 --no-pager -o short-iso 2>/dev/null \
    | sed -nE "s/^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:+-]+) .*(Failed with result '[a-z-]+').*\$/\1 ${UNITE} : \2/p")"
  CORPS+=$'\n\n'"Résultat systemd de ${UNITE} (texte des messages non joint ; à lire sur le poste : journalctl --user -u ${UNITE}) :"$'\n'"${RESULTATS:-aucune ligne « Failed with result » dans les 30 dernières lignes}"
fi
CONFIG="${ATELIER_ALERTE_CONFIG:-${HOME}/.config/atelier/alerte-courriel.env}"

if [[ ! -f "${CONFIG}" ]]; then
  echo "courriel d'alerte non configuré (${CONFIG} absent) : seule la notification bureau est partie." >&2
  exit 0
fi
# shellcheck disable=SC1090
source "${CONFIG}"
A="${ATELIER_ALERTE_A:-}"; DE="${ATELIER_ALERTE_DE:-}"; SMTP="${ATELIER_ALERTE_SMTP:-}"
NETRC="${ATELIER_ALERTE_NETRC:-${HOME}/.config/atelier/alerte-courriel.netrc}"

adresse() { [[ "$1" =~ ^[^[:space:]@\<\>]+@[^[:space:]@\<\>]+$ ]]; }
adresse "${A}" && adresse "${DE}" || { echo "courriel d'alerte : ATELIER_ALERTE_A ou ATELIER_ALERTE_DE invalide dans ${CONFIG}" >&2; exit 1; }
[[ "${SMTP}" =~ ^smtps?://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]] || { echo "courriel d'alerte : ATELIER_ALERTE_SMTP invalide (smtps://hôte:port)" >&2; exit 1; }
[[ -f "${NETRC}" ]] || { echo "courriel d'alerte : fichier du mot de passe ${NETRC} absent" >&2; exit 1; }
# Le mot de passe ne doit être lisible que par son propriétaire.
[[ "$(stat -c '%a' "${NETRC}")" =~ ^[4-7]00$ ]] || { echo "courriel d'alerte : ${NETRC} lisible par d'autres (chmod 600)" >&2; exit 1; }

{
  printf 'From: Atelier marketing IA <%s>\r\nTo: <%s>\r\n' "${DE}" "${A}"
  printf 'Subject: =?UTF-8?B?%s?=\r\n' "$(printf '%s' "${SUJET}" | base64 -w0)"
  printf 'Date: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n' "$(LC_ALL=C date -R)"
  printf '%s\r\n' "${CORPS//$'\n'/$'\r\n'}"
} | curl --silent --show-error --ssl-reqd --max-time 30 --url "${SMTP}" --netrc-file "${NETRC}" \
      --mail-from "${DE}" --mail-rcpt "${A}" --upload-file - \
  || { echo "courriel d'alerte : échec de l'envoi par ${SMTP}" >&2; exit 1; }
