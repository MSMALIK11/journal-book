# XM MT5 worker

JournalBook never talks to XM directly. XM has no public REST API, so every request goes through this worker, which runs on a **Windows** host next to a logged-in XM MetaTrader 5 terminal.

```text
TradingView -> JournalBook -> this worker -> XM MT5 terminal -> XM
```

## Endpoints

Both require `Authorization: Bearer $MT5_WORKER_TOKEN`.

| Method | Path      | Purpose                                                     |
| ------ | --------- | ----------------------------------------------------------- |
| GET    | `/health` | Reachability check.                                         |
| POST   | `/login`  | `{ login, password, server }` -> `mt5.initialize(...)`.      |

`/login` verifies credentials and shuts the terminal connection down again. There is no order endpoint yet; `order_check` and `order_send` come in a later phase.

## Run it on the Windows VPS

1. Install the XM MetaTrader 5 terminal and log in manually once, so the server name is cached.
2. Install Python 3.11+ (64-bit, matching the terminal's architecture).

```powershell
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

3. Put a long random token in `.env` as `MT5_WORKER_TOKEN`.
4. Start the worker, bound to loopback so only your reverse proxy can reach it:

```powershell
uvicorn app:app --host 127.0.0.1 --port 8100 --log-level warning
```

5. Put HTTPS in front of it (Caddy, IIS, or a Cloudflare Tunnel). Do not expose port 8100 directly.

For an always-on setup, register the uvicorn command as a Windows service with [NSSM](https://nssm.cc/) so it restarts with the VPS.

## Point JournalBook at it

On the JournalBook server, set the same token:

```text
MT5_WORKER_URL=https://your-vps.example
MT5_WORKER_TOKEN=long-random-token
```

Until these are set, **Test Connection** in `/settings/broker` returns `MT5 worker is not configured` and automatic execution stays locked off. It only unlocks after `/login` succeeds.

## Local development on macOS

`MetaTrader5` cannot be installed on macOS, so there is a simulated mode for exercising the JournalBook UI without a VPS. It is ignored on any host where the real package is present, so a Windows box can never fake a login.

```bash
npm run mt5:setup     # once: creates workers/mt5/.venv and installs deps
npm run mt5:worker    # serves http://127.0.0.1:8100
```

`workers/mt5/.env` needs `MT5_ALLOW_FAKE_LOGIN=1` plus a token that matches `MT5_WORKER_TOKEN` in the project's `.env.local`. `/login` then answers with a success whose message starts with `SIMULATED`, so a fake connection is never mistaken for a real one.

## Notes

- `MetaTrader5` is Windows-only. On macOS or Linux, without simulated mode, `/login` answers `503`.
- The package wraps one terminal connection, so requests are serialised behind a lock.
- Passwords are only forwarded to the terminal. Never add them to logs.
- Set `MT5_TERMINAL_PATH` if `terminal64.exe` is not in the default install location.
