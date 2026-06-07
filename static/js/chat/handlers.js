// handlers.js - Event handlers with conversation support

import {
  CONFIG,
  getWaitingState,
  setWaitingState,
  isTemporaryMode,
  pushToTempHistory,
  getTempHistory,
  truncateTempHistory,
} from "./config.js";
import { sendChatRequest } from "./api.js";
import {
  addMessage,
  addErrorMessage,
  showTypingIndicator,
  removeTypingIndicator,
  showSearchIndicator,
  removeSearchIndicator,
  createStreamingMessage,
  appendStreamChunk,
  finalizeStreamingMessage,
} from "./messages.js";
import { showErrorNotification, showRateLimitError } from "./notifications.js";
import { toggleInputState } from "./utils.js";
import {
  getActiveConversationId,
  updateConversationPreview,
} from "../sidebar/sidebar.js";


/**
 * Handle different types of errors from the API
 */
function handleError(errorData) {
  const errorType = errorData.error_type;
  const userMessage = errorData.message;

  switch (errorType) {
    case "rate_limit":
      showRateLimitError();
      addErrorMessage(
        "⏱️ Rate limit reached. Please wait a moment before sending another message.",
      );
      break;

    case "validation":
      showErrorNotification(userMessage);
      break;

    case "api_error":
      showErrorNotification("AI service error. Please try again in a moment.");
      addErrorMessage(
        "🤖 I'm having trouble connecting to my AI brain. Please try again shortly.",
      );
      break;

    case "server_error":
      showErrorNotification("Server error. Please try again later.");
      addErrorMessage("⚠️ Something went wrong on my end. Please try again.");
      break;

    default:
      showErrorNotification(
        userMessage || "An error occurred. Please try again.",
      );
      addErrorMessage("❌ Sorry, I encountered an error. Please try again.");
  }
}

/**
 * Listen for inline message edits and re-submit
 */
window.addEventListener("messageEdited", async ({ detail: { newText, msgId, precedingUserMsgs } }) => {
  const temporary = isTemporaryMode();
  const conversationId = temporary ? null : getActiveConversationId();

  // Truncate DB history if persistent
  if (!temporary && conversationId && msgId) {
    try {
      await fetch(`/api/conversations/${conversationId}/messages/truncate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_message_id: parseInt(msgId) }),
      });
    } catch (e) {
      console.error("Truncate error:", e);
    }
  }

  // Truncate temp history: keep only the pairs before the edited message
  if (temporary) {
    truncateTempHistory(precedingUserMsgs * 2);
  }

  // Re-submit as if the user typed the edited text
  const fakeInput = document.getElementById("user-input");
  if (fakeInput) {
    fakeInput.value = newText;
    sendMessage();
  }
});

/**
 * Send a message to the chatbot
 */
export async function sendMessage() {
  const input = document.getElementById("user-input");
  if (!input) return;

  const message = input.value.trim();

  // Validation: Empty message
  if (!message) {
    showErrorNotification("Please enter a message before sending.");
    return;
  }

  // Validation: Message too long
  if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
    showErrorNotification(
      `Message is too long. Please keep it under ${CONFIG.MAX_MESSAGE_LENGTH} characters.`,
    );
    return;
  }

  // Prevent multiple simultaneous requests
  if (getWaitingState()) {
    return;
  }

  const temporary = isTemporaryMode();
  const conversationId = temporary ? null : getActiveConversationId();

  // Add user message to chat
  const userMsgEl = addMessage("You", message);
  input.value = "";
  input.style.height = "auto";

  // Track history for temporary mode before request
  if (temporary) {
    pushToTempHistory("user", message);
  }

  setWaitingState(true);
  toggleInputState(false);
  showTypingIndicator();

  const body = { message };
  if (temporary) {
    body.temporary = true;
    body.history = getTempHistory();
  } else if (conversationId) {
    body.conversation_id = conversationId;
  }

  let streamEl = null;
  let fullText = "";

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    removeTypingIndicator();

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      handleError(err);
      return;
    }

    const reader = response.body.getReader();
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
            if (data.user_message_id && userMsgEl) {
              userMsgEl.dataset.msgId = data.user_message_id;
            }
            if (data.usage) {
              window.dispatchEvent(new CustomEvent("usageUpdate", { detail: data.usage }));
            }
            if (temporary) {
              pushToTempHistory("assistant", fullText);
            } else if (data.conversation_id) {
              updateConversationPreview(data.conversation_id, message.substring(0, 100));
            }
          } else if (data.error) {
            if (streamEl) { finalizeStreamingMessage(streamEl, fullText); streamEl = null; }
            handleError(data);
          }
        } catch { /* malformed SSE line — skip */ }
      }
    }
  } catch (error) {
    removeTypingIndicator();
    if (streamEl) { finalizeStreamingMessage(streamEl, fullText); streamEl = null; }
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      showErrorNotification("Network error. Please check your connection.");
    } else {
      showErrorNotification("Something went wrong. Please try again.");
    }
    console.error("Stream error:", error);
  } finally {
    if (streamEl) { finalizeStreamingMessage(streamEl, fullText); }
    setWaitingState(false);
    toggleInputState(true);
    input.focus();
  }
}

/**
 * Load conversation messages
 */
export async function loadConversationMessages(conversationId) {
  try {
    const response = await fetch(`/api/conversations/${conversationId}`);

    if (!response.ok) {
      throw new Error("Failed to load conversation");
    }

    const data = await response.json();

    // Clear chat box
    const chatBox = document.getElementById("chat-box");
    if (chatBox) {
      chatBox.innerHTML = "";
    }

    // Render messages
    if (data.messages && data.messages.length > 0) {
      data.messages.forEach((msg) => {
        addMessage(msg.role === "user" ? "You" : "Vidvaan", msg.content, msg.id);
      });
    } else {
      // Show welcome message if no messages
      chatBox.innerHTML = `
        <div class="welcome-message">
          <div class="bot-msg">
            <div class="message-content">
              <strong>Vidvaan</strong>
              <p>👋 Start chatting! How can I help you today?</p>
            </div>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error loading messages:", error);
    showErrorNotification("Failed to load conversation");
  }
}

/**
 * Handle Enter key in the textarea — send on Enter, newline on Shift+Enter
 */
export function handleKeyPress(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}
