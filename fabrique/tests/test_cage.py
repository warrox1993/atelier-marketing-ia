"""Tests du lanceur de cage : arguments (purs) et exécution réelle dans bwrap."""

import os
import shutil
import socket
import tempfile
import time
from pathlib import Path

import pytest

import subprocess

from fabrique.cage import Etape, construire_arguments, executer, recuperer_sortie
from fabrique.filtre_seccomp import APPELS_REFUSES, construire_filtre

BWRAP = shutil.which("bwrap")
needs_bwrap = pytest.mark.skipif(BWRAP is None, reason="bwrap absent")


def etape(tmp_path, type="cpu", programme="/usr/bin/true", arguments=(), **kw):
    entree = tmp_path / "entree"
    sortie = tmp_path / "sortie"
    entree.mkdir(exist_ok=True)
    sortie.mkdir(exist_ok=True)
    return Etape(type=type, programme=programme, arguments=tuple(arguments),
                 dossier_entree=str(entree), dossier_sortie=str(sortie), **kw)


def paire(args, option, a, b):
    return any(args[i:i + 3] == [option, a, b] for i in range(len(args)))


# ---------- arguments (fonction pure) ----------

def test_arguments_cpu(tmp_path):
    e = etape(tmp_path, arguments=["-x"])
    args = construire_arguments(e, existe=lambda _: False)
    assert args[0] == "prlimit"
    assert "--as=4294967296" in args and "--fsize=52428800" in args
    assert "--nofile=256" in args and "--nproc=128" in args
    assert any(a.startswith("--cpu=") for a in args)
    assert args[args.index("--") + 1] == "bwrap"
    for option in ("--unshare-all", "--die-with-parent", "--new-session", "--clearenv"):
        assert option in args
    assert paire(args, "--ro-bind", "/etc/fonts", "/etc/fonts")
    assert "/etc/libreoffice" not in args
    assert not any(a.startswith("/dev/nvidia") for a in args)
    assert "/opt/atelier-fabrique" not in args
    assert paire(args, "--ro-bind", e.dossier_entree, "/entree")
    assert paire(args, "--bind", e.dossier_sortie, "/sortie")
    assert "HF_HUB_OFFLINE" not in args
    assert args[-2:] == ["/usr/bin/true", "-x"]
    # nproc posée dans la cage (après bwrap), pas devant.
    assert args.index("--nproc=128") > args.index("bwrap")
    assert args[args.index("--chdir") + 1] == "/sortie"


def test_arguments_pdf_ajoute_libreoffice(tmp_path):
    args = construire_arguments(etape(tmp_path, type="pdf"), existe=lambda _: False)
    assert paire(args, "--ro-bind", "/etc/libreoffice", "/etc/libreoffice")
    assert "--as=4294967296" in args


def test_arguments_gpu(tmp_path):
    presents = {"/dev/nvidia0", "/dev/nvidiactl", "/dev/nvidia-uvm"}
    args = construire_arguments(etape(tmp_path, type="gpu"), existe=presents.__contains__)
    for p in presents:
        assert paire(args, "--dev-bind", p, p)
    assert "/dev/nvidia-uvm-tools" not in args  # absent : non monté
    assert "/etc/libreoffice" not in args
    assert not any(a.startswith("--as=") for a in args)


def test_arguments_racine_fabrique_hors_ligne_et_modeles(tmp_path):
    e = etape(tmp_path, hors_ligne=True, montages_modeles=(("/srv/modeles/x", "/modeles/x"),))
    args = construire_arguments(e, existe=lambda p: p == "/opt/atelier-fabrique")
    assert paire(args, "--ro-bind", "/opt/atelier-fabrique", "/opt/atelier-fabrique")
    assert paire(args, "--ro-bind", "/srv/modeles/x", "/modeles/x")
    assert paire(args, "--setenv", "HF_HUB_OFFLINE", "1")
    assert paire(args, "--setenv", "TRANSFORMERS_OFFLINE", "1")
    assert paire(args, "--setenv", "PATH", "/usr/bin:/opt/atelier-fabrique/bin")


