"""XM MetaTrader 5 worker for JournalBook.

Exposes only the endpoints JournalBook needs to verify a terminal login.
There is deliberately no order placement here.
"""

import os
import threading
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

load_dotenv()

try:
    import MetaTrader5 as mt5
except ImportError:  # non-Windows dev machines
    mt5 = None

# The MetaTrader5 package wraps a single terminal connection and is not thread safe.
_terminal_lock = threading.Lock()

app = FastAPI(title="JournalBook MT5 worker", docs_url=None, redoc_url=None)


class LoginRequest(BaseModel):
    login: str = Field(pattern=r"^\d{4,20}$")
    password: str = Field(min_length=4, max_length=128)
    server: str = Field(min_length=2, max_length=80)


def require_token(authorization: Optional[str] = Header(default=None)) -> None:
    expected = (os.getenv("MT5_WORKER_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Worker token is not configured")
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def terminal_kwargs() -> Dict[str, Any]:
    path = (os.getenv("MT5_TERMINAL_PATH") or "").strip()
    timeout_raw = (os.getenv("MT5_LOGIN_TIMEOUT") or "").strip()
    kwargs: Dict[str, Any] = {}
    if path:
        kwargs["path"] = path
    if timeout_raw.isdigit():
        kwargs["timeout"] = int(timeout_raw) * 1000
    return kwargs


def mask_login(login: str) -> str:
    return f"****{login[-4:]}" if len(login) > 4 else "****"


def simulation_enabled() -> bool:
    """Local development escape hatch.

    Only honoured when the real MetaTrader5 package is missing, so a Windows
    host can never answer with a simulated login.
    """
    if mt5 is not None:
        return False
    return (os.getenv("MT5_ALLOW_FAKE_LOGIN") or "").strip().lower() in {"1", "true", "yes"}


@app.get("/health")
def health(_: None = Depends(require_token)) -> Dict[str, Any]:
    if simulation_enabled():
        return {"ok": True, "message": "MT5 worker is reachable (simulated)", "simulated": True}
    if mt5 is None:
        return {"ok": False, "message": "MetaTrader5 package is unavailable on this host"}
    return {"ok": True, "message": "MT5 worker is reachable", "version": str(mt5.__version__)}


@app.post("/login")
def login(payload: LoginRequest, _: None = Depends(require_token)) -> Dict[str, Any]:
    if simulation_enabled():
        return {
            "ok": True,
            "simulated": True,
            "message": (
                f"SIMULATED login for {payload.server} account {mask_login(payload.login)}. "
                "No XM terminal was contacted."
            ),
        }

    if mt5 is None:
        raise HTTPException(status_code=503, detail="MetaTrader5 package is unavailable on this host")

    with _terminal_lock:
        initialized = mt5.initialize(
            login=int(payload.login),
            password=payload.password,
            server=payload.server,
            **terminal_kwargs(),
        )
        if not initialized:
            code, description = mt5.last_error()
            mt5.shutdown()
            return {"ok": False, "message": f"Login rejected ({code}): {description}"}

        account = mt5.account_info()
        mt5.shutdown()

    if account is None:
        return {"ok": False, "message": "Terminal accepted the login but returned no account"}

    return {
        "ok": True,
        "message": f"Connected to {account.server} as account {mask_login(payload.login)}",
    }
