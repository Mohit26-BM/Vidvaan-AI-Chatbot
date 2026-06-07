// messages.js - Message rendering with markdown and syntax highlighting

import { scrollToBottom } from "./utils.js";

function renderMarkdown(text) {
  if (typeof marked === "undefined") return escapeHtml(text).replace(/\n/g, "<br>");
  const raw = marked.parse(text);
  return typeof DOMPurify !== "undefined" ? DOMPurify.sanitize(raw) : raw;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addMessageCopyButton(contentDiv, markdownDiv) {
  const btn = document.createElement("button");
  btn.className = "msg-copy-btn";
  btn.title = "Copy response";
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>Copy</span>`;
  btn.addEventListener("click", () => {
    navigator.clipboard.writeText(markdownDiv.innerText).then(() => {
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>Copied!</span>`;
      btn.classList.add("copied");
      setTimeout(() => {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>Copy</span>`;
        btn.classList.remove("copied");
      }, 2000);
    });
  });
  contentDiv.appendChild(btn);
}

function addCopyButtons(container) {
  container.querySelectorAll("pre code").forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (pre.querySelector(".copy-btn")) return;

    if (typeof hljs !== "undefined") {
      hljs.highlightElement(codeEl);
    }

    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.setAttribute("aria-label", "Copy code");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(codeEl.innerText).then(() => {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
        btn.classList.add("copied");
        setTimeout(() => {
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
          btn.classList.remove("copied");
        }, 2000);
      });
    });

    pre.style.position = "relative";
    pre.appendChild(btn);
  });
}

const TYPING_SPEED_MS = 28; // ~35 tokens/sec — comfortable reading pace

export function createStreamingMessage() {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return null;

  const messageDiv = document.createElement("div");
  messageDiv.className = "bot-msg";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  const senderLabel = document.createElement("span");
  senderLabel.className = "sender-label";
  senderLabel.textContent = "Vidvaan";

  const markdownDiv = document.createElement("div");
  markdownDiv.className = "markdown-body streaming";

  contentDiv.appendChild(senderLabel);
  contentDiv.appendChild(markdownDiv);
  messageDiv.appendChild(contentDiv);
  chatBox.appendChild(messageDiv);
  scrollToBottom();

  const state = {
    contentDiv,
    markdownDiv,
    _displayed: "",
    _queue: [],
    _done: false,
    _timer: null,
  };

  state._timer = setInterval(() => {
    if (state._queue.length === 0) {
      if (state._done) {
        clearInterval(state._timer);
        state.markdownDiv.classList.remove("streaming");
        requestAnimationFrame(() => {
          addCopyButtons(state.contentDiv);
          addMessageCopyButton(state.contentDiv, state.markdownDiv);
        });
        scrollToBottom();
      }
      return;
    }
    state._displayed += state._queue.shift();
    state.markdownDiv.innerHTML = renderMarkdown(state._displayed);
    scrollToBottom();
  }, TYPING_SPEED_MS);

  return state;
}

export function appendStreamChunk(streamEl, chunk) {
  // Split chunk into word + whitespace tokens so each word types individually
  const tokens = chunk.match(/\S+|\s+/g) || [];
  streamEl._queue.push(...tokens);
}

export function finalizeStreamingMessage(streamEl, fullText) {
  streamEl._done = true;
  // No content received at all (e.g. connection error before first chunk)
  if (!fullText) {
    clearInterval(streamEl._timer);
    streamEl.markdownDiv.classList.remove("streaming");
    streamEl.markdownDiv.innerHTML = "";
    scrollToBottom();
  }
  // Otherwise the timer drains the queue and finalizes itself
}

export function addMessage(sender, text, msgId = null) {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return null;

  const isUser = sender === "You";
  const messageDiv = document.createElement("div");
  messageDiv.className = isUser ? "user-msg" : "bot-msg";
  if (msgId) messageDiv.dataset.msgId = msgId;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  const senderLabel = document.createElement("span");
  senderLabel.className = "sender-label";
  senderLabel.textContent = sender;

  contentDiv.appendChild(senderLabel);

  if (isUser) {
    const messageText = document.createElement("p");
    messageText.className = "user-msg-text";
    messageText.textContent = text;
    contentDiv.appendChild(messageText);

    const editBtn = document.createElement("button");
    editBtn.className = "msg-edit-btn";
    editBtn.title = "Edit message";
    editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    editBtn.addEventListener("click", () => startInlineEdit(messageDiv));
    contentDiv.appendChild(editBtn);
  } else {
    const markdownDiv = document.createElement("div");
    markdownDiv.className = "markdown-body";
    markdownDiv.innerHTML = renderMarkdown(text);
    contentDiv.appendChild(markdownDiv);
    requestAnimationFrame(() => {
      addCopyButtons(contentDiv);
      addMessageCopyButton(contentDiv, markdownDiv);
    });
  }

  messageDiv.appendChild(contentDiv);
  chatBox.appendChild(messageDiv);
  scrollToBottom();
  return messageDiv;
}

function startInlineEdit(messageDiv) {
  const contentDiv = messageDiv.querySelector(".message-content");
  const pEl = contentDiv.querySelector(".user-msg-text");
  const editBtn = contentDiv.querySelector(".msg-edit-btn");
  if (!pEl || contentDiv.querySelector(".msg-edit-textarea")) return; // already editing

  const originalText = pEl.textContent;

  pEl.style.display = "none";
  editBtn.style.display = "none";

  const textarea = document.createElement("textarea");
  textarea.className = "msg-edit-textarea";
  textarea.value = originalText;
  textarea.rows = Math.max(2, Math.ceil(originalText.length / 60));

  const actions = document.createElement("div");
  actions.className = "msg-edit-actions";
  actions.innerHTML = `
    <button class="msg-edit-save">Save &amp; Resend</button>
    <button class="msg-edit-cancel">Cancel</button>`;

  contentDiv.appendChild(textarea);
  contentDiv.appendChild(actions);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  const cancel = () => {
    textarea.remove();
    actions.remove();
    pEl.style.display = "";
    editBtn.style.display = "";
  };

  actions.querySelector(".msg-edit-cancel").addEventListener("click", cancel);

  actions.querySelector(".msg-edit-save").addEventListener("click", () => {
    const newText = textarea.value.trim();
    if (!newText) return;

    pEl.textContent = newText;
    textarea.remove();
    actions.remove();
    pEl.style.display = "";
    editBtn.style.display = "";

    // Remove all DOM messages that follow this one
    let next = messageDiv.nextElementSibling;
    while (next) {
      const toRemove = next;
      next = next.nextElementSibling;
      toRemove.remove();
    }

    // Count preceding user messages to calculate tempHistory offset
    let precedingUserMsgs = 0;
    let el = messageDiv.previousElementSibling;
    while (el) {
      if (el.classList.contains("user-msg")) precedingUserMsgs++;
      el = el.previousElementSibling;
    }

    window.dispatchEvent(new CustomEvent("messageEdited", {
      detail: {
        newText,
        msgId: messageDiv.dataset.msgId || null,
        precedingUserMsgs,
      },
    }));
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      actions.querySelector(".msg-edit-save").click();
    }
    if (e.key === "Escape") cancel();
  });
}

export function addErrorMessage(text) {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;

  const messageDiv = document.createElement("div");
  messageDiv.className = "bot-msg error-msg";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content error-content";

  const messageText = document.createElement("p");
  messageText.textContent = text;

  contentDiv.appendChild(messageText);
  messageDiv.appendChild(contentDiv);

  chatBox.appendChild(messageDiv);
  scrollToBottom();
}

export function showSearchIndicator(query) {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;

  const div = document.createElement("div");
  div.id = "search-indicator";
  div.className = "bot-msg";
  div.innerHTML = `
    <div class="message-content search-indicator">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span>Searching: <em>${escapeHtml(query)}</em></span>
      <div class="typing-indicator"><span></span><span></span><span></span></div>
    </div>`;
  chatBox.appendChild(div);
  scrollToBottom();
}

export function removeSearchIndicator() {
  const el = document.getElementById("search-indicator");
  if (el) el.remove();
}

export function showTypingIndicator() {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;

  const typingDiv = document.createElement("div");
  typingDiv.id = "typing-indicator";
  typingDiv.className = "bot-msg typing-message";

  typingDiv.innerHTML = `
    <div class="message-content">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;

  chatBox.appendChild(typingDiv);
  scrollToBottom();
}

export function removeTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) indicator.remove();
}
