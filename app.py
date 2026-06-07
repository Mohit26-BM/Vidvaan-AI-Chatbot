"""
app.py - Main Flask application with database and authentication
"""

import os
import re
import json
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, Response, stream_with_context
from flask_login import login_user, logout_user, login_required, current_user
from dotenv import load_dotenv

# Import configuration
from config import config

# Import database and models
from models import db, init_db
from models.user import User
from models.conversation import Conversation
from models.message import Message

# Import services
from services.groq_service import get_response, GroqAPIError, RateLimitError, create_stream, detect_tool_call, SEARCH_TOOL
from services.tavily_service import search as tavily_search

# Last known Groq rate-limit snapshot (updated after every API call)
_last_usage: dict = {}


def _log_usage(usage: dict):
    global _last_usage
    if not usage:
        return
    _last_usage = usage
    app.logger.info(
        "Groq quota — requests: %s/%s (resets %s) | tokens: %s/%s (resets %s)",
        usage.get("remaining_requests", "?"),
        usage.get("limit_requests", "?"),
        usage.get("reset_requests", "?"),
        usage.get("remaining_tokens", "?"),
        usage.get("limit_tokens", "?"),
        usage.get("reset_tokens", "?"),
    )

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# Load configuration
env = os.getenv("FLASK_ENV", "development")
app.config.from_object(config[env])

