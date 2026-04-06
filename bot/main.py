"""VibErrands Telegram Bot.

Features
--------
* /start — register chat_id and show main menu
* Confirm username ✅ — link Telegram account, earn +50 pts
* Track tasks 🔍 — subscribe to task notifications by tag / difficulty
* Task notifications — inline Accept / Decline buttons
  - Accept → confirmation step → take the task
  - Decline → delete the notification message
* Creator notification whenever their task is taken (from bot or site)
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import requests
from dotenv import load_dotenv
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Update,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

load_dotenv()

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

BOT_TOKEN: str = os.environ["TELEGRAM_BOT_TOKEN"]
BOT_SECRET: str = os.environ.get("TELEGRAM_BOT_SECRET", "change-me-bot-secret")
API_BASE_URL: str = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")
SITE_URL: str = os.environ.get("SITE_URL", "https://github.com/sweetlife999/se-toolkit-hackathon")

# Conversation states
WAITING_FOR_TAGS, WAITING_FOR_DIFFICULTY = range(2)

_HEADERS = {"X-Bot-Secret": BOT_SECRET}


# ---------------------------------------------------------------------------
# Backend API helpers
# ---------------------------------------------------------------------------

def _api(method: str, path: str, **kwargs) -> Optional[dict]:
    url = f"{API_BASE_URL}{path}"
    try:
        resp = getattr(requests, method)(url, headers=_HEADERS, timeout=10, **kwargs)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        logger.error("API %s %s failed: %s", method.upper(), path, exc)
        return None


def _register_chat(chat_id: int, telegram_username: str) -> Optional[str]:
    data = _api("post", "/bot/start", json={"telegram_chat_id": chat_id, "telegram_username": telegram_username})
    return data.get("status") if data else None


def _confirm_username(chat_id: int, telegram_username: str) -> Optional[str]:
    data = _api(
        "post",
        "/bot/confirm-username",
        json={"telegram_chat_id": chat_id, "telegram_username": telegram_username},
    )
    return data.get("status") if data else None


def _save_subscription(chat_id: int, telegram_username: str, tags: list[str], difficulties: list[str]) -> bool:
    data = _api(
        "post",
        "/bot/subscribe",
        json={
            "telegram_chat_id": chat_id,
            "telegram_username": telegram_username,
            "tags": tags,
            "difficulties": difficulties,
        },
    )
    return data is not None and data.get("status") == "ok"


def _get_subscription(telegram_username: str) -> Optional[dict]:
    return _api("get", f"/bot/subscriptions/{telegram_username}")


def _take_task(task_id: int, chat_id: int, telegram_username: str) -> Optional[dict]:
    return _api(
        "post",
        f"/bot/take-task/{task_id}",
        json={"telegram_chat_id": chat_id, "telegram_username": telegram_username},
    )


# ---------------------------------------------------------------------------
# UI helpers
# ---------------------------------------------------------------------------

def _main_menu_markup() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("✅ Confirm username", callback_data="confirm_username")],
            [InlineKeyboardButton("🔔 Track tasks", callback_data="track_tasks")],
        ]
    )


def _tg_username(update: Update) -> Optional[str]:
    """Return @username or None if the user hasn't set one."""
    uname = update.effective_user.username if update.effective_user else None
    return f"@{uname}" if uname else None


# ---------------------------------------------------------------------------
# /start
# ---------------------------------------------------------------------------

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    tg_user = _tg_username(update)

    status_code = _register_chat(chat_id, tg_user) if tg_user else "no_username"

    if not tg_user:
        await update.message.reply_text(
            "👋 Welcome to <b>VibErrands Bot</b>!\n\n"
            "⚠️ You don't have a Telegram username set.\n"
            "Please set one in <b>Settings → Username</b> and run /start again.",
            parse_mode=ParseMode.HTML,
        )
        return

    if status_code == "not_found":
        await update.message.reply_text(
            f"👋 Welcome to <b>VibErrands Bot</b>!\n\n"
            f"❌ Your Telegram username <b>{tg_user}</b> is not registered on the site.\n"
            f"Please sign up first, then come back here.",
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("📝 Register on site", url=SITE_URL)]]
            ),
        )
        return

    await update.message.reply_text(
        f"👋 Welcome to <b>VibErrands Bot</b>, {tg_user}!\n\n"
        "Here you can:\n"
        "• ✅ Confirm your username to earn <b>+50 points</b>\n"
        "• 🔔 Subscribe to task notifications by tag & difficulty\n\n"
        "What would you like to do?",
        parse_mode=ParseMode.HTML,
        reply_markup=_main_menu_markup(),
    )


