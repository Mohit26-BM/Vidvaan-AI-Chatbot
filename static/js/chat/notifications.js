// notifications.js - Notification system

import { CONFIG } from "./config.js";

function removeExistingNotification() {
  const existing = document.querySelector(".error-notification");
  if (existing) {
    existing.remove();
  }
}

function animateNotification(notification, duration) {
  setTimeout(() => notification.classList.add("show"), 10);

  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

export function showErrorNotification(message) {
  removeExistingNotification();

  const notification = document.createElement("div");
  notification.className = "error-notification";
  notification.innerHTML = `
    <div class="notification-content">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(notification);
  animateNotification(notification, CONFIG.NOTIFICATION_DURATION);
}

export function showRateLimitError() {
  removeExistingNotification();

  const notification = document.createElement("div");
  notification.className = "error-notification rate-limit-notification";
  notification.innerHTML = `
    <div class="notification-content">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
      </svg>
      <div>
        <strong>Rate Limit Reached</strong>
        <p>Please wait a moment before sending another message.</p>
      </div>
    </div>
  `;

  document.body.appendChild(notification);
  animateNotification(notification, CONFIG.RATE_LIMIT_NOTIFICATION_DURATION);
}
