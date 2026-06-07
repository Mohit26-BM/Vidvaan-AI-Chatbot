// config.js - Configuration and state management

export const CONFIG = {
  MAX_MESSAGE_LENGTH: 2000,
  NOTIFICATION_DURATION: 5000,
  RATE_LIMIT_NOTIFICATION_DURATION: 6000,
  API_ENDPOINT: "/chat",
};

export const STATE = {
  isWaitingForResponse: false,
  isTemporaryMode: false,
  temporaryHistory: [],
};

export function setWaitingState(isWaiting) {
  STATE.isWaitingForResponse = isWaiting;
}

export function getWaitingState() {
  return STATE.isWaitingForResponse;
}

export function toggleTemporaryMode() {
  STATE.isTemporaryMode = !STATE.isTemporaryMode;
  STATE.temporaryHistory = [];
  return STATE.isTemporaryMode;
}

export function isTemporaryMode() {
  return STATE.isTemporaryMode;
}

export function pushToTempHistory(role, content) {
  STATE.temporaryHistory.push({ role, content });
}

export function getTempHistory() {
  return STATE.temporaryHistory;
}

export function clearTempHistory() {
  STATE.temporaryHistory = [];
}

export function truncateTempHistory(keepCount) {
  STATE.temporaryHistory = STATE.temporaryHistory.slice(0, keepCount);
}