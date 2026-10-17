#!/usr/bin/env python3
"""Lance Arize Phoenix (serveur de traces local de l'atelier) en n'écoutant QUE sur 127.0.0.1.

Pourquoi ce lanceur : PHOENIX_HOST règle l'adresse de l'interface web et du collecteur OTLP HTTP, mais le
collecteur OTLP gRPC de Phoenix s'ouvre en dur sur « [::]:<port> » (toutes les interfaces), voir
phoenix/server/grpc_server.py (add_insecure_port / add_secure_port) dans arize-phoenix 20.23.0, et il ne peut
être coupé qu'en mode lecture seule, qui coupe aussi la réception des traces. Les filtres IP de systemd
(IPAddressDeny) ne s'appliquent pas aux unités utilisateur (essai du 17/10/2026 : connexion externe passée).
Le lanceur remplace donc, avant le démarrage, l'adresse « [::] » des ports gRPC par 127.0.0.1, puis appelle le
point d'entrée officiel « phoenix serve ». Si la bibliothèque grpc change de forme, le lanceur refuse de démarrer
plutôt que d'écouter sur toutes les interfaces.

À exécuter avec l'interpréteur du venv Phoenix (voir scripts/systemd/atelier-phoenix.service) :
    <venv>/bin/python -I scripts/phoenix-lancer.py
"""
import os
import sys

HOTE = "127.0.0.1"


def restreindre_grpc() -> None:
    try:
        from grpc.aio import _server as serveur_grpc
    except ImportError as e:  # pragma: no cover - dépend de l'installation
        sys.exit(f"phoenix-lancer : module grpc.aio introuvable ({e}) ; démarrage refusé")
    classe = getattr(serveur_grpc, "Server", None)
    if classe is None or not hasattr(classe, "add_insecure_port") or not hasattr(classe, "add_secure_port"):
        sys.exit("phoenix-lancer : grpc.aio.Server a changé de forme ; démarrage refusé (risque d'écoute sur toutes les interfaces)")

    def local(adresse: str) -> str:
        hote, sep, port = adresse.rpartition(":")
        if not sep or not port.isdigit():
            sys.exit(f"phoenix-lancer : adresse gRPC inattendue « {adresse} » ; démarrage refusé")
        if hote not in ("[::]", "0.0.0.0", "", HOTE, "localhost", "[::1]"):
            sys.exit(f"phoenix-lancer : hôte gRPC inattendu « {hote} » ; démarrage refusé")
        return f"{HOTE}:{port}"

    origine_clair, origine_tls = classe.add_insecure_port, classe.add_secure_port

    def add_insecure_port(self, address):  # noqa: ANN001 - signature de grpc
        return origine_clair(self, local(address))

    def add_secure_port(self, address, server_credentials):  # noqa: ANN001 - signature de grpc
        return origine_tls(self, local(address), server_credentials)

    classe.add_insecure_port = add_insecure_port
    classe.add_secure_port = add_secure_port


def main() -> None:
    hote = os.environ.get("PHOENIX_HOST", "")
    if hote != HOTE:
        sys.exit(f"phoenix-lancer : PHOENIX_HOST doit valoir {HOTE} (reçu « {hote} ») ; démarrage refusé")
    restreindre_grpc()
    from phoenix.server.main import main as phoenix_main

    sys.argv = ["phoenix", "serve"]
    phoenix_main()


if __name__ == "__main__":
    main()
