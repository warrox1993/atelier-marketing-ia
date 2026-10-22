"""
Modélise les pièces 3D de la frise d'avancement des missions et les exporte en glTF binaire.

Pièces (noms repris tels quels par la scène three.js, `src/ui/frise3d/scene.ts`) :
  - Station_strategie, Station_production, Station_coordonnees, Station_revue, Station_controles, Station_reponse :
    six socles aux arêtes adoucies (bevel), posés sur la piste (origine au pied du socle, hauteur de référence 0,34 :
    la scène l'étire selon l'état de la phase) ;
  - Piste : la dalle sur laquelle sont posées les stations (face supérieure à y = 0) ;
  - Volume : le petit cube qui avance jusqu'à la phase en cours (origine au centre) ;
  - Anneau : l'anneau posé autour d'un socle qui attend une décision (origine au centre).

Les matériaux sont PBR et sobres, en blanc : AUCUNE couleur d'état ici. La couleur d'état (faite, en cours, attend votre
décision...) est appliquée par three.js à l'exécution, depuis les jetons de l'interface (thème clair ou sombre).

Dimensions en unités de la scène (1 unité = 1 mètre de Blender) ; l'axe haut est Z dans Blender, Y dans le glTF
(conversion faite par l'exporteur), le devant de la piste est -Y dans Blender (+Z dans le glTF).

Usage, sans fenêtre (Blender 5.2 LTS) :
  blender --background --factory-startup --python scripts/blender/frise-stations.py
  blender --background --factory-startup --python scripts/blender/frise-stations.py -- --rendu /chemin/rendu.png
Options après `--` : --glb <fichier de sortie> (défaut : src/ui/assets/frise-stations.glb), --rendu <png de contrôle>.
Poids visé : 200 Ko au plus (le script échoue au-delà). Pas de compression Draco : le décodeur de three est un module
WebAssembly en plus, bien plus lourd que ce que la compression économiserait sur un fichier de quelques dizaines de Ko.
"""
import math
import os
import sys

import bpy

IDS = ["strategie", "production", "coordonnees", "revue", "controles", "reponse"]
ESPACEMENT = 2.2  # doit rester égal à ESPACEMENT de src/ui/frise3d/logique.ts
HAUTEUR_REF = 0.34
EMPREINTE = (1.3, 0.8)
POIDS_MAX = 200 * 1024


def arguments():
    brut = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    sortie = {"glb": None, "rendu": None}
    i = 0
    while i < len(brut):
        if brut[i] in ("--glb", "--rendu") and i + 1 < len(brut):
            sortie[brut[i][2:]] = brut[i + 1]
            i += 2
        else:
            i += 1
    if sortie["glb"] is None:
        racine = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        sortie["glb"] = os.path.join(racine, "src", "ui", "assets", "frise-stations.glb")
    return sortie


def matiere(nom, rugosite):
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    p.inputs["Roughness"].default_value = rugosite
    p.inputs["Metallic"].default_value = 0.0
    return m


def boite(nom, largeur, profondeur, hauteur, rayon, segments, mat, pied=True):
    """Boîte aux arêtes adoucies ; origine au pied (pied=True) ou au centre."""
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    o = bpy.context.active_object
    o.name = nom
    o.data.name = nom
    o.scale = (largeur, profondeur, hauteur)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = o.modifiers.new("Bevel", "BEVEL")
    mod.width = rayon
    mod.segments = segments
    mod.limit_method = "NONE"
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if pied:
        # Origine au pied : on remonte la géométrie de h/2 puis on la fixe.
        for v in o.data.vertices:
            v.co.z += hauteur / 2
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    o.data.materials.append(mat)
    return o


