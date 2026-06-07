// utils.js - DOM utility functions

import { CONFIG } from "./config.js";

export function scrollToBottom() {
  const chatBox = document.getElementById("chat-box");
  if (chatBox) {
    chatBox.scrollTo({
      top: chatBox.scrollHeight,
      behavior: "smooth",
    });
  }
}

export function toggleInputState(enabled) {
  const input = document.getElementById("user-input");
  const button = document.getElementById("send-btn");

  if (input) input.disabled = !enabled;
  if (button) button.disabled = !enabled;
}

export function initCharacterCounter() {
  const input = document.getElementById("user-input");
  const counter = document.getElementById("char-counter");

  if (!input || !counter) return;

  input.addEventListener("input", () => {
    const length = input.value.length;
    counter.textContent = `${length}/${CONFIG.MAX_MESSAGE_LENGTH}`;

    if (length > CONFIG.MAX_MESSAGE_LENGTH) {
      counter.classList.add("exceeded");
    } else {
      counter.classList.remove("exceeded");
    }
  });
}