# ---------------------------------------------------------------------------
# Confirm username flow
# ---------------------------------------------------------------------------

async def confirm_username_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    tg_user = _tg_username(update)
    if not tg_user:
        await query.edit_message_text(
            "⚠️ You don't have a Telegram username. Set one in Telegram settings and try again."
        )
        return

    result = _confirm_username(update.effective_chat.id, tg_user)

    if result == "confirmed":
        await query.edit_message_text(
            f"🎉 <b>Username confirmed!</b>\n\n"
            f"Your account <b>{tg_user}</b> is now linked.\n"
            f"💰 You received <b>+50 points</b>!",
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔙 Back to menu", callback_data="main_menu")]]
            ),
        )
    elif result == "already_confirmed":
        await query.edit_message_text(
            f"ℹ️ You already confirmed your username <b>{tg_user}</b>!",
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔙 Back to menu", callback_data="main_menu")]]
            ),
        )
    elif result == "not_found":
        await query.edit_message_text(
            f"❌ Your Telegram username <b>{tg_user}</b> is not registered on the site.\n\n"
            "Please sign up first and then confirm here.",
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(
                [
                    [InlineKeyboardButton("📝 Register on site", url=SITE_URL)],
                    [InlineKeyboardButton("🔙 Back to menu", callback_data="main_menu")],
                ]
            ),
        )
    else:
        await query.edit_message_text(
            "⚠️ Something went wrong. Please try again later.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔙 Back to menu", callback_data="main_menu")]]
            ),
        )


# ---------------------------------------------------------------------------
# Main menu back button
# ---------------------------------------------------------------------------

async def main_menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    tg_user = _tg_username(update)
    await query.edit_message_text(
        f"👋 Welcome back{f', {tg_user}' if tg_user else ''}!\n\nWhat would you like to do?",
        parse_mode=ParseMode.HTML,
        reply_markup=_main_menu_markup(),
    )


# ---------------------------------------------------------------------------
# Track tasks conversation
# ---------------------------------------------------------------------------

async def track_tasks_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    tg_user = _tg_username(update)
    if not tg_user:
        await query.edit_message_text("⚠️ Please set a Telegram username first.")
        return ConversationHandler.END

    # Show current subscription if any
    sub = _get_subscription(tg_user)
    current = ""
    if sub:
        tags = sub.get("tags", [])
        diffs = sub.get("difficulties", [])
        current = (
            f"\n\n📌 <b>Current subscription:</b>\n"
            f"Tags: {', '.join(tags) if tags else 'any'}\n"
            f"Difficulties: {', '.join(diffs) if diffs else 'any'}"
        )

    await query.edit_message_text(
        f"🔔 <b>Task Tracking Setup — Step 1/2</b>{current}\n\n"
        "Enter tags you want to track, separated by commas.\n"
        "Example: <code>python, react, devops</code>\n\n"
        "Send <b>any</b> to receive all tasks regardless of tags.",
        parse_mode=ParseMode.HTML,
    )
    return WAITING_FOR_TAGS


async def received_tags(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    raw = update.message.text.strip()
    if raw.lower() == "any":
        context.user_data["sub_tags"] = []
    else:
        context.user_data["sub_tags"] = [t.strip().lower() for t in raw.split(",") if t.strip()]

    await update.message.reply_text(
        "🔔 <b>Task Tracking Setup — Step 2/2</b>\n\n"
        "Choose which difficulty levels to track:",
        parse_mode=ParseMode.HTML,
        reply_markup=InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton("🟢 Easy", callback_data="diff_easy"),
                    InlineKeyboardButton("🟡 Medium", callback_data="diff_medium"),
                    InlineKeyboardButton("🔴 Hard", callback_data="diff_hard"),
                ],
                [InlineKeyboardButton("⚪ All difficulties", callback_data="diff_any")],
            ]
        ),
    )
    return WAITING_FOR_DIFFICULTY


