"""
Sube un builder de workflow al servidor y lo ejecuta.

Uso:
    python3 run_remote.py wf_quota.py

Variables de entorno:
    N8N_SSH_HOST   host del servidor (por defecto root@147.182.184.234)
    N8N_SSH_KEY    path a la clave ssh (por defecto ~/.ssh/id_rsa)
"""

import os
import subprocess
import sys

HOST = os.environ.get("N8N_SSH_HOST", "root@147.182.184.234")
KEY = os.environ.get("N8N_SSH_KEY", os.path.expanduser("~/.ssh/id_rsa"))
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))

SSH = ["ssh", "-i", KEY, "-o", "BatchMode=yes", HOST]
SCP = ["scp", "-i", KEY, "-o", "BatchMode=yes"]


def upload_and_run(local_py: str, remote_name: str) -> bool:
    here = os.path.dirname(os.path.abspath(local_py))
    for fname in ["n8nlib.py", local_py]:
        r = subprocess.run(
            SCP + [os.path.join(here, fname), "root@147.182.184.234:/tmp/%s" % fname],
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            print("ERROR subiendo %s: %s" % (fname, r.stderr[:500]))
            return False

    r = subprocess.run(SSH + ["cd /tmp && python3 %s" % remote_name],
                       capture_output=True, text=True)
    print(r.stdout)
    if r.stderr.strip():
        print("STDERR:", r.stderr[:2500])
    return r.returncode == 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    script = sys.argv[1]
    remote = sys.argv[2] if len(sys.argv) > 2 else script
    ok = upload_and_run(script, remote)
    sys.exit(0 if ok else 1)
