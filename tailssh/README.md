# TailSSH

TailSSH is an internal SSH terminal helper used behind the authenticated jannserver gateway. The daemon listens on `127.0.0.1:9222` by default and should not be exposed directly.

## Setup

```bash
python3 -m venv .venv_tailssh
.venv_tailssh/bin/pip install -r tailssh/requirements.txt
cp tailssh/config.example.json tailssh/config.json
# edit tailssh/config.json with your own Tailscale hosts and SSH key paths
bash tailssh/run.sh
```

Environment overrides:

- `TAILSSH_VENV` — virtualenv path; defaults to `<repo>/.venv_tailssh`
- `TAILSSH_CONFIG` — config file; defaults to `tailssh/config.json`
- `TAILSSH_HOST` — listen host; defaults to config value or `127.0.0.1`
- `TAILSSH_PORT` — listen port; defaults to config value or `9222`

For systemd, copy `tailssh.service.example`, replace `YOUR_USER` and `/opt/jannserver`, then install the edited unit. Keep `config.json` local; it is ignored by Git because it contains host addresses, usernames, commands, and SSH-key paths.