# Refuse to start in production with the placeholder secret key
if env == "production":
    _key = app.config.get("SECRET_KEY", "")
    if not _key or _key == "dev-secret-key-change-in-production":
        raise RuntimeError(
            "SECRET_KEY environment variable is not set. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )

# Initialize database and login manager
init_db(app)


# =============================
# 🔹 DATABASE INITIALIZATION
# =============================


@app.cli.command()
def init_database():
    """Initialize the database (create tables)"""
    with app.app_context():
        db.create_all()
        print("✅ Database tables created successfully!")


# =============================
# 🔹 PAGE ROUTES (HTML)
# =============================


@app.route("/")
def index():
    """Home page - redirect to chat if logged in, else login"""
    if current_user.is_authenticated:
        return redirect(url_for("chat_page"))
    return redirect(url_for("login_page"))


@app.route("/login")
def login_page():
    """Login page"""
    if current_user.is_authenticated:
        return redirect(url_for("chat_page"))
    return render_template("auth/login.html")


@app.route("/signup")
def signup_page():
    """Signup page"""
    if current_user.is_authenticated:
        return redirect(url_for("chat_page"))
    return render_template("auth/signup.html")


@app.route("/chat")
@login_required
def chat_page():
    """Main chat interface - protected route"""
    return render_template("chat/index.html")


@app.route("/demo")
def demo_page():
    """Public demo chat — no login required, nothing saved"""
    if current_user.is_authenticated:
        return redirect(url_for("chat_page"))
    return render_template("chat/demo.html")


@app.route("/logout")
@login_required
def logout():
    """Logout user"""
    logout_user()
    flash("You have been logged out successfully.", "success")
    return redirect(url_for("login_page"))


# =============================
# 🔹 AUTH APIs (JSON)
# =============================


@app.route("/auth/login", methods=["POST"])
def auth_login():
    """Handle login request"""
    try:
        data = request.get_json()
        email = data.get("email", "").strip()
        password = data.get("password", "")
        remember = data.get("remember", False)

        # Validation
        if not email or not password:
            return jsonify({"message": "Email and password are required"}), 400

        # Find user
        user = User.query.filter_by(email=email).first()

        if not user or not user.check_password(password):
            return jsonify({"message": "Invalid email or password"}), 401

        # Login user
        login_user(user, remember=remember)
        user.update_last_login()

        return (
            jsonify(
                {
                    "message": "Login successful",
                    "redirect": url_for("chat_page"),
                    "user": user.to_dict(),
                }
            ),
            200,
        )

    except Exception as e:
        app.logger.error(f"Login error: {str(e)}")
        return jsonify({"message": "An error occurred during login"}), 500


@app.route("/auth/signup", methods=["POST"])
def auth_signup():
    """Handle signup request"""
    try:
        data = request.get_json()
        username = data.get("username", "").strip()
        email = data.get("email", "").strip()
        password = data.get("password", "")

        # Validation
        if not username or not email or not password:
            return jsonify({"message": "All fields are required"}), 400

        if len(username) < 3:
            return jsonify({"message": "Username must be at least 3 characters"}), 400

        if len(password) < 8:
            return jsonify({"message": "Password must be at least 8 characters"}), 400
        if not re.search(r"[a-z]", password):
            return jsonify({"message": "Password must contain a lowercase letter"}), 400
        if not re.search(r"[A-Z]", password):
            return jsonify({"message": "Password must contain an uppercase letter"}), 400
        if not re.search(r"[0-9]", password):
            return jsonify({"message": "Password must contain a number"}), 400

        # Check if user exists
        if User.query.filter_by(email=email).first():
            return jsonify({"message": "Email already registered"}), 400

        if User.query.filter_by(username=username).first():
            return jsonify({"message": "Username already taken"}), 400

        # Create new user
        user = User(username=username, email=email)
        user.set_password(password)

        db.session.add(user)
        db.session.commit()

        # Auto-login after signup
        login_user(user)
        user.update_last_login()

        return (
            jsonify(
                {
                    "message": "Account created successfully",
                    "redirect": url_for("chat_page"),
                    "user": user.to_dict(),
                }
            ),
            201,
        )

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Signup error: {str(e)}")
        return jsonify({"message": "An error occurred during signup"}), 500


# =============================
# 🔹 CHAT API
# =============================


@app.route("/api/chat", methods=["POST"])
@login_required
def chat():
    """Send message — supports both persistent and temporary (unsaved) mode"""
    try:
        data = request.get_json()
        user_input = data.get("message", "").strip()
        conversation_id = data.get("conversation_id")
        temporary = data.get("temporary", False)

        # Validation
        if not user_input:
            return (
                jsonify(
                    {
                        "error": True,
                        "error_type": "validation",
                        "message": "Message cannot be empty",
                    }
                ),
                400,
            )

        if len(user_input) > app.config["MAX_MESSAGE_LENGTH"]:
            return (
                jsonify(
                    {
                        "error": True,
                        "error_type": "validation",
                        "message": f"Message too long (max {app.config['MAX_MESSAGE_LENGTH']})",
                    }
                ),
                400,
            )

        # ── Temporary chat: no DB, use inline history ──────────────────
        if temporary:
            raw_history = data.get("history", [])
            # Sanitise: only allow role/content keys, valid roles
            allowed_roles = {"user", "assistant"}
            chat_history = [
                {"role": m["role"], "content": str(m["content"])}
                for m in raw_history
                if isinstance(m, dict) and m.get("role") in allowed_roles and m.get("content")
            ]
            # Cap history to avoid prompt bloat
            if len(chat_history) > app.config["MAX_HISTORY_LENGTH"]:
                chat_history = chat_history[-app.config["MAX_HISTORY_LENGTH"]:]

            reply, usage = get_response(chat_history)
            _log_usage(usage)
            return jsonify({"error": False, "reply": reply, "conversation_id": None, "usage": usage}), 200

        # ── Persistent chat: save to DB ────────────────────────────────
        if conversation_id:
            conversation = Conversation.query.filter_by(
                id=conversation_id, user_id=current_user.id
            ).first()

            if not conversation:
                return (
                    jsonify(
                        {
                            "error": True,
                            "error_type": "not_found",
                            "message": "Conversation not found",
                        }
                    ),
                    404,
                )
        else:
            # Create new conversation
            conversation = Conversation(user_id=current_user.id, title="New Chat")
            db.session.add(conversation)
            db.session.commit()

        # Save user message
        user_message = Message.create_message(
            conversation_id=conversation.id, role="user", content=user_input
        )

        # Get conversation history for AI
        messages = conversation.messages.order_by(Message.created_at).all()
        chat_history = [msg.to_groq_format() for msg in messages]

        # Limit history length
        if len(chat_history) > app.config["MAX_HISTORY_LENGTH"]:
            chat_history = chat_history[-app.config["MAX_HISTORY_LENGTH"] :]

        # Get AI response
        reply, usage = get_response(chat_history, custom_instructions=current_user.custom_instructions)
        _log_usage(usage)

        # Save AI message
        ai_message = Message.create_message(
            conversation_id=conversation.id, role="assistant", content=reply
        )

        # Auto-generate title from first message if still "New Chat"
        if conversation.title == "New Chat" and conversation.get_message_count() == 2:
            conversation.title = user_input[:50] + (
                "..." if len(user_input) > 50 else ""
            )
            db.session.commit()

        # Update conversation timestamp
        conversation.update_timestamp()

        return (
            jsonify(
                {
                    "error": False,
                    "reply": reply,
                    "conversation_id": conversation.id,
                    "message_id": ai_message.id,
                    "usage": usage,
                }
            ),
            200,
        )

    except RateLimitError:
        return (
            jsonify(
                {
                    "error": True,
                    "error_type": "rate_limit",
                    "message": "Rate limit exceeded. Please wait.",
                }
            ),
            429,
        )

    except GroqAPIError as e:
        app.logger.error(f"Groq API error: {str(e)}")
        return (
            jsonify(
                {
                    "error": True,
                    "error_type": "api_error",
                    "message": "AI service error",
                }
            ),
            500,
        )

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Chat error: {str(e)}")
        return (
            jsonify(
                {
                    "error": True,
                    "error_type": "server_error",
                    "message": "Unexpected server error",
                }
            ),
            500,
        )


# =============================
# 🔹 STREAMING CHAT API
# =============================


def _stream_with_search(chat_history, conv_id, captured_input, user_message_id=None, custom_instructions=None):
    """
    Shared SSE generator: streams Groq response with optional web-search tool call.
    Pass 1: non-streaming with tools — reliably detects tool calls via choice.message.tool_calls.
    Pass 2: streaming without tools — produces the typed response the user sees.
    If conv_id is None, skips all DB operations (temporary / demo mode).
    """
    full_reply = []
    usage = {}
    final_messages = chat_history

    # ── Pass 1: non-streaming tool-call detection ──────────────────────
    try:
        usage, choice = detect_tool_call(chat_history, tools=[SEARCH_TOOL], custom_instructions=custom_instructions)
    except Exception as e:
        app.logger.error(f"Tool detection error: {e}")
        yield f"data: {json.dumps({'error': True, 'error_type': 'api_error', 'message': 'AI service error'})}\n\n"
        return

    if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
        tc = choice.message.tool_calls[0]
        tool_name = tc.function.name
        tool_args = tc.function.arguments
        tool_call_id = tc.id

        if tool_name == "web_search":
            try:
                query = json.loads(tool_args).get("query", tool_args)
            except Exception:
                query = tool_args

            yield f"data: {json.dumps({'searching': True, 'query': query})}\n\n"

            try:
                search_results = tavily_search(query)
            except Exception as e:
                app.logger.error(f"Tavily error: {e}")
                search_results = "Web search is currently unavailable."

            yield f"data: {json.dumps({'search_done': True})}\n\n"

            final_messages = chat_history + [
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [{
                        "id": tool_call_id,
                        "type": "function",
                        "function": {"name": "web_search", "arguments": tool_args},
                    }],
                },
                {
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": search_results,
                },
            ]

    # ── Pass 2: stream the actual answer ───────────────────────────────
    try:
        with create_stream(final_messages, custom_instructions=custom_instructions) as sr:
            for chunk in sr.parse():
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_reply.append(content)
                    yield f"data: {json.dumps({'chunk': content})}\n\n"
    except Exception as e:
        app.logger.error(f"Streaming error: {e}")
        yield f"data: {json.dumps({'error': True, 'error_type': 'api_error', 'message': 'Error generating response'})}\n\n"
        return

    # ── Persist to DB if this is a saved conversation ──────────────────
    if conv_id is not None:
        complete_reply = "".join(full_reply)
        try:
            Message.create_message(conversation_id=conv_id, role="assistant", content=complete_reply)
            conv = Conversation.query.filter_by(id=conv_id).first()
            if conv:
                if conv.title == "New Chat" and conv.get_message_count() == 2:
                    conv.title = captured_input[:50] + ("..." if len(captured_input) > 50 else "")
                    db.session.commit()
                conv.update_timestamp()
        except Exception as e:
            app.logger.error(f"DB save error: {e}")

    _log_usage(usage)
    yield f"data: {json.dumps({'done': True, 'conversation_id': conv_id, 'usage': usage, 'user_message_id': user_message_id})}\n\n"