async def received_difficulty(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    choice = query.data  # e.g. "diff_easy"
    if choice == "diff_any":
        difficulties: list[str] = []
    else:
        difficulties = [choice.replace("diff_", "")]

    context.user_data["sub_difficulties"] = difficulties
    tags: list[str] = context.user_data.get("sub_tags", [])
    tg_user = _tg_username(update)

    if not tg_user:
        await query.edit_message_text("⚠️ Could not determine your username. Please try again.")
        return ConversationHandler.END

    ok = _save_subscription(update.effective_chat.id, tg_user, tags, difficulties)

    tags_str = ", ".join(tags) if tags else "any"
    diffs_str = ", ".join(difficulties) if difficulties else "any"

    if ok:
        await query.edit_message_text(
            f"✅ <b>Subscription saved!</b>\n\n"
            f"🏷 Tags: <b>{tags_str}</b>\n"
            f"📊 Difficulty: <b>{diffs_str}</b>\n\n"
            "You'll receive a notification whenever a matching task is posted! 🎉",
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔙 Back to menu", callback_data="main_menu")]]
            ),
        )
    else:
        await query.edit_message_text(
            "⚠️ Could not save your subscription. Make sure your username is confirmed first.\n\n"
            "Run /start and try again.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔙 Back to menu", callback_data="main_menu")]]
            ),
        )

    return ConversationHandler.END


async def cancel_conversation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("❌ Cancelled.", reply_markup=_main_menu_markup())
    return ConversationHandler.END


# ---------------------------------------------------------------------------
# Task notification: Accept / Decline
# ---------------------------------------------------------------------------

async def accept_task_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    task_id = query.data.split("_", 1)[1]  # "accept_42" → "42"

    await query.edit_message_reply_markup(
        reply_markup=InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton("✔️ Yes, take it!", callback_data=f"confirm_accept_{task_id}"),
                    InlineKeyboardButton("🔙 No, go back", callback_data=f"cancel_accept_{task_id}"),
                ]
            ]
        )
    )


async def confirm_accept_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    task_id = int(query.data.split("_", 2)[2])  # "confirm_accept_42" → 42
    tg_user = _tg_username(update)

    if not tg_user:
        await query.edit_message_text("⚠️ Could not determine your Telegram username.")
        return

    result = _take_task(task_id, update.effective_chat.id, tg_user)

    if result is None:
        await query.edit_message_text(
            "⚠️ Could not take the task. It may already be taken or no longer available.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🌐 View on site", url=SITE_URL)]]
            ),
        )
        return

    task_title = result.get("title") or f"Task #{task_id}"
    reward = result.get("reward", 0)
    await query.edit_message_text(
        f"🎉 <b>Task accepted!</b>\n\n"
        f"📋 <b>{task_title}</b>\n"
        f"💰 Reward: {reward} pts\n\n"
        "The task is now <b>in work</b>. Good luck! 🚀",
        parse_mode=ParseMode.HTML,
        reply_markup=InlineKeyboardMarkup(
            [[InlineKeyboardButton("🌐 View on site", url=SITE_URL)]]
        ),
    )


async def cancel_accept_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """User changed their mind — restore Accept/Decline buttons."""
    query = update.callback_query
    await query.answer()

    task_id = query.data.split("_", 2)[2]  # "cancel_accept_42" → "42"
    await query.edit_message_reply_markup(
        reply_markup=InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton("✅ Accept", callback_data=f"accept_{task_id}"),
                    InlineKeyboardButton("❌ Decline", callback_data=f"decline_{task_id}"),
                ]
            ]
        )
    )


async def decline_task_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer("Notification dismissed.")
    await query.message.delete()


# ---------------------------------------------------------------------------
# Application setup
# ---------------------------------------------------------------------------

def build_application() -> Application:
    app = Application.builder().token(BOT_TOKEN).build()

    # Track tasks conversation
    track_conv = ConversationHandler(
        entry_points=[CallbackQueryHandler(track_tasks_callback, pattern="^track_tasks$")],
        states={
            WAITING_FOR_TAGS: [MessageHandler(filters.TEXT & ~filters.COMMAND, received_tags)],
            WAITING_FOR_DIFFICULTY: [
                CallbackQueryHandler(received_difficulty, pattern="^diff_(easy|medium|hard|any)$")
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel_conversation)],
        per_message=False,
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(track_conv)
    app.add_handler(CallbackQueryHandler(confirm_username_callback, pattern="^confirm_username$"))
    app.add_handler(CallbackQueryHandler(main_menu_callback, pattern="^main_menu$"))
    app.add_handler(CallbackQueryHandler(accept_task_callback, pattern=r"^accept_\d+$"))
    app.add_handler(CallbackQueryHandler(confirm_accept_callback, pattern=r"^confirm_accept_\d+$"))
    app.add_handler(CallbackQueryHandler(cancel_accept_callback, pattern=r"^cancel_accept_\d+$"))
    app.add_handler(CallbackQueryHandler(decline_task_callback, pattern=r"^decline_\d+$"))

    return app


if __name__ == "__main__":
    application = build_application()
    logger.info("Starting VibErrands bot (polling)…")
    application.run_polling(allowed_updates=Update.ALL_TYPES)