def construire():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat_socle = matiere("Matiere_Socle", 0.9)
    mat_piste = matiere("Matiere_Piste", 0.95)
    mat_volume = matiere("Matiere_Volume", 0.7)
    mat_anneau = matiere("Matiere_Anneau", 0.8)

    largeur_piste = len(IDS) * ESPACEMENT - 0.2
    piste = boite("Piste", largeur_piste, 1.7, 0.1, 0.035, 3, mat_piste)
    piste.location.z = -0.1  # face supérieure à z = 0

    modele = boite("Station_strategie", EMPREINTE[0], EMPREINTE[1], HAUTEUR_REF, 0.045, 3, mat_socle)
    stations = [modele]
    for ident in IDS[1:]:
        copie = modele.copy()  # données partagées : une seule maille dans le fichier
        copie.name = f"Station_{ident}"
        bpy.context.collection.objects.link(copie)
        stations.append(copie)
    for i, s in enumerate(stations):
        s.location.x = (i - (len(IDS) - 1) / 2) * ESPACEMENT

    volume = boite("Volume", 0.3, 0.3, 0.3, 0.04, 3, mat_volume, pied=False)
    volume.rotation_euler.z = math.pi / 4
    volume.location = (stations[0].location.x, -0.72, 0.17)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.66, minor_radius=0.03, major_segments=56, minor_segments=8)
    anneau = bpy.context.active_object
    anneau.name = "Anneau"
    anneau.data.name = "Anneau"
    anneau.data.materials.append(mat_anneau)
    bpy.ops.object.shade_smooth()
    anneau.location = (stations[4].location.x, 0.0, 0.04)
    return piste, stations, volume, anneau


def exporter(chemin):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=chemin,
        export_format="GLB",
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_draco_mesh_compression_enable=False,
    )
    taille = os.path.getsize(chemin)
    print(f"GLB écrit : {chemin} ({taille} octets)")
    if taille > POIDS_MAX:
        raise SystemExit(f"GLB trop lourd : {taille} octets (maximum {POIDS_MAX})")


def rendre(chemin):
    """Rendu de contrôle (EEVEE, petite taille) : états d'exemple colorés pour la seule image, hors du fichier exporté."""
    couleurs = {"strategie": (0.55, 0.57, 0.6), "production": (0.07, 0.3, 0.17), "coordonnees": (0.07, 0.3, 0.17),
                "revue": (0.07, 0.3, 0.17), "controles": (0.55, 0.32, 0.02), "reponse": (0.55, 0.57, 0.6)}
    hauteurs = {"strategie": 0.04, "production": 0.24, "coordonnees": 0.24, "revue": 0.24, "controles": 0.46, "reponse": 0.1}
    for ident in IDS:
        o = bpy.data.objects[f"Station_{ident}"]
        m = o.active_material.copy()
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*couleurs[ident], 1.0)
        o.data = o.data.copy()
        o.data.materials.clear()
        o.data.materials.append(m)
        o.scale.z = hauteurs[ident] / HAUTEUR_REF
    bpy.data.objects["Anneau"].active_material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.32, 0.02, 1.0)
    bpy.data.objects["Piste"].active_material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.84, 0.84, 0.85, 1.0)
    bpy.data.objects["Volume"].active_material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.12, 0.12, 0.13, 1.0)
    bpy.data.objects["Volume"].location.x = bpy.data.objects["Station_controles"].location.x

    scene = bpy.context.scene
    soleil = bpy.data.objects.new("Soleil", bpy.data.lights.new("Soleil", "SUN"))
    soleil.data.energy = 3.0
    soleil.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
    scene.collection.objects.link(soleil)
    scene.world = bpy.data.worlds.new("Ciel")
    scene.world.use_nodes = True
    fond = scene.world.node_tree.nodes["Background"]
    fond.inputs["Color"].default_value = (1, 1, 1, 1)
    fond.inputs["Strength"].default_value = 0.8

    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 13.6
    pitch = math.radians(28)
    cam.location = (0, -14 * math.cos(pitch), 0.36 + 14 * math.sin(pitch))
    cam.rotation_euler = (math.pi / 2 - pitch, 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 128
    scene.render.film_transparent = False
    scene.render.filepath = chemin
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print(f"Rendu de contrôle écrit : {chemin}")


args = arguments()
construire()
exporter(args["glb"])
if args["rendu"]:
    rendre(args["rendu"])
