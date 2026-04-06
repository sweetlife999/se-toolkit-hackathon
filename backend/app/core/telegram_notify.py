"""Thin wrapper around the Telegram Bot API for sending notifications.

All functions are fire-and-forget: failures are logged but never raise so
that a missing / mis-configured bot token never breaks the main request.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
from urllib import request as urllib_request
from urllib.error import URLError

from app.core.config import settings

logger = logging.getLogger(__name__)

_TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"


def _post(method: str, payload: Dict[str, Any]) -> bool:
    token = settings.telegram_bot_token
    if not token:
        return False

    url = _TELEGRAM_API.format(token=token, method=method)
    data = json.dumps(payload).encode()
    req = urllib_request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except (URLError, OSError) as exc:
        logger.warning("Telegram API call failed (%s): %s", method, exc)
        return False


def send_message(
    chat_id: int,
    text: str,
    reply_markup: Optional[Dict[str, Any]] = None,
    parse_mode: str = "HTML",
) -> bool:
    payload: Dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    return _post("sendMessage", payload)


def inline_keyboard(buttons: List[List[Dict[str, str]]]) -> Dict[str, Any]:
    """Build a Telegram InlineKeyboardMarkup dict."""
    return {"inline_keyboard": buttons}


def url_button(text: str, url: str) -> Dict[str, str]:
    return {"text": text, "url": url}


def callback_button(text: str, callback_data: str) -> Dict[str, str]:
    return {"text": text, "callback_data": callback_data}