@app.route("/api/chat/stream", methods=["POST"])
@login_required
def chat_stream():
    """Streaming chat — sends response as SSE chunks"""
    data = request.get_json()
    user_input = data.get("message", "").strip()
    conversation_id = data.get("conversation_id")
    temporary = data.get("temporary", False)

    if not user_input:
        return jsonify({"error": True, "error_type": "validation", "message": "Message cannot be empty"}), 400
    if len(user_input) > app.config["MAX_MESSAGE_LENGTH"]:
        return jsonify({"error": True, "error_type": "validation", "message": "Message too long"}), 400

    # ── Temporary: no DB ───────────────────────────────────────────────
    if temporary:
        raw_history = data.get("history", [])
        allowed_roles = {"user", "assistant"}
        chat_history = [
            {"role": m["role"], "content": str(m["content"])}
            for m in raw_history
            if isinstance(m, dict) and m.get("role") in allowed_roles and m.get("content")
        ]
        if len(chat_history) > app.config["MAX_HISTORY_LENGTH"]:
            chat_history = chat_history[-app.config["MAX_HISTORY_LENGTH"]:]

        instructions = current_user.custom_instructions

        def generate_temp():
            yield from _stream_with_search(chat_history, conv_id=None, captured_input=None, custom_instructions=instructions)

        return Response(stream_with_context(generate_temp()), mimetype="text/event-stream",
                        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    # ── Persistent: save to DB ─────────────────────────────────────────
    if conversation_id:
        conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user.id).first()
        if not conversation:
            return jsonify({"error": True, "error_type": "not_found", "message": "Conversation not found"}), 404
    else:
        conversation = Conversation(user_id=current_user.id, title="New Chat")
        db.session.add(conversation)
        db.session.commit()

    user_msg = Message.create_message(conversation_id=conversation.id, role="user", content=user_input)

    messages = conversation.messages.order_by(Message.created_at).all()
    chat_history = [msg.to_groq_format() for msg in messages]
    if len(chat_history) > app.config["MAX_HISTORY_LENGTH"]:
        chat_history = chat_history[-app.config["MAX_HISTORY_LENGTH"]:]

    conv_id = conversation.id
    captured_input = user_input
    user_message_id = user_msg.id
    instructions = current_user.custom_instructions

    def generate_persistent():
        yield from _stream_with_search(chat_history, conv_id=conv_id, captured_input=captured_input, user_message_id=user_message_id, custom_instructions=instructions)

    return Response(stream_with_context(generate_persistent()), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# =============================
# 🔹 DEMO API (no auth)
# =============================

DEMO_MESSAGE_LIMIT = 10


@app.route("/api/demo/chat", methods=["POST"])
def demo_chat():
    """Demo chat — no login, no DB, in-memory history only"""
    try:
        data = request.get_json()
        user_input = data.get("message", "").strip()
        raw_history = data.get("history", [])

        if not user_input:
            return jsonify({"error": True, "error_type": "validation",
                            "message": "Message cannot be empty"}), 400

        if len(user_input) > app.config["MAX_MESSAGE_LENGTH"]:
            return jsonify({"error": True, "error_type": "validation",
                            "message": "Message too long"}), 400

        # Sanitise history
        allowed_roles = {"user", "assistant"}
        chat_history = [
            {"role": m["role"], "content": str(m["content"])}
            for m in raw_history
            if isinstance(m, dict) and m.get("role") in allowed_roles and m.get("content")
        ]
        if len(chat_history) > DEMO_MESSAGE_LIMIT * 2:
            chat_history = chat_history[-(DEMO_MESSAGE_LIMIT * 2):]

        reply, usage = get_response(chat_history)
        _log_usage(usage)
        return jsonify({"error": False, "reply": reply, "usage": usage}), 200

    except RateLimitError:
        return jsonify({"error": True, "error_type": "rate_limit",
                        "message": "Rate limit exceeded. Please wait."}), 429
    except GroqAPIError as e:
        app.logger.error(f"Demo Groq error: {str(e)}")
        return jsonify({"error": True, "error_type": "api_error",
                        "message": "AI service error"}), 500
    except Exception as e:
        app.logger.error(f"Demo chat error: {str(e)}")
        return jsonify({"error": True, "error_type": "server_error",
                        "message": "Unexpected server error"}), 500


@app.route("/api/demo/chat/stream", methods=["POST"])
def demo_chat_stream():
    """Demo streaming chat — no login, no DB"""
    data = request.get_json()
    user_input = data.get("message", "").strip()
    raw_history = data.get("history", [])

    if not user_input:
        return jsonify({"error": True, "error_type": "validation", "message": "Message cannot be empty"}), 400
    if len(user_input) > app.config["MAX_MESSAGE_LENGTH"]:
        return jsonify({"error": True, "error_type": "validation", "message": "Message too long"}), 400

    allowed_roles = {"user", "assistant"}
    chat_history = [
        {"role": m["role"], "content": str(m["content"])}
        for m in raw_history
        if isinstance(m, dict) and m.get("role") in allowed_roles and m.get("content")
    ]
    if len(chat_history) > DEMO_MESSAGE_LIMIT * 2:
        chat_history = chat_history[-(DEMO_MESSAGE_LIMIT * 2):]

    def generate():
        yield from _stream_with_search(chat_history, conv_id=None, captured_input=None)

    return Response(stream_with_context(generate()), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# =============================
# 🔹 CONVERSATION MANAGEMENT
# =============================


@app.route("/api/conversations", methods=["GET"])
@login_required
def get_conversations():
    """Get all user conversations"""
    try:
        conversations = (
            Conversation.query.filter_by(user_id=current_user.id)
            .order_by(Conversation.updated_at.desc())
            .all()
        )

        return (
            jsonify({"conversations": [conv.to_dict() for conv in conversations]}),
            200,
        )

    except Exception as e:
        app.logger.error(f"Get conversations error: {str(e)}")
        return jsonify({"message": "Error fetching conversations"}), 500


@app.route("/api/conversations/<int:conv_id>", methods=["GET"])
@login_required
def get_conversation(conv_id):
    """Get a specific conversation with messages"""
    try:
        conversation = Conversation.query.filter_by(
            id=conv_id, user_id=current_user.id
        ).first()

        if not conversation:
            return jsonify({"message": "Conversation not found"}), 404

        return jsonify(conversation.to_dict(include_messages=True)), 200

    except Exception as e:
        app.logger.error(f"Get conversation error: {str(e)}")
        return jsonify({"message": "Error fetching conversation"}), 500


@app.route("/api/conversations", methods=["POST"])
@login_required
def create_conversation():
    """Create a new conversation"""
    try:
        data = request.get_json() or {}
        title = data.get("title", "New Chat")

        conversation = Conversation(user_id=current_user.id, title=title)

        db.session.add(conversation)
        db.session.commit()

        return jsonify(conversation.to_dict()), 201

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Create conversation error: {str(e)}")
        return jsonify({"message": "Error creating conversation"}), 500


@app.route("/api/conversations/<int:conv_id>", methods=["DELETE"])
@login_required
def delete_conversation(conv_id):
    """Delete a conversation"""
    try:
        conversation = Conversation.query.filter_by(
            id=conv_id, user_id=current_user.id
        ).first()

        if not conversation:
            return jsonify({"message": "Conversation not found"}), 404

        db.session.delete(conversation)
        db.session.commit()

        return jsonify({"message": "Conversation deleted"}), 200

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Delete conversation error: {str(e)}")
        return jsonify({"message": "Error deleting conversation"}), 500


@app.route("/api/conversations/<int:conv_id>/rename", methods=["PATCH"])
@login_required
def rename_conversation(conv_id):
    """Rename a conversation"""
    try:
        data = request.get_json()
        new_title = data.get("title", "").strip()

        if not new_title:
            return jsonify({"message": "Title cannot be empty"}), 400

        conversation = Conversation.query.filter_by(
            id=conv_id, user_id=current_user.id
        ).first()

        if not conversation:
            return jsonify({"message": "Conversation not found"}), 404

        conversation.title = new_title
        db.session.commit()

        return jsonify(conversation.to_dict()), 200

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Rename conversation error: {str(e)}")
        return jsonify({"message": "Error renaming conversation"}), 500


@app.route("/api/conversations/<int:conv_id>/messages/truncate", methods=["POST"])
@login_required
def truncate_messages(conv_id):
    """Delete a user message and everything after it so the conversation can be re-generated."""
    try:
        data = request.get_json()
        from_message_id = data.get("from_message_id")

        conversation = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first()
        if not conversation:
            return jsonify({"message": "Conversation not found"}), 404

        pivot = Message.query.filter_by(id=from_message_id, conversation_id=conv_id).first()
        if not pivot:
            return jsonify({"message": "Message not found"}), 404

        Message.query.filter(
            Message.conversation_id == conv_id,
            Message.created_at >= pivot.created_at,
        ).delete(synchronize_session=False)
        db.session.commit()

        return jsonify({"message": "Truncated"}), 200

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Truncate error: {e}")
        return jsonify({"message": "Error truncating messages"}), 500


# =============================
# 🔹 UTILITY ROUTES
# =============================


@app.route("/health")
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok"}), 200


@app.route("/api/usage")
@login_required
def api_usage():
    """Return the last-known Groq rate-limit snapshot"""
    return jsonify(_last_usage), 200


@app.route("/api/user/settings", methods=["GET"])
@login_required
def get_user_settings():
    return jsonify({"custom_instructions": current_user.custom_instructions or ""}), 200


@app.route("/api/user/settings", methods=["PATCH"])
@login_required
def update_user_settings():
    data = request.get_json()
    instructions = data.get("custom_instructions", "").strip()
    if len(instructions) > 500:
        return jsonify({"message": "Custom instructions must be 500 characters or fewer"}), 400
    current_user.custom_instructions = instructions or None
    db.session.commit()
    return jsonify({"custom_instructions": current_user.custom_instructions or ""}), 200


# =============================
# 🔹 ERROR HANDLERS
# =============================


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    if request.path.startswith("/api/"):
        return jsonify({"message": "Endpoint not found"}), 404
    return render_template("errors/404.html"), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    db.session.rollback()
    if request.path.startswith("/api/"):
        return jsonify({"message": "Internal server error"}), 500
    return render_template("errors/500.html"), 500


# =============================
# 🔹 RUN APPLICATION
# =============================

if __name__ == "__main__":
    app.run(debug=True)