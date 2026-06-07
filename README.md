# Vidvaan — Personal AI Assistant

A personal AI chatbot built with Flask and Groq. Supports streaming responses, live web search, per-user conversation history, and personalization.

---

## How It Works

### Streaming Responses

Responses are delivered word-by-word in real time using Server-Sent Events (SSE). The backend streams chunks from the Groq API directly to the browser as they arrive, so you see text appear as it's generated rather than waiting for the full reply.

### Web Search

Every message goes through a two-pass process:

1. A fast model checks whether the question needs real-time data (weather, news, prices, scores, etc.)
2. If yes, Tavily searches the web and the results are injected into the prompt before the response is streamed
3. If no, the response streams directly without the search step

This two-pass approach is necessary because streaming and tool-calling don't work simultaneously on Groq's API.

### Conversation History

Each conversation is stored in SQLite per user. When you send a message, the last 6 messages (3 exchanges) are sent as context to the AI. Older messages are dropped to keep token usage flat — this is why starting a new chat for a different topic is more efficient.

### Message Editing

You can edit any message you've sent. Clicking the pencil icon on a user message opens an inline editor. On save, everything after that message is deleted from the database and the edited message is re-sent to get a fresh response.

### Temporary Chat

A toggle in the header switches to temporary mode. In this mode nothing is saved to the database — history is kept only in the browser's memory for that session. Useful for sensitive or one-off questions.

### Custom Instructions

A per-user settings field (gear icon in the sidebar) lets you tell Vidvaan things about yourself — your name, preferred language, tone, background, etc. These are prepended to the system prompt on every request and apply across all conversations.

### Public Demo

The `/demo` route provides a no-login preview. History is in-memory only, nothing is persisted, and it uses the same streaming and search pipeline as the full app.

---

## Tech Stack

| Layer      | Technology                                               |
| ---------- | -------------------------------------------------------- |
| Backend    | Flask, Flask-Login, Flask-SQLAlchemy                     |
| AI         | Groq API (`llama-3.1-8b-instant`)                        |
| Web Search | Tavily                                                   |
| Database   | SQLite                                                   |
| Server     | Gunicorn (production), Waitress (dev)                    |
| Frontend   | Vanilla JS (ES modules), marked.js, highlight.js         |

---

## Project Structure

```text
vidvaan/
├── app.py                  # All routes and SSE streaming logic
├── config.py               # Dev/Production configuration
├── models/                 # SQLAlchemy models (User, Conversation, Message)
├── services/
│   ├── groq_service.py     # Groq client, two-pass tool detection, streaming
│   └── tavily_service.py   # Web search
├── static/
│   ├── css/                # Per-component stylesheets
│   ├── js/chat/            # ES module frontend (messages, handlers, config)
│   └── js/sidebar/         # Sidebar and conversation management
└── templates/              # Jinja2 HTML templates
```

---

## Token Budget

Each message costs roughly 750 tokens (system prompt + history + response). Groq's free tier allows ~500,000 tokens/day — around 650 messages. The 6-message history cap keeps per-message cost flat regardless of how long a chat runs.

---

## License

MIT
