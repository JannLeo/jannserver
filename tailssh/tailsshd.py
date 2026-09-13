"""
tailsshd — Tailscale SSH 连接管理守护进程

在同一 Web 界面管理多台 Tailscale 节点，
支持自动执行预设命令（如启动 hermes）、断线重连、持久化运行。
"""
from __future__ import annotations

import asyncio
import json
import os
import signal
import subprocess
import sys
import time
import shlex
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CONFIG_PATH = Path(__file__).parent / "config.json"
SESSIONS_DIR = Path(__file__).parent / "sessions"

@dataclass
class HostConfig:
    id: str
    name: str
    tailscale_ip: str
    user: str = "root"
    port: int = 22
    key_file: str = "~/.ssh/id_ed25519"
    auto_cmd: str = ""
    reconnect: bool = True
    reconnect_interval: int = 10
    enabled: bool = True

    @classmethod
    def from_dict(cls, d: dict) -> "HostConfig":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    def to_dict(self) -> dict:
        return {k: getattr(self, k) for k in self.__dataclass_fields__}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {"listen_host": "0.0.0.0", "listen_port": 9222, "hosts": []}


def save_config(cfg: dict):
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))


# ---------------------------------------------------------------------------
# SSH Session
# ---------------------------------------------------------------------------

@dataclass
class SSHSession:
    host_id: str
    config: HostConfig
    process: Optional[asyncio.subprocess.Process] = None
    reader: Optional[asyncio.StreamReader] = None
    writer: Optional[asyncio.StreamWriter] = None
    connected: bool = False
    reconnect_task: Optional[asyncio.Task] = None
    ws_clients: set = field(default_factory=set)
    stdout_buf: asyncio.Queue = field(default_factory=asyncio.Queue)
    stderr_buf: asyncio.Queue = field(default_factory=asyncio.Queue)
    _stop_event: asyncio.Event = field(default_factory=asyncio.Event)

    def ssh_cmd(self) -> list[str]:
        key = os.path.expanduser(self.config.key_file)
        return [
            "ssh",
            "-tt",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ServerAliveInterval=15",
            "-o", "ServerAliveCountMax=3",
            "-o", "LogLevel=ERROR",
            "-i", key,
            "-p", str(self.config.port),
            f"{self.config.user}@{self.config.tailscale_ip}",
        ]


# ---------------------------------------------------------------------------
# Session Manager
# ---------------------------------------------------------------------------

