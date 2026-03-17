#!/usr/bin/env python3
"""
holehe_wrapper.py - Appelle holehe via son API Python (pas via le CLI)
et sort les résultats en JSON. Contourne le problème TTY.
Usage: python3 holehe_wrapper.py email@example.com [timeout] [no_pwd_recovery]
"""
import sys
import json
import trio
import httpx
from holehe.core import import_submodules, get_functions, launch_module

async def run_holehe(email, timeout=10, no_password_recovery=False):
    results = []

    # Charger tous les modules holehe
    import holehe.modules
    modules = import_submodules(holehe.modules)

    class FakeArgs:
        nopasswordrecovery = no_password_recovery

    websites = get_functions(modules, FakeArgs())

    out = []

    limits = httpx.Limits(max_connections=50, max_keepalive_connections=10)
    async with httpx.AsyncClient(
        verify=False,
        timeout=timeout,
        limits=limits
    ) as client:
        async with trio.open_nursery() as nursery:
            for website in websites:
                nursery.start_soon(launch_module, website, email, client, out)

    # Filtrer uniquement les sites où l'email est utilisé
    for entry in out:
        if entry.get("exists") is True:
            domain = entry.get("domain", "")
            name   = entry.get("name", domain)
            results.append({
                "platform": name,
                "url": f"https://{domain}" if domain else None
            })

    return results


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No email provided"}))
        sys.exit(1)

    email   = sys.argv[1]
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    no_pwd  = sys.argv[3].lower() == "true" if len(sys.argv) > 3 else False

    try:
        results = trio.run(run_holehe, email, timeout, no_pwd)
        print(json.dumps({"status": "success", "count": len(results), "links": results}))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e), "links": []}))


if __name__ == "__main__":
    main()
