"""Filtre seccomp de la cage : liste noire d'appels système, en BPF classique, sans dépendance.

Pourquoi ce choix : le filtre est construit ici, en bibliothèque standard, plutôt qu'avec le paquet
Python « seccomp » (libseccomp) ou un fichier BPF précompilé. L'installateur ne copie que les
fichiers .py et .json de fabrique/ : un module Python voyage donc tout seul, sans paquet apt
supplémentaire côté service, et sans binaire opaque à versionner. Le programme est court (une
trentaine d'instructions), déterministe, et son effet réel est prouvé dans la cage par
fabrique/tests/test_cage.py.

Comportement : architecture autre que x86-64 -> le processus est tué (le filtre ne couvre que les
numéros x86-64) ; ABI x32 (bit 0x40000000), qui contournerait la liste -> EPERM ; appel listé
-> EPERM ; tout le reste -> autorisé. Le filtre est chargé par bwrap (--seccomp FD) juste avant
l'exécution du programme de l'étape : bwrap a déjà monté la cage, seuls le programme et ses fils
sont filtrés.
"""

from __future__ import annotations

import platform
import struct

EPERM = 1
AUDIT_ARCH_X86_64 = 0xC000003E
BIT_X32 = 0x40000000

SECCOMP_RET_KILL_PROCESS = 0x80000000
SECCOMP_RET_ALLOW = 0x7FFF0000
SECCOMP_RET_ERRNO = 0x00050000

# Codes BPF classiques (linux/filter.h).
_LD_W_ABS = 0x20
_JEQ_K = 0x15
_JSET_K = 0x45
_RET_K = 0x06
_OFFSET_NR = 0
_OFFSET_ARCH = 4

# Appels refusés (numéros x86-64, linux/arch/x86/entry/syscalls/syscall_64.tbl).
APPELS_REFUSES: dict[str, int] = {
    "ptrace": 101,
    "process_vm_readv": 310,
    "process_vm_writev": 311,
    "kexec_load": 246,
    "kexec_file_load": 320,
    "init_module": 175,
    "finit_module": 313,
    "delete_module": 176,
    "bpf": 321,
    "perf_event_open": 298,
    "userfaultfd": 323,
    "keyctl": 250,
    "add_key": 248,
    "request_key": 249,
    "mount": 165,
    "umount2": 166,
    "pivot_root": 155,
    "unshare": 272,
    "setns": 308,
    "iopl": 172,
    "ioperm": 173,
    "swapon": 167,
    "swapoff": 168,
    "reboot": 169,
    "open_by_handle_at": 304,
    # Nouvelle API de montage : même risque que mount.
    "open_tree": 428,
    "move_mount": 429,
    "fsopen": 430,
    "fsconfig": 431,
    "fsmount": 432,
    "fspick": 433,
    "mount_setattr": 442,
}


def _instruction(code: int, jt: int, jf: int, k: int) -> bytes:
    return struct.pack("=HBBI", code, jt, jf, k)


def construire_filtre() -> bytes:
    """Rend le programme BPF (suite de struct sock_filter) à passer à bwrap --seccomp."""
    if platform.machine() != "x86_64":
        raise RuntimeError(f"filtre seccomp prévu pour x86-64 seulement (machine : {platform.machine()})")
    numeros = sorted(set(APPELS_REFUSES.values()))
    # Disposition : 0 ld arch | 1 jeq arch | 2 kill | 3 ld nr | 4 jset x32 | 5.. jeq par appel |
    # autoriser | refuser (EPERM).
    premier_test = 5
    indice_autoriser = premier_test + len(numeros)
    indice_refuser = indice_autoriser + 1
    programme = [
        _instruction(_LD_W_ABS, 0, 0, _OFFSET_ARCH),
        _instruction(_JEQ_K, 1, 0, AUDIT_ARCH_X86_64),
        _instruction(_RET_K, 0, 0, SECCOMP_RET_KILL_PROCESS),
        _instruction(_LD_W_ABS, 0, 0, _OFFSET_NR),
        _instruction(_JSET_K, indice_refuser - 4 - 1, 0, BIT_X32),
    ]
    for position, numero in enumerate(numeros):
        courant = premier_test + position
        saut = indice_refuser - courant - 1
        if saut > 255:
            raise RuntimeError("saut BPF trop long")
        programme.append(_instruction(_JEQ_K, saut, 0, numero))
    programme.append(_instruction(_RET_K, 0, 0, SECCOMP_RET_ALLOW))
    programme.append(_instruction(_RET_K, 0, 0, SECCOMP_RET_ERRNO | EPERM))
    return b"".join(programme)
