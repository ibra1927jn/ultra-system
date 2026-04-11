#!/usr/bin/env python3
"""ULTRA SYSTEM — Telethon sidecar (P1 Lote B B9)

Telegram MTProto user-session listener. Streams new messages from a
curated list of public OSINT channels into the engine via the
/webhooks/telegram-channel endpoint.

Modos:
  python main.py auth    — auth interactivo one-shot (crea session.session)
  python main.py run     — listener (default en container)

Env:
  TELEGRAM_API_ID         — int, my.telegram.org
  TELEGRAM_API_HASH       — str, my.telegram.org
  TELETHON_SESSION        — path al session file (default /data/session)
  ENGINE_URL              — URL del engine (default http://engine:3000)
  WEBHOOK_SECRET          — shared secret para /webhooks/* (opcional)
  TELETHON_CHANNELS       — comma-separated list de @usernames (sin @)
"""
import asyncio
import logging
import os
import sys
from urllib.parse import urlencode

import httpx
from telethon import TelegramClient
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.errors import UserAlreadyParticipantError, ChannelPrivateError

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION_PATH = os.environ.get("TELETHON_SESSION", "/data/session")
ENGINE_URL = os.environ.get("ENGINE_URL", "http://engine:3000").rstrip("/")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
CHANNELS_RAW = os.environ.get("TELETHON_CHANNELS", "")

CHANNELS = [c.strip().lstrip("@") for c in CHANNELS_RAW.split(",") if c.strip()]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [telethon] %(levelname)s: %(message)s",
)
log = logging.getLogger()


async def cmd_auth() -> None:
    """Interactive auth flow. Telethon prompts in stdin for phone, code, 2FA."""
    log.info("Interactive auth — provee phone (+codigo país), código SMS y password 2FA si existe")
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.start()
    me = await client.get_me()
    handle = me.username or me.first_name or "unknown"
    log.info(f"✓ Auth OK as @{handle} (id={me.id}). Session persisted at {SESSION_PATH}")
    await client.disconnect()


async def post_to_engine(http: httpx.AsyncClient, payload: dict) -> None:
    qs = "?" + urlencode({"secret": WEBHOOK_SECRET}) if WEBHOOK_SECRET else ""
    url = f"{ENGINE_URL}/webhooks/telegram-channel{qs}"
    try:
        r = await http.post(url, json=payload, timeout=15)
        if r.status_code != 200:
            log.warning(f"engine {r.status_code}: {r.text[:200]}")
    except Exception as e:
        log.error(f"post failed: {e}")


async def cmd_run() -> None:
    if not CHANNELS:
        log.error("TELETHON_CHANNELS vacío. Exiting.")
        sys.exit(1)

    log.info(f"Channels seed: {len(CHANNELS)} → {','.join(CHANNELS)}")
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        log.error(
            "No session — corre `docker compose run --rm telethon-auth` "
            "primero. Exiting."
        )
        sys.exit(2)

    me = await client.get_me()
    log.info(f"Connected as @{me.username or me.first_name} (id={me.id})")

    # Resolve + join. Telethon solo pushea events.NewMessage para canales a los
    # que la user-session está unida, así que auto-join al arrancar.
    resolved = []
    for username in CHANNELS:
        try:
            entity = await client.get_entity(username)
            try:
                await client(JoinChannelRequest(entity))
                log.info(f"  ✓ @{username} → id={entity.id} (joined)")
            except UserAlreadyParticipantError:
                log.info(f"  ✓ @{username} → id={entity.id} (already)")
            except ChannelPrivateError as e:
                log.warning(f"  ✗ @{username}: private ({e})")
                continue
            resolved.append(entity)
        except Exception as e:
            log.warning(f"  ✗ @{username}: {e}")

    if not resolved:
        log.error("0 canales resueltos. Exiting.")
        sys.exit(3)

    log.info(f"Resolved {len(resolved)}/{len(CHANNELS)} channels — polling loop")

    http = httpx.AsyncClient()
    # Track highest msg id seeded — prime con el último mensaje actual para
    # no spammear backlog histórico.
    last_seen: dict[int, int] = {}
    for entity in resolved:
        try:
            async for msg in client.iter_messages(entity, limit=1):
                last_seen[entity.id] = msg.id
                break
            else:
                last_seen[entity.id] = 0
        except Exception as e:
            log.warning(f"prime failed for id={entity.id}: {e}")
            last_seen[entity.id] = 0
    log.info(f"Primed last_seen for {len(last_seen)} channels")

    async def post_msg(chat, msg) -> None:
        if not msg.message:
            return
        username = getattr(chat, "username", None)
        url = (
            f"https://t.me/{username}/{msg.id}" if username
            else f"https://t.me/c/{chat.id}/{msg.id}"
        )
        payload = {
            "channel_id": chat.id,
            "channel_username": username,
            "channel_title": getattr(chat, "title", None),
            "msg_id": msg.id,
            "url": url,
            "text": msg.message[:4000],
            "date": msg.date.isoformat() if msg.date else None,
            "views": getattr(msg, "views", None),
            "forwards": getattr(msg, "forwards", None),
        }
        await post_to_engine(http, payload)
        tag = f"@{username}" if username else f"id={chat.id}"
        log.info(f"→ {tag}/{msg.id} ({len(msg.message)} chars)")

    POLL_INTERVAL = int(os.environ.get("TELETHON_POLL_INTERVAL", "60"))
    while True:
        for entity in resolved:
            try:
                new_msgs = []
                async for msg in client.iter_messages(
                    entity, min_id=last_seen.get(entity.id, 0), limit=20
                ):
                    new_msgs.append(msg)
                for msg in reversed(new_msgs):
                    await post_msg(entity, msg)
                    if msg.id > last_seen.get(entity.id, 0):
                        last_seen[entity.id] = msg.id
            except Exception as e:
                log.warning(f"poll id={entity.id}: {e}")
        await asyncio.sleep(POLL_INTERVAL)


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    if cmd == "auth":
        asyncio.run(cmd_auth())
    elif cmd == "run":
        asyncio.run(cmd_run())
    else:
        log.error(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