def test_fsize_parametrable(tmp_path):
    args = construire_arguments(etape(tmp_path), fsize_octets=500 * 1024**2)
    assert "--fsize=524288000" in args


@pytest.mark.parametrize("modif", [
    {"programme": "usr/bin/true"},
    {"programme": "/usr/bin/../bin/true"},
    {"programme": "/usr/bin/tr\0ue"},
    {"dossier_entree": "entree"},
    {"dossier_sortie": "/tmp/../etc"},
    {"montages_modeles": (("modeles/x", "/modeles/x"),)},
    {"montages_modeles": (("/srv/x", "/../modeles"),)},
    {"arguments": ("ok", "mauvais\0octet")},
    {"type": "inconnu"},
])
def test_refus_valeurs_piegees(tmp_path, modif):
    base = etape(tmp_path)
    champs = {**base.__dict__, **modif}
    with pytest.raises(ValueError):
        construire_arguments(Etape(**champs))


# ---------- exécution réelle ----------

def survivants(marqueur: bytes) -> list[int]:
    pids = []
    for entree in Path("/proc").iterdir():
        if entree.name.isdigit():
            try:
                if marqueur in (entree / "cmdline").read_bytes():
                    pids.append(int(entree.name))
            except OSError:
                pass
    return pids


@needs_bwrap
def test_delai_depasse_tue_tout_le_groupe(tmp_path):
    e = etape(tmp_path, programme="/usr/bin/sh", arguments=["-c", "sleep 37 & sleep 38"])
    debut = time.monotonic()
    r = dans_cage(e, delai_s=1)
    assert r.delai_depasse
    assert time.monotonic() - debut < 3
    time.sleep(0.3)
    assert survivants(b"sleep\x0037") == [] and survivants(b"sleep\x0038") == []


@needs_bwrap
def test_execution_normale_rend_sortie(tmp_path):
    r = dans_cage(etape(tmp_path, programme="/usr/bin/echo", arguments=["bonjour"]), delai_s=20)
    assert r.code == 0 and not r.delai_depasse
    assert r.sortie == b"bonjour\n"


@needs_bwrap
def test_sortie_tronquee_a_64_kio(tmp_path):
    e = etape(tmp_path, programme="/usr/bin/head", arguments=["-c", "300000", "/dev/zero"])
    r = dans_cage(e, delai_s=20)
    assert len(r.sortie) == 64 * 1024


@needs_bwrap
def test_fsize_coupe_une_ecriture_trop_grosse(tmp_path):
    e = etape(tmp_path, programme="/usr/bin/sh",
              arguments=["-c", "head -c 2000000 /dev/zero > /sortie/gros"])
    r = dans_cage(e, delai_s=20, fsize_octets=1024 * 1024)
    assert r.code != 0
    assert (tmp_path / "sortie" / "gros").stat().st_size <= 1024 * 1024


def dans_cage(e, delai_s=20, **options):
    """Exécute et vérifie que la cage elle-même a démarré (un échec de bwrap ne prouve rien)."""
    r = executer(e, delai_s=delai_s, **options)
    assert b"bwrap:" not in r.erreur, r.erreur
    return r


# ---------- évasion : tout doit échouer dans la cage ----------

@needs_bwrap
def test_limite_processus_effective(tmp_path):
    code = (
        "import os, signal, sys\n"
        "n = 0\n"
        "try:\n"
        "    while n < 300:\n"
        "        if os.fork() == 0:\n"
        "            signal.pause()\n"
        "        n += 1\n"
        "except OSError:\n"
        "    pass\n"
        "print(n); sys.stdout.flush()\n"
        "os.kill(0, signal.SIGKILL)\n"
    )
    r = dans_cage(etape(tmp_path, programme="/usr/bin/python3", arguments=["-c", code]), delai_s=20)
    assert 0 < int(r.sortie.strip()) < 300  # le fork a été refusé avant 300


