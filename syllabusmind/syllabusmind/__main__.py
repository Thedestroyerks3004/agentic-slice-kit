"""python -m syllabusmind <serve|demo|replay RUN|doctor|build>"""
from __future__ import annotations

import sys


def free_port(port: int) -> None:
    """Stop a leftover Python process listening on `port`, so `serve` can always start."""
    import os, re, signal, subprocess
    pids: set[int] = set()
    if os.name == "nt":
        out = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True).stdout
        pids = {int(m.group(1)) for m in re.finditer(rf":{port}\s+\S+\s+LISTENING\s+(\d+)", out)}
    else:
        out = subprocess.run(["lsof", "-t", f"-iTCP:{port}", "-sTCP:LISTEN"], capture_output=True, text=True).stdout
        pids = {int(x) for x in out.split()}
    for pid in pids - {os.getpid()}:
        if os.name == "nt":
            name = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                                  capture_output=True, text=True).stdout.lower()
            if "python" not in name:
                print(f"port {port} is used by a non-Python process (pid {pid}); not touching it")
                continue
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
        else:
            os.kill(pid, signal.SIGTERM)
        print(f"closed the old server on port {port} (pid {pid})")


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "serve"
    if cmd == "doctor":
        from . import doctor
        return doctor.run()
    if cmd == "build":
        from .authoring import build
        for t in ("dbms", "dsa"):
            print(t, build.build(t).generated, "questions")
        return 0
    if cmd == "serve":
        import time, uvicorn
        free_port(8000)
        time.sleep(0.5)
        uvicorn.run("syllabusmind.web.student:app", host="127.0.0.1", port=8000)
        return 0
    if cmd == "replay":
        from slice.store import Store
        from . import config
        for v in Store(config.load().db).replay(argv[1]):
            print(v.seq, v.kind, v.produced_by, str(v.payload)[:110])
        return 0
    if cmd == "demo":                      # a scripted student on the stub: no key, no browser
        import tempfile, os
        from slice.store import Store
        from . import config, session_flow, simulate, stub
        os.environ.setdefault("SYLLABUS_MEMORY_DIR", tempfile.mkdtemp())
        store = Store(tempfile.mktemp(suffix=".db"))
        run = session_flow.start(store, "dbms")
        st = simulate.Student(beliefs=["index.index-always-faster", "concurrency.cycle-deadlock"], weak_nodes=["index"])
        simulate.play(store, run, session_flow.build_flow(stub.Stub()), config.load().spine, st)
        back = 0
        for v in store.replay(run):
            if v.kind == "action":
                print(f'{v.seq:>4} {v.payload["kind"]:<10} {v.payload["reason"]}')
                back += v.payload["kind"] == "step_down"
        print("\nwork went backwards" if back else "\nWARNING: nothing went backwards", f"({back} step-down)")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
