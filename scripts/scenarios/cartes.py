"""Connexion d'une carte de galerie de la passerelle marketing (patch socle 0004), jouée
comme le ferait l'interface : création par la carte, autorisation OAuth, page de
consentement de la passerelle de DÉMONSTRATION remplie par requêtes HTTP, rappel
Paperclip, puis finalisation avec les défauts suggérés par le socle (sélection
identique à `askFirstCatalogEntryIdsFor` de l'assistant de connexion).

Aucun navigateur, aucun fournisseur réel : la passerelle doit être en démonstration.
Bibliothèque standard seulement.
"""
import html.parser
import json
import urllib.error
import urllib.parse
import urllib.request


class _SansRedirection(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: D401 - on lit la redirection soi-même
        return None


_OUVREUR = urllib.request.build_opener(_SansRedirection)


class _Formulaire(html.parser.HTMLParser):
    """Lit le champ caché « transaction » et la première propriété cochée."""

    def __init__(self):
        super().__init__()
        self.transaction = None
        self.propriete = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag != "input":
            return
        if a.get("name") == "transaction":
            self.transaction = a.get("value")
        if a.get("name") == "propriete" and self.propriete is None and "checked" in a:
            self.propriete = a.get("value")


def _http(methode, url, corps=None, entetes=None):
    req = urllib.request.Request(url, data=corps, method=methode, headers=entetes or {})
    try:
        with _OUVREUR.open(req, timeout=60) as rep:
            return rep.status, dict(rep.headers), rep.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), err.read().decode("utf-8", "replace")


def connecter_carte(api, company_id, slug, methode="lecture", finaliser=True):
    """Crée et autorise une connexion par la carte `slug`. Renvoie un résumé vérifiable.

    `api(methode, chemin, corps, attendu)` est la fonction d'appel du lanceur (base /api).
    """
    _, connecte = api("POST", f"/companies/{company_id}/tools/apps/connect",
                      {"galleryKey": slug, "connectionMethodKey": methode}, attendu=(200, 201))
    connexion_id = connecte["connectionId"]
    _, debut = api("POST", f"/tools/oauth/{connexion_id}/start", {}, attendu=(200, 201))
    url_autorisation = debut["authorizationUrl"]
    portee_demandee = urllib.parse.parse_qs(urllib.parse.urlparse(url_autorisation).query).get("scope")

    code, _, page = _http("GET", url_autorisation)
    if code != 200:
        raise RuntimeError(f"consentement {slug} : HTTP {code} {page[:200]}")
    f = _Formulaire()
    f.feed(page)
    if not f.transaction or not f.propriete:
        raise RuntimeError(f"consentement {slug} : formulaire illisible")
    origine = "{0.scheme}://{0.netloc}".format(urllib.parse.urlparse(url_autorisation))
    corps = urllib.parse.urlencode({"transaction": f.transaction, "propriete": f.propriete, "decision": "autoriser"}).encode()
    code, entetes, _ = _http("POST", f"{origine}/oauth/authorize", corps,
                             {"Content-Type": "application/x-www-form-urlencoded"})
    retour = entetes.get("Location") or entetes.get("location")
    if code not in (302, 303) or not retour:
        raise RuntimeError(f"consentement {slug} : pas de redirection (HTTP {code})")
    # Le rappel suit EXACTEMENT l'adresse de redirection (Paperclip la calcule à partir de son
    # origine canonique, ex. http://localhost:<port>, et la recompare à l'échange du code).
    code, _, brut = _http("GET", retour, entetes={"Accept": "application/json"})
    if code != 200:
        raise RuntimeError(f"rappel {slug} : HTTP {code} {brut[:300]}")
    rappel = json.loads(brut)

    resultat = {
        "connexionId": connexion_id,
        "porteeDemandee": portee_demandee,
        "propriete": f.propriete,
        "defautsSuggeres": rappel.get("suggestedDefaults"),
        "statutApresRappel": (rappel.get("connection") or {}).get("status"),
        "catalogue": {e["toolName"]: e["riskLevel"] for e in rappel.get("catalog", [])},
    }
    if finaliser:
        niveaux = set((rappel.get("suggestedDefaults") or {}).get("askFirstRiskLevels") or [])
        actifs = [e for e in rappel.get("catalog", []) if e.get("status") in ("active", "quarantined")]
        _, fin = api("POST", f"/companies/{company_id}/tools/apps/{connexion_id}/finish", {
            "enabledCatalogEntryIds": [e["id"] for e in actifs],
            "askFirstCatalogEntryIds": [e["id"] for e in actifs if e["riskLevel"] in niveaux],
            "reviewedCatalogEntryIds": [e["id"] for e in actifs if e.get("status") == "quarantined"],
            "access": "all_agents",
        }, attendu=(200, 201))
        par_id = {e["id"]: e["toolName"] for e in rappel.get("catalog", [])}
        resultat["demanderAvant"] = sorted(
            par_id.get((p.get("selectors") or {}).get("catalogEntryId"), "?")
            for p in fin.get("policies", []) if p.get("policyType") == "require_approval"
        )
        resultat["statut"] = (fin.get("connection") or {}).get("status")
        resultat["nom"] = (fin.get("connection") or {}).get("name")
    return resultat


def appel_outil(api, connexion_id, agent_id, outil, arguments=None):
    """Appel d'essai natif d'un outil de la connexion au nom d'un agent (décision de politique comprise)."""
    code, sortie = api("POST", f"/tool-connections/{connexion_id}/test-calls",
                       {"agentId": agent_id, "toolName": outil, "parameters": arguments or {}})
    return code, sortie


if __name__ == "__main__":  # essai manuel : python3 -I cartes.py <API> <companyId> <slug> [methode]
    import sys

    base = sys.argv[1].rstrip("/")

    def _api(methode, chemin, corps=None, attendu=None):
        donnees = None if corps is None else json.dumps(corps).encode()
        req = urllib.request.Request(base + chemin, data=donnees, method=methode,
                                     headers={"Content-Type": "application/json", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as rep:
                brut = rep.read().decode()
                code, sortie = rep.status, (json.loads(brut) if brut else None)
        except urllib.error.HTTPError as err:
            code, sortie = err.code, err.read().decode()[:600]
        if attendu and code not in attendu:
            raise RuntimeError(f"{methode} {chemin} -> {code} : {sortie}")
        return code, sortie

    print(json.dumps(connecter_carte(_api, sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "lecture"),
                     ensure_ascii=False, indent=2))