@needs_bwrap
def test_evasion_secret_sous_home_illisible(tmp_path):
    dossier = Path(tempfile.mkdtemp(dir=Path.home(), prefix=".cage-test-"))
    try:
        secret = dossier / "secret.txt"
        secret.write_text("SECRET-FACTICE")
        r = dans_cage(etape(tmp_path, programme="/usr/bin/cat", arguments=[str(secret)]), delai_s=20)
        assert r.code != 0 and b"SECRET-FACTICE" not in r.sortie
    finally:
        shutil.rmtree(dossier, ignore_errors=True)


@needs_bwrap
def test_evasion_home_absent(tmp_path):
    r = dans_cage(etape(tmp_path, programme="/usr/bin/ls", arguments=["/home"]), delai_s=20)
    assert r.sortie.strip() == b"" or r.code != 0


@needs_bwrap
def test_evasion_reseau_coupe(tmp_path):
    ecoute = socket.socket()
    ecoute.bind(("127.0.0.1", 0))
    ecoute.listen(1)
    port = ecoute.getsockname()[1]
    code = f"import socket; socket.create_connection(('127.0.0.1', {port}), 3)"
    try:
        r = dans_cage(etape(tmp_path, programme="/usr/bin/python3", arguments=["-c", code]), delai_s=20)
        assert r.code != 0, "la connexion TCP aurait dû échouer dans la cage"
        # Même test sur le port du serveur Paperclip.
        code = "import socket; socket.create_connection(('127.0.0.1', 3100), 3)"
        r = dans_cage(etape(tmp_path, programme="/usr/bin/python3", arguments=["-c", code]), delai_s=20)
        assert r.code != 0
    finally:
        ecoute.close()


@needs_bwrap
def test_evasion_environnement_nettoye(tmp_path, monkeypatch):
    monkeypatch.setenv("PAPERCLIP_API_KEY", "factice")
    r = dans_cage(etape(tmp_path, programme="/usr/bin/env"), delai_s=20)
    assert r.code == 0
    assert b"PAPERCLIP_API_KEY" not in r.sortie and b"factice" not in r.sortie
    assert b"HOME=/tmp" in r.sortie


@needs_bwrap
@pytest.mark.parametrize("cible", ["/entree/intrus", "/usr/intrus"])
def test_evasion_ecriture_hors_sortie_refusee(tmp_path, cible):
    r = dans_cage(etape(tmp_path, programme="/usr/bin/touch", arguments=[cible]), delai_s=20)
    assert r.code != 0
    assert not (tmp_path / "entree" / "intrus").exists()


# ---------- récupération de la sortie ----------

def test_recuperer_sortie_filtre(tmp_path):
    secret = tmp_path / "secret"
    secret.write_text("x")
    sortie = tmp_path / "sortie"
    sortie.mkdir()
    (sortie / "rapport.pdf").write_text("ok")
    (sortie / "piege.pdf").symlink_to(secret)
    (sortie / "autre.txt").write_text("non attendu")
    os.mkfifo(sortie / "tube.pdf")
    res = recuperer_sortie(sortie, ["rapport.pdf", "piege.pdf", "tube.pdf", "absent.pdf"])
    assert res == [sortie / "rapport.pdf"]


@pytest.mark.parametrize("nom", ["../secret", "a/b", "..", ""])
def test_recuperer_sortie_refuse_noms_hors_dossier(tmp_path, nom):
    with pytest.raises(ValueError):
        recuperer_sortie(tmp_path, [nom])


# ---------- durcissement : espaces de noms imbriqués et appels système (M2 de la revue du 24/10) ----------

def test_arguments_durcissement(tmp_path):
    args = construire_arguments(etape(tmp_path), existe=lambda _: False, fd_seccomp=7)
    assert "--disable-userns" in args
    assert paire(args, "--seccomp", "7", "--chdir") or args[args.index("--seccomp") + 1] == "7"
    assert args.index("--seccomp") < args.index("--chdir")


