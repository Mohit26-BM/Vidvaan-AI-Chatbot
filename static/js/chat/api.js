// api.js - API communication layer with conversation support

import { CONFIG } from "./config.js";

/**
 * Send a chat message to the backend
 */
export async function sendChatRequest(message, conversationId = null, options = {}) {
  const body = { message };

  if (options.temporary) {
    body.temporary = true;
    body.history = options.history || [];
  } else if (conversationId) {
    body.conversation_id = conversationId;
  }

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  if (data.usage) {
    window.dispatchEvent(new CustomEvent("usageUpdate", { detail: data.usage }));
  }

  return data;
}
