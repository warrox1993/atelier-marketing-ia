"""Tests minimaux de importer_base.py, avec un faux serveur (aucun réseau). Lancer : python3 -I -m pytest -q test_importer_base.py"""
import importlib.util
import os

ici = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("importer_base", os.path.join(ici, "importer_base.py"))
ib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ib)

ROUTE = f"/plugins/{ib.confier.PLUGIN_CLE}/api/obs/base/sources"


class Faux:
    """Faux serveur : base commune indexée par URL, comme la route idempotente du plugin."""
    def __init__(self):
        self.appels, self.base = [], {}

    def __call__(self, methode, chemin, corps=None):
        self.appels.append((methode, chemin, corps))
        if methode == "POST" and chemin == ROUTE:
            assert 1 <= len(corps["sources"]) <= 200 and corps["companyId"] == "CID"
            for s in corps["sources"]:
                self.base[s["url"]] = s
            return {"importees": len(corps["sources"])}
        raise AssertionError(f"appel inattendu {methode} {chemin}")


def ligne(i, type_="presse", **extra):
    return {"nom": f"S{i}", "url": f"https://s{i}.example/", "pays": "BE", "langue": "fr", "type": type_, "sujets": ["ia"], "fiabilite": "B", **extra}


def test_correspondance_des_types_primaire_reserve_aux_editeurs_et_institutions():
    assert ib.type_source("officiel") == "primaire" and ib.type_source("institution") == "primaire"
    for t in ("presse", "recherche", "annuaire", "agregateur", "newsletter"):
        assert ib.type_source(t) == "secondaire", t
    for t in ("blog", "forum", "youtube", "podcast", "video"):
        assert ib.type_source(t) == "communautaire", t
    assert ib.type_source("inconnu") == "secondaire"


def test_ligne_convertie_champs_vides_en_null():
    s = ib.vers_source(ligne(1, "officiel", pays="", langue=None, fiabilite="A"))
    assert s == {"url": "https://s1.example/", "type": "primaire", "joignabilite": "A", "langue": None, "pays": None, "sujets": ["ia"]}


def test_droit_5_2_editeur_de_la_base_devient_auteur_de_la_source():
    assert ib.vers_source(ligne(1, editeur=" Anthropic "))["auteur"] == "Anthropic"
    assert "auteur" not in ib.vers_source(ligne(1, editeur="")) and "auteur" not in ib.vers_source(ligne(1, editeur=None))
    vraies = [ib.vers_source(l) for l in ib.charger(ib.FICHIER)]
    assert all(1 <= len(s["auteur"]) <= 200 for s in vraies if "auteur" in s)


def test_paquets_de_200_et_idempotence():
    lignes = [ligne(i) for i in range(709)]
    faux = Faux()
    assert ib.importer(faux, "CID", lignes, a_blanc=False) == 709
    assert [len(a[2]["sources"]) for a in faux.appels] == [200, 200, 200, 109]
    instantane = dict(faux.base)
    ib.importer(faux, "CID", lignes, a_blanc=False)
    assert faux.base == instantane and len(faux.base) == 709


def test_a_blanc_n_ecrit_rien():
    faux = Faux()
    assert ib.importer(faux, "CID", [ligne(i) for i in range(3)], a_blanc=True) == 3
    assert faux.appels == []


def test_vraie_base_lisible_709_sources_conformes():
    lignes = ib.charger(ib.FICHIER)
    assert len(lignes) == 709
    sources = [ib.vers_source(l) for l in lignes]
    assert len({s["url"] for s in sources}) == 709
    assert all(s["type"] in ("primaire", "secondaire", "communautaire") and s["joignabilite"] in ("A", "B", "C") for s in sources)
    assert all(s["url"].startswith(("http://", "https://")) for s in sources)


def test_refus_3100_sans_production(capsys):
    assert ib.main(["--api", "http://127.0.0.1:3100/api"]) == 1
    assert "interdit sans --production" in capsys.readouterr().err
