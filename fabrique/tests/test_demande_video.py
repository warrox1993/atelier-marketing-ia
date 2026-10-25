"""Tests de la validation de la demande vidéo (fonction pure, aucun GPU, aucune cage)."""

import copy

import pytest

from fabrique.demande_video import DemandeVideoInvalide, valider_demande_video


def scene(**surcharge):
    base = {"texte_voix": "Bonjour tout le monde.", "voix": "synthese-chatterbox-fr",
            "visuel": {"gabarit": "titre_plein_ecran", "champs": {"titre": "Bonjour"}}}
    base.update(surcharge)
    return base


def demande(**surcharge):
    base = {"format_sortie": "1080x1920", "sous_titres": True, "scenes": [scene()]}
    base.update(surcharge)
    return base


def test_demande_minimale_valide():
    v = valider_demande_video(demande())
    assert v.format_sortie == "1080x1920" and v.sous_titres is True and v.musique is None
    assert v.scenes[0].gabarit == "titre_plein_ecran" and v.scenes[0].duree_max_s is None


def test_demande_complete_valide():
    complete = demande(musique="fond-calme", scenes=[
        scene(duree_max=12),
        scene(visuel={"gabarit": "liste_3_points", "champs": {"titre": "T", "points": ["a", "b", "c"]}}),
        scene(visuel={"gabarit": "chiffre_cle", "champs": {"titre": "T", "chiffre": "42 %", "sous_titre": "s"}}),
    ])
    v = valider_demande_video(complete)
    assert len(v.scenes) == 3 and v.musique == "fond-calme" and v.scenes[0].duree_max_s == 12.0


def test_argument_non_modifie():
    d = demande(scenes=[scene(duree_max=5)])
    avant = copy.deepcopy(d)
    valider_demande_video(d)
    assert d == avant


@pytest.mark.parametrize("surcharge", [
    {"entreprise": "acme"},
    {"echantillon": "voix.wav"},
    {"extra": 1},
])
def test_champ_inconnu_de_demande_refuse(surcharge):
    with pytest.raises(DemandeVideoInvalide, match="champs inconnus"):
        valider_demande_video(demande(**surcharge))


@pytest.mark.parametrize("champ", ["format_sortie", "sous_titres", "scenes"])
def test_champ_obligatoire_absent(champ):
    d = demande()
    del d[champ]
    with pytest.raises(DemandeVideoInvalide, match="manquants"):
        valider_demande_video(d)


@pytest.mark.parametrize("valeur", ["640x480", "1080x1920 ", "", None, 1080, "../x"])
def test_format_refuse(valeur):
    with pytest.raises(DemandeVideoInvalide, match="format_sortie"):
        valider_demande_video(demande(format_sortie=valeur))


@pytest.mark.parametrize("valeur", ["oui", 1, None])
def test_sous_titres_booleen_strict(valeur):
    with pytest.raises(DemandeVideoInvalide, match="sous_titres"):
        valider_demande_video(demande(sous_titres=valeur))


@pytest.mark.parametrize("valeur", ["../x", "/etc/passwd", "Majuscule", "a", "", 3, "fond calme"])
def test_musique_refusee(valeur):
    with pytest.raises(DemandeVideoInvalide, match="musique"):
        valider_demande_video(demande(musique=valeur))


@pytest.mark.parametrize("scenes", [[], "texte", None, [scene()] * 31])
def test_nombre_de_scenes(scenes):
    with pytest.raises(DemandeVideoInvalide, match="scenes"):
        valider_demande_video(demande(scenes=scenes))


def test_trente_scenes_acceptees():
    assert len(valider_demande_video(demande(scenes=[scene()] * 30)).scenes) == 30


@pytest.mark.parametrize("voix", ["../x", "x/../y", "/voix/a.wav", "A", "", None, 5, "a.wav"])
def test_voix_evasion_refusee(voix):
    with pytest.raises(DemandeVideoInvalide, match="voix"):
        valider_demande_video(demande(scenes=[scene(voix=voix)]))


@pytest.mark.parametrize("gabarit", ["../../x", "inconnu", "", None, ["titre_plein_ecran"], "/etc/passwd"])
def test_gabarit_evasion_refuse(gabarit):
    with pytest.raises(DemandeVideoInvalide, match="gabarit"):
        valider_demande_video(demande(scenes=[scene(visuel={"gabarit": gabarit, "champs": {"titre": "x"}})]))


def test_champ_echantillon_refuse_dans_la_scene_et_le_visuel():
    with pytest.raises(DemandeVideoInvalide, match="champs inconnus"):
        valider_demande_video(demande(scenes=[scene(echantillon="a.wav")]))
    with pytest.raises(DemandeVideoInvalide, match="champs inconnus"):
        valider_demande_video(demande(scenes=[scene(visuel={
            "gabarit": "titre_plein_ecran", "champs": {"titre": "x"}, "echantillon": "a.wav"})]))
    with pytest.raises(DemandeVideoInvalide, match="champs"):
        valider_demande_video(demande(scenes=[scene(visuel={
            "gabarit": "titre_plein_ecran", "champs": {"titre": "x", "echantillon": "a.wav"}})]))


def test_entreprise_glissee_dans_une_scene_refusee():
    with pytest.raises(DemandeVideoInvalide, match="champs inconnus"):
        valider_demande_video(demande(scenes=[scene(entreprise="autre")]))


@pytest.mark.parametrize("texte", ["", "   ", None, 12, "a" * 1501, "x\x00y"])
def test_texte_voix_refuse(texte):
    with pytest.raises(DemandeVideoInvalide, match="texte_voix"):
        valider_demande_video(demande(scenes=[scene(texte_voix=texte)]))


def test_texte_voix_limite_acceptee():
    valider_demande_video(demande(scenes=[scene(texte_voix="a" * 1500)]))


@pytest.mark.parametrize("duree", [0.9, 61, 0, -3, True, "10", float("nan"), float("inf")])
def test_duree_max_refusee(duree):
    with pytest.raises(DemandeVideoInvalide, match="duree_max"):
        valider_demande_video(demande(scenes=[scene(duree_max=duree)]))


@pytest.mark.parametrize("duree", [1, 1.0, 30.5, 60])
def test_duree_max_acceptee(duree):
    valider_demande_video(demande(scenes=[scene(duree_max=duree)]))


def test_champs_du_gabarit_valides_comme_le_gabarit():
    with pytest.raises(DemandeVideoInvalide, match="manquants"):
        valider_demande_video(demande(scenes=[scene(visuel={"gabarit": "chiffre_cle", "champs": {"titre": "x"}})]))
    with pytest.raises(DemandeVideoInvalide, match="points"):
        valider_demande_video(demande(scenes=[scene(visuel={
            "gabarit": "liste_3_points", "champs": {"titre": "x", "points": ["a", "b"]}})]))


@pytest.mark.parametrize("brute", [None, [], "x", 3])
def test_demande_non_objet(brute):
    with pytest.raises(DemandeVideoInvalide):
        valider_demande_video(brute)


def test_scene_non_objet():
    with pytest.raises(DemandeVideoInvalide, match=r"scenes\[1\]"):
        valider_demande_video(demande(scenes=["x"]))