class SessionManager:
    def __init__(self, config: dict):
        self.config = config
        self.hosts: dict[str, HostConfig] = {}
        self.sessions: dict[str, SSHSession] = {}
        self._lock = asyncio.Lock()

        for h in config.get("hosts", []):
            hc = HostConfig.from_dict(h)
            self.hosts[hc.id] = hc

    async def start_all(self):
        for hc in self.hosts.values():
            if hc.enabled:
                await self.start_session(hc.id)

    async def start_session(self, host_id: str):
        hc = self.hosts.get(host_id)
        if not hc:
            return
        if host_id in self.sessions and self.sessions[host_id].connected:
            return

        session = SSHSession(host_id=host_id, config=hc)
        self.sessions[host_id] = session
        session.reconnect_task = asyncio.create_task(self._run_session(session))

    async def _run_session(self, session: SSHSession):
        while not session._stop_event.is_set():
            try:
                cmd = session.ssh_cmd()
                session.process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                session.connected = True
                await self._broadcast_status(session.host_id, "connected")

                # Start reading stdout & stderr concurrently
                read_stdout = asyncio.create_task(self._read_pipe(session, session.process.stdout, "output"))
                read_stderr = asyncio.create_task(self._read_pipe(session, session.process.stderr, "output"))

                # If auto_cmd is set, send it after subprocess starts
                if session.config.auto_cmd:
                    auto = session.config.auto_cmd.strip()
                    if auto:
                        session.process.stdin.write((auto + "\n").encode())
                        await session.process.stdin.drain()

                try:
                    await session.process.wait()
                finally:
                    read_stdout.cancel()
                    read_stderr.cancel()
                    session.connected = False
                    await self._broadcast_status(session.host_id, "disconnected")

            except Exception as e:
                await self._broadcast_status(session.host_id, f"error: {e}")

            if session._stop_event.is_set() or not session.config.reconnect:
                break

            # Reconnect delay — show a message to the user
            await self._broadcast_status(session.host_id, f"reconnecting in {session.config.reconnect_interval}s")
            try:
                await asyncio.wait_for(
                    self._wait_for_stop_or_timeout(session.config.reconnect_interval),
                    timeout=None,
                )
            except asyncio.TimeoutError:
                continue

    async def _wait_for_stop_or_timeout(self, timeout: int):
        try:
            await asyncio.wait_for(
                asyncio.get_event_loop().create_future(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            pass

    async def _read_pipe(self, session: SSHSession, stream: asyncio.StreamReader, tag: str):
        """Read from a pipe by chunks (not line-buffered) so prompts arrive immediately."""
        try:
            while True:
                chunk = await stream.read(4096)
                if not chunk:
                    break
                data = chunk.decode(errors="replace")
                if not data.strip():
                    continue
                msg = json.dumps({"type": tag, "data": data})
                for ws in list(session.ws_clients):
                    try:
                        await ws.put(msg)
                    except Exception:
                        session.ws_clients.discard(ws)
        except asyncio.CancelledError:
            pass

    async def stop_session(self, host_id: str):
        session = self.sessions.get(host_id)
        if session:
            session._stop_event.set()
            if session.process and session.process.returncode is None:
                session.process.send_signal(signal.SIGTERM)
            if session.reconnect_task:
                session.reconnect_task.cancel()

    async def write_stdin(self, host_id: str, data: str):
        session = self.sessions.get(host_id)
        if session and session.process and session.process.stdin:
            session.process.stdin.write(data.encode())
            await session.process.stdin.drain()

    async def _broadcast_status(self, host_id: str, status: str):
        msg = json.dumps({"type": "status", "status": status})
        session = self.sessions.get(host_id)
        if session:
            for ws in list(session.ws_clients):
                try:
                    await ws.put(msg)
                except Exception:
                    session.ws_clients.discard(ws)

        # Also push human-readable status to terminal output
        if status == "connected":
            term_msg = "\r\n\x1b[32m[已连接]\x1b[0m\r\n"
        elif status == "disconnected":
            term_msg = "\r\n\x1b[31m[连接已断开]\x1b[0m\r\n"
        elif status.startswith("reconnecting"):
            term_msg = f"\r\n\x1b[33m[{status}]\x1b[0m\r\n"
        elif status.startswith("error"):
            term_msg = f"\r\n\x1b[31m[{status}]\x1b[0m\r\n"
        else:
            return

        out_msg = json.dumps({"type": "output", "data": term_msg})
        if session:
            for ws in list(session.ws_clients):
                try:
                    await ws.put(out_msg)
                except Exception:
                    session.ws_clients.discard(ws)

    def add_host(self, hc: HostConfig):
        self.hosts[hc.id] = hc
        self._persist()

    def remove_host(self, host_id: str):
        self.hosts.pop(host_id, None)
        self.sessions.pop(host_id, None)
        self._persist()

    def update_host(self, host_id: str, data: dict):
        if host_id in self.hosts:
            old = self.hosts[host_id].to_dict()
            old.update(data)
            self.hosts[host_id] = HostConfig.from_dict(old)
            self._persist()

    def _persist(self):
        cfg = self.config
        cfg["hosts"] = [h.to_dict() for h in self.hosts.values()]
        save_config(cfg)

    async def shutdown(self):
        for hid in list(self.sessions.keys()):
            await self.stop_session(hid)


# ---------------------------------------------------------------------------
# Web App (FastAPI)
# ---------------------------------------------------------------------------

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="TailSSH Manager")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
manager: SessionManager = None  # initialized in startup


# Models
class HostCreate(BaseModel):
    id: Optional[str] = None
    name: str
    tailscale_ip: str
    user: str = "root"
    port: int = 22
    key_file: str = "~/.ssh/id_ed25519"
    auto_cmd: str = ""
    reconnect: bool = True
    reconnect_interval: int = 10
    enabled: bool = True


class HostUpdate(BaseModel):
    name: str | None = None
    tailscale_ip: str | None = None
    user: str | None = None
    port: int | None = None
    key_file: str | None = None
    auto_cmd: str | None = None
    reconnect: bool | None = None
    reconnect_interval: int | None = None
    enabled: bool | None = None


# ---------- REST API ----------

@app.on_event("startup")
async def startup():
    global manager
    cfg = load_config()
    manager = SessionManager(cfg)
    asyncio.create_task(manager.start_all())


@app.on_event("shutdown")
async def shutdown():
    if manager:
        await manager.shutdown()


@app.get("/api/hosts")
async def list_hosts():
    """Return all hosts with their connection status."""
    result = []
    for hid, hc in manager.hosts.items():
        session = manager.sessions.get(hid)
        result.append({
            **hc.to_dict(),
            "connected": session.connected if session else False,
        })
    return JSONResponse(result)


@app.post("/api/hosts")
async def create_host(host: HostCreate):
    data = host.model_dump()
    if not data.get("id"):
        data["id"] = data["tailscale_ip"]  # use tailscale_ip as id
    if data["id"] in manager.hosts:
        raise HTTPException(400, f"Host '{data['id']}' already exists")
    hc = HostConfig.from_dict(data)
    manager.add_host(hc)
    await manager.start_session(hc.id)
    return JSONResponse(hc.to_dict(), status_code=201)


@app.put("/api/hosts/{host_id}")
async def update_host(host_id: str, data: HostUpdate):
    if host_id not in manager.hosts:
        raise HTTPException(404, "Host not found")
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    manager.update_host(host_id, update_dict)
    hc = manager.hosts[host_id]
    return JSONResponse(hc.to_dict())


@app.delete("/api/hosts/{host_id}")
async def delete_host(host_id: str):
    if host_id not in manager.hosts:
        raise HTTPException(404, "Host not found")
    await manager.stop_session(host_id)
    manager.remove_host(host_id)
    return JSONResponse({"ok": True})


@app.post("/api/hosts/{host_id}/reconnect")
async def reconnect_host(host_id: str):
    if host_id not in manager.hosts:
        raise HTTPException(404, "Host not found")
    await manager.stop_session(host_id)
    # Reset stop event by removing old session
    manager.sessions.pop(host_id, None)
    await manager.start_session(host_id)
    return JSONResponse({"ok": True})


@app.get("/api/hosts/{host_id}/logs")
async def get_host_logs(host_id: str, lines: int = 200):
    """Return recent log lines from session buffer."""
    # Could be expanded with file-based logging
    return JSONResponse({"lines": []})


# ---------- WebSocket for terminal ----------

@app.websocket("/ws/{host_id}")
async def terminal_ws(ws: WebSocket, host_id: str):
    await ws.accept()
    session = manager.sessions.get(host_id)
    if not session:
        await ws.send_text(json.dumps({"type": "error", "message": f"Host '{host_id}' not found"}))
        await ws.close()
        return

    # Create a per-websocket message queue
    queue: asyncio.Queue = asyncio.Queue()
    session.ws_clients.add(queue)

    try:
        # Send current status
        await ws.send_text(json.dumps({
            "type": "status",
            "status": "connected" if session.connected else "disconnected",
        }))

        async def send_loop():
            while True:
                msg = await queue.get()
                try:
                    await ws.send_text(msg)
                except Exception:
                    break

        send_task = asyncio.create_task(send_loop())

        try:
            while True:
                data = await ws.receive_text()
                msg = json.loads(data)
                if msg.get("type") == "stdin":
                    await manager.write_stdin(host_id, msg.get("data", ""))
        except WebSocketDisconnect:
            pass
        finally:
            send_task.cancel()
    finally:
        session.ws_clients.discard(queue)


# ---------- Static / Web UI ----------

WEB_DIR = Path(__file__).parent / "web"
if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="web")


@app.get("/")
async def index():
    index_path = WEB_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text())
    return HTMLResponse("<h1>TailSSH Manager</h1><p>Web UI not found</p>")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main():
    import uvicorn
    cfg = load_config()
    host = cfg.get("listen_host", "0.0.0.0")
    port = cfg.get("listen_port", 9222)
    print(f"🔌 TailSSH Manager starting on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info", ws_ping_interval=30)


if __name__ == "__main__":
    main()