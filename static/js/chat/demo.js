// demo.js — standalone demo chat (no auth, no sidebar, 10-message limit)

import {
  addMessage, addErrorMessage,
  showTypingIndicator, removeTypingIndicator,
  showSearchIndicator, removeSearchIndicator,
  createStreamingMessage, appendStreamChunk, finalizeStreamingMessage,
} from "./messages.js";
import { initCharacterCounter, toggleInputState, scrollToBottom } from "./utils.js";

const DEMO_LIMIT = 10;
const history = [];
let messageCount = 0;
let waiting = false;

function initMarked() {
  if (typeof marked === "undefined" || typeof hljs === "undefined") return;
  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  });
}

function updateCounter() {
  const el = document.getElementById("demo-counter");
  if (el) el.textContent = `${messageCount} / ${DEMO_LIMIT}`;
  if (messageCount >= DEMO_LIMIT) {
    el?.classList.add("exceeded");
    showLimitOverlay();
  }
}

function showLimitOverlay() {
  const overlay = document.getElementById("demo-limit-overlay");
  if (overlay) overlay.classList.add("show");
  toggleInputState(false);
  const input = document.getElementById("user-input");
  if (input) input.placeholder = "Demo limit reached — sign up for unlimited access";
}

async function sendMessage() {
  if (waiting || messageCount >= DEMO_LIMIT) return;

  const input = document.getElementById("user-input");
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;

  // Add to UI + history
  addMessage("You", message);
  history.push({ role: "user", content: message });

  input.value = "";
  input.style.height = "auto";
  messageCount++;
  updateCounter();

  waiting = true;
  toggleInputState(false);
  showTypingIndicator();

  let streamEl = null;
  let fullText = "";

  try {
    const res = await fetch("/api/demo/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: [...history] }),
    });

    removeTypingIndicator();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      addErrorMessage(res.status === 429
        ? "Rate limit reached. Please wait a moment."
        : err.message || "Something went wrong. Please try again.");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const data = JSON.parse(jsonStr);
          if (data.searching) {
            removeTypingIndicator();
            showSearchIndicator(data.query);
          } else if (data.search_done) {
            removeSearchIndicator();
          } else if (data.chunk) {
            if (!streamEl) { removeTypingIndicator(); streamEl = createStreamingMessage(); }
            fullText += data.chunk;
            appendStreamChunk(streamEl, data.chunk);
          } else if (data.done) {
            finalizeStreamingMessage(streamEl, fullText);
            streamEl = null;
            history.push({ role: "assistant", content: fullText });
          } else if (data.error) {
            if (streamEl) { finalizeStreamingMessage(streamEl, fullText); streamEl = null; }
            addErrorMessage(data.message || "An error occurred.");
          }
        } catch { /* skip malformed */ }
      }
    }
  } catch {
    removeTypingIndicator();
    if (streamEl) { finalizeStreamingMessage(streamEl, fullText); streamEl = null; }
    addErrorMessage("Network error. Please check your connection.");
  } finally {
    if (streamEl) { finalizeStreamingMessage(streamEl, fullText); }
    waiting = false;
    if (messageCount < DEMO_LIMIT) {
      toggleInputState(true);
      input?.focus();
    }
  }
}

function handleKeyDown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function init() {
  initMarked();
  initCharacterCounter();

  const input = document.getElementById("user-input");
  if (input) {
    input.focus();
    input.addEventListener("keydown", handleKeyDown);
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 160) + "px";
    });
  }

  window.sendMessage = sendMessage;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
