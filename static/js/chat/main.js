// main.js - Chat application entry point with sidebar integration

import { initCharacterCounter } from "./utils.js";
import {
  sendMessage,
  handleKeyPress,
  loadConversationMessages,
} from "./handlers.js";
import { initSidebar } from "../sidebar/sidebar.js";
import { toggleTemporaryMode, isTemporaryMode, clearTempHistory } from "./config.js";

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

async function init() {
  initMarked();
  initCharacterCounter();

  await initSidebar();

  const input = document.getElementById("user-input");
  if (input) {
    input.focus();
    input.addEventListener("keydown", handleKeyPress);
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 160) + "px";
    });
  }

  window.sendMessage = sendMessage;

  window.addEventListener("conversationSelected", async (e) => {
    // Selecting a saved conversation exits temporary mode
    if (isTemporaryMode()) {
      applyTemporaryMode(false);
    }
    await loadConversationMessages(e.detail.conversationId);
  });

  window.addEventListener("newConversation", () => {
    clearChatBox();
  });

  setupMobileMenu();
  setupTemporaryToggle();
  setupUsageBadge();
  setupQuotaInfoPopover();
}

function setupTemporaryToggle() {
  const btn = document.getElementById("temp-chat-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const active = toggleTemporaryMode();
    applyTemporaryMode(active);
    clearTempHistory();
    showTempChatBox();
  });
}

function applyTemporaryMode(active) {
  const btn = document.getElementById("temp-chat-btn");
  const banner = document.getElementById("temp-banner");
  const sidebar = document.getElementById("sidebar");

  if (btn) btn.classList.toggle("active", active);
  if (banner) banner.classList.toggle("show", active);
  if (sidebar) sidebar.classList.toggle("temp-dimmed", active);
}

function showTempChatBox() {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;
  if (isTemporaryMode()) {
    chatBox.innerHTML = `
      <div class="welcome-message">
        <div class="bot-msg">
          <div class="message-content temp-welcome">
            <span class="sender-label">Vidvaan</span>
            <p>This is a temporary chat. Messages won't be saved to your history.</p>
          </div>
        </div>
      </div>
    `;
  } else {
    chatBox.innerHTML = `
      <div class="welcome-message">
        <div class="bot-msg">
          <div class="message-content">
            <span class="sender-label">Vidvaan</span>
            <p>Temporary chat ended. Start a new chat or select one from the sidebar.</p>
          </div>
        </div>
      </div>
    `;
  }
}

function clearChatBox() {
  const chatBox = document.getElementById("chat-box");
  if (chatBox) {
    chatBox.innerHTML = `
            <div class="welcome-message">
                <div class="bot-msg">
                    <div class="message-content">
                        <strong>Vidvaan</strong>
                        <p>👋 Start a new conversation! How can I help you today?</p>
                    </div>
                </div>
            </div>
        `;
  }
}

function setupUsageBadge() {
  const badge = document.getElementById("usage-badge");
  const reqEl = document.getElementById("usage-req");
  if (!badge || !reqEl) return;

  window.addEventListener("usageUpdate", (e) => {
    const u = e.detail;
    const remaining = parseInt(u.remaining_requests, 10);
    const limit     = parseInt(u.limit_requests, 10);

    reqEl.textContent = isNaN(remaining) ? "--" : remaining;

    const tooltip = [
      `Requests: ${u.remaining_requests ?? "?"}/${u.limit_requests ?? "?"} (resets ${u.reset_requests ?? "?"})`,
      `Tokens:   ${u.remaining_tokens ?? "?"}/${u.limit_tokens ?? "?"} (resets ${u.reset_tokens ?? "?"})`,
    ].join("\n");
    badge.title = tooltip;

    badge.classList.remove("ok", "warn", "low");
    if (!isNaN(remaining) && !isNaN(limit) && limit > 0) {
      const pct = remaining / limit;
      badge.classList.add(pct > 0.4 ? "ok" : pct > 0.15 ? "warn" : "low");
    }

    badge.classList.add("visible");
  });
}

function setupQuotaInfoPopover() {
  const btn = document.getElementById("quota-info-btn");
  const popover = document.getElementById("quota-popover");
  if (!btn || !popover) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    popover.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!popover.contains(e.target) && e.target !== btn) {
      popover.classList.remove("show");
    }
  });
}

function setupMobileMenu() {
  const menuBtn = document.getElementById("mobile-menu-btn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  if (!menuBtn || !sidebar || !overlay) return;

  menuBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