def test_filtre_est_un_programme_bpf_valide():
    filtre = construire_filtre()
    assert len(filtre) % 8 == 0 and 0 < len(filtre) // 8 <= 4096
    # Une instruction de comparaison par appel refusé, plus 5 d'en-tête et 2 de retour.
    assert len(filtre) // 8 == 5 + len(set(APPELS_REFUSES.values())) + 2
    noms = {"ptrace", "process_vm_readv", "process_vm_writev", "kexec_load", "kexec_file_load",
            "init_module", "finit_module", "delete_module", "bpf", "perf_event_open", "userfaultfd",
            "keyctl", "add_key", "request_key", "mount", "umount2", "pivot_root", "unshare", "setns",
            "iopl", "ioperm", "swapon", "swapoff", "reboot", "open_by_handle_at"}
    assert noms <= set(APPELS_REFUSES)


# Appelle un appel système par son numéro et imprime « <valeur de retour> <errno> ».
SONDE_APPEL = (
    "import ctypes, sys\n"
    "libc = ctypes.CDLL(None, use_errno=True)\n"
    "args = [ctypes.c_long(int(a)) for a in sys.argv[2:]]\n"
    "r = libc.syscall(ctypes.c_long(int(sys.argv[1])), *args)\n"
    "print(r, ctypes.get_errno())\n"
)


@needs_bwrap
@pytest.mark.parametrize("nom,arguments", [
    ("ptrace", [0]),                      # PTRACE_TRACEME : réussit (0) hors filtre
    ("process_vm_readv", [1, 0, 0, 0, 0, 0]),  # 0 vecteur : renvoie 0 hors filtre
    ("userfaultfd", [0]),
    ("bpf", [5, 0, 0]),
    ("keyctl", [0]),
    ("perf_event_open", [0, 0, 0, 0, 0]),
])
def test_appel_refuse_par_seccomp_dans_la_cage(tmp_path, nom, arguments):
    numero = APPELS_REFUSES[nom]
    commande = ["/usr/bin/python3", "-c", SONDE_APPEL, str(numero), *map(str, arguments)]
    e = etape(tmp_path, programme=commande[0], arguments=commande[1:])
    r = dans_cage(e)
    assert r.sortie.split() == [b"-1", b"1"], (nom, r.sortie, r.erreur)  # -1, EPERM


@needs_bwrap
def test_temoin_sans_filtre_ptrace_reussit(tmp_path):
    """Témoin : sans filtre, le même appel ptrace(TRACEME) réussit, donc le test ci-dessus prouve bien le filtre."""
    e = etape(tmp_path, programme="/usr/bin/python3",
              arguments=["-c", SONDE_APPEL, str(APPELS_REFUSES["ptrace"]), "0"])
    commande = construire_arguments(e, fd_seccomp=None)
    assert "--seccomp" not in commande
    r = subprocess.run(commande, capture_output=True, timeout=30)
    assert b"bwrap:" not in r.stderr, r.stderr
    assert r.stdout.split() == [b"0", b"0"], (r.stdout, r.stderr)


@needs_bwrap
def test_unshare_utilisateur_echoue_dans_la_cage(tmp_path):
    r = dans_cage(etape(tmp_path, programme="/usr/bin/unshare", arguments=["-U", "/usr/bin/true"]))
    assert r.code != 0, "unshare -U aurait dû échouer dans la cage"


@needs_bwrap
def test_temoin_unshare_utilisateur_reussit_sans_durcissement(tmp_path):
    """Témoin : une cage nue (sans --disable-userns ni seccomp) laisse unshare -U réussir."""
    nue = [BWRAP, "--unshare-all", "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib", "/lib",
           "--symlink", "usr/lib64", "/lib64", "--symlink", "usr/bin", "/bin", "--proc", "/proc",
           "--", "/usr/bin/unshare", "-U", "/usr/bin/true"]
    r = subprocess.run(nue, capture_output=True, timeout=30)
    assert r.returncode == 0, r.stderr


@needs_bwrap
def test_usage_normal_inchange_apres_durcissement(tmp_path):
    r = dans_cage(etape(tmp_path, programme="/usr/bin/python3",
                        arguments=["-c", "import subprocess,sys; print(sum(range(10)));"
                                   "subprocess.run(['/usr/bin/true'], check=True)"]))
    assert r.code == 0 and r.sortie.strip() == b"45", (r.sortie, r.erreur)
