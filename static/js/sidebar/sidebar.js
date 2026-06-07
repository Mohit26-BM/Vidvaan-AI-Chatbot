// sidebar.js - Sidebar and conversation management

let conversations = [];
let activeConversationId = null;

/**
 * Initialize sidebar
 */
export async function initSidebar() {
  await loadConversations();
  setupEventListeners();
  // Refresh relative timestamps every 60 seconds
  setInterval(refreshTimestamps, 60000);
}

function refreshTimestamps() {
  document.querySelectorAll(".conversation-time[data-ts]").forEach((el) => {
    el.textContent = formatTime(el.dataset.ts);
  });
}

/**
 * Load all conversations from API
 */
export async function loadConversations() {
  try {
    showLoadingState();

    const response = await fetch("/api/conversations");

    if (!response.ok) {
      throw new Error("Failed to load conversations");
    }

    const data = await response.json();
    conversations = data.conversations || [];

    renderConversations();
  } catch (error) {
    console.error("Error loading conversations:", error);
    showErrorState();
  }
}

/**
 * Render conversations in sidebar
 */
function renderConversations() {
  const container = document.getElementById("conversations-list");

  if (!container) return;

  // Clear loading state
  container.innerHTML = "";

  if (conversations.length === 0) {
    container.innerHTML = `
            <div class="conversations-empty">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
                <p>No conversations yet.<br>Start a new chat to begin!</p>
            </div>
        `;
    return;
  }

  // Group conversations by date
  const grouped = groupByDate(conversations);

  Object.keys(grouped).forEach((groupName) => {
    if (grouped[groupName].length === 0) return;

    const groupDiv = document.createElement("div");
    groupDiv.className = "conversation-group";

    const groupTitle = document.createElement("div");
    groupTitle.className = "group-title";
    groupTitle.textContent = groupName;
    groupDiv.appendChild(groupTitle);

    grouped[groupName].forEach((conv) => {
      const convItem = createConversationItem(conv);
      groupDiv.appendChild(convItem);
    });

    container.appendChild(groupDiv);
  });
}

/**
 * Create a conversation item element
 */
function createConversationItem(conv) {
  const item = document.createElement("div");
  item.className = "conversation-item";
  item.dataset.id = conv.id;

  if (conv.id === activeConversationId) {
    item.classList.add("active");
  }

  if (conv.is_pinned) {
    item.classList.add("pinned");
  }

  item.innerHTML = `
        <svg class="conversation-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
        <div class="conversation-content">
            <div class="conversation-title">${escapeHtml(conv.title)}</div>
            <div class="conversation-preview">${escapeHtml(conv.preview)}</div>
            <div class="conversation-time" data-ts="${conv.updated_at}">${formatTime(conv.updated_at)}</div>
        </div>
        <div class="conversation-actions">
            <button class="actions-btn" data-id="${conv.id}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
                </svg>
            </button>
        </div>
    `;

  // Click to select conversation
  item.addEventListener("click", (e) => {
    if (!e.target.closest(".actions-btn")) {
      selectConversation(conv.id);
    }
  });

  // Actions menu
  const actionsBtn = item.querySelector(".actions-btn");
  actionsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showActionsMenu(actionsBtn, conv);
  });

  return item;
}

/**
 * Group conversations by date
 */
function groupByDate(convs) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setDate(lastMonth.getDate() - 30);

  const groups = {
    Today: [],
    Yesterday: [],
    "Last 7 Days": [],
    "Last 30 Days": [],
    Older: [],
  };

  convs.forEach((conv) => {
    const date = new Date(conv.updated_at);

    if (date >= today) {
      groups["Today"].push(conv);
    } else if (date >= yesterday) {
      groups["Yesterday"].push(conv);
    } else if (date >= lastWeek) {
      groups["Last 7 Days"].push(conv);
    } else if (date >= lastMonth) {
      groups["Last 30 Days"].push(conv);
    } else {
      groups["Older"].push(conv);
    }
  });

  return groups;
}

/**
 * Select and load a conversation
 */
export async function selectConversation(convId) {
  activeConversationId = convId;

  // Update UI
  document.querySelectorAll(".conversation-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.id == convId);
  });

  // Emit event for chat to load messages
  window.dispatchEvent(
    new CustomEvent("conversationSelected", {
      detail: { conversationId: convId },
    }),
  );
}

/**
 * Create new conversation
 */
export async function createNewConversation() {
  try {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Chat" }),
    });

    if (!response.ok) {
      throw new Error("Failed to create conversation");
    }

    const newConv = await response.json();

    // Add to list and select
    conversations.unshift(newConv);
    renderConversations();
    selectConversation(newConv.id);

    // Clear chat area
    window.dispatchEvent(
      new CustomEvent("newConversation", {
        detail: { conversationId: newConv.id },
      }),
    );
  } catch (error) {
    console.error("Error creating conversation:", error);
    alert("Failed to create new conversation");
  }
}

/**
 * Delete conversation with custom modal
 */
async function deleteConversation(convId) {
    const modal = document.getElementById('delete-modal');
    const confirmBtn = document.getElementById('delete-confirm');
    const cancelBtn = document.getElementById('delete-cancel');
    
    // Show modal
    modal.classList.add('show');
    
    const handleConfirm = async () => {
        try {
            const response = await fetch(`/api/conversations/${convId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete');
            }
            
            // Remove from list
            conversations = conversations.filter(c => c.id !== convId);
            renderConversations();
            
            // Select another conversation
            if (activeConversationId === convId) {
                if (conversations.length > 0) {
                    selectConversation(conversations[0].id);
                } else {
                    createNewConversation();
                }
            }
            
            modal.classList.remove('show');
            cleanup();
            
        } catch (error) {
            console.error('Error deleting:', error);
            alert('Failed to delete conversation');
        }
    };
    
    const handleCancel = () => {
        modal.classList.remove('show');
        cleanup();
    };
    
    const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };
    
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            handleCancel();
        }
    });
}

/**
 * Rename conversation
 */
async function renameConversation(convId) {
  const conv = conversations.find((c) => c.id === convId);
  if (!conv) return;

  const modal = document.getElementById("rename-modal");
  const input = document.getElementById("rename-input");
  const saveBtn = document.getElementById("rename-save");
  const cancelBtn = document.getElementById("rename-cancel");

  input.value = conv.title;
  modal.classList.add("show");
  input.focus();
  input.select();

  const handleSave = async () => {
    const newTitle = input.value.trim();

    if (!newTitle) {
      alert("Title cannot be empty");
      return;
    }

    try {
      const response = await fetch(`/api/conversations/${convId}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      if (!response.ok) {
        throw new Error("Failed to rename");
      }

      // Update in list
      const index = conversations.findIndex((c) => c.id === convId);
      if (index !== -1) {
        conversations[index].title = newTitle;
        renderConversations();
      }

      modal.classList.remove("show");
      cleanup();
    } catch (error) {
      console.error("Error renaming conversation:", error);
      alert("Failed to rename conversation");
    }
  };

  const handleCancel = () => {
    modal.classList.remove("show");
    cleanup();
  };

  const cleanup = () => {
    saveBtn.removeEventListener("click", handleSave);
    cancelBtn.removeEventListener("click", handleCancel);
    input.removeEventListener("keypress", handleEnter);
  };

  const handleEnter = (e) => {
    if (e.key === "Enter") handleSave();
  };

  saveBtn.addEventListener("click", handleSave);
  cancelBtn.addEventListener("click", handleCancel);
  input.addEventListener("keypress", handleEnter);
}

/**
 * Show actions dropdown menu
 */
function showActionsMenu(button, conv) {
  // Remove any existing dropdown
  document.querySelectorAll(".actions-dropdown").forEach((d) => d.remove());

  const dropdown = document.createElement("div");
  dropdown.className = "actions-dropdown";
  dropdown.innerHTML = `
        <div class="dropdown-item" data-action="rename">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
            Rename
        </div>
        <div class="dropdown-item danger" data-action="delete">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Delete
        </div>
    `;

  // Append to body so overflow:hidden/auto on sidebar can't clip it
  document.body.appendChild(dropdown);

  // Position using fixed coords from the button's bounding rect
  const rect = button.getBoundingClientRect();
  dropdown.style.position = "fixed";
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.right = `${window.innerWidth - rect.right}px`;

  // Trigger show transition after paint
  requestAnimationFrame(() => dropdown.classList.add("show"));

  const convItem = button.closest(".conversation-item");
  if (convItem) convItem.classList.add("dropdown-open");

  const closeMenu = () => {
    dropdown.remove();
    if (convItem) convItem.classList.remove("dropdown-open");
  };

  // Handle clicks
  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;

      closeMenu();

      if (action === "rename") {
        renameConversation(conv.id);
      } else if (action === "delete") {
        deleteConversation(conv.id);
      }
    });
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", function closeDropdown(e) {
      if (!dropdown.contains(e.target) && e.target !== button) {
        closeMenu();
        document.removeEventListener("click", closeDropdown);
      }
    });
  }, 10);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // New chat button
  const newChatBtn = document.getElementById("new-chat-btn");
  if (newChatBtn) {
    newChatBtn.addEventListener("click", createNewConversation);
  }

  // Logout button
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      window.location.href = "/logout";
    });
  }

  // Settings button
  const settingsBtn = document.getElementById("settings-btn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", openSettingsModal);
  }
}

async function openSettingsModal() {
  const modal = document.getElementById("settings-modal");
  const textarea = document.getElementById("settings-instructions");
  const counter = document.getElementById("settings-char-count");
  const saveBtn = document.getElementById("settings-save");
  const cancelBtn = document.getElementById("settings-cancel");
  const closeBtn = document.getElementById("settings-close");

  // Load current value
  try {
    const res = await fetch("/api/user/settings");
    const data = await res.json();
    textarea.value = data.custom_instructions || "";
    counter.textContent = textarea.value.length;
  } catch {
    textarea.value = "";
  }

  modal.classList.add("show");
  textarea.focus();

  const updateCounter = () => { counter.textContent = textarea.value.length; };
  textarea.addEventListener("input", updateCounter);

  const close = () => {
    modal.classList.remove("show");
    textarea.removeEventListener("input", updateCounter);
    saveBtn.removeEventListener("click", handleSave);
    cancelBtn.removeEventListener("click", close);
    closeBtn.removeEventListener("click", close);
  };

  const handleSave = async () => {
    saveBtn.textContent = "Saving…";
    saveBtn.disabled = true;
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_instructions: textarea.value }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.message || "Failed to save");
        return;
      }
    } catch {
      alert("Failed to save settings");
      return;
    } finally {
      saveBtn.textContent = "Save";
      saveBtn.disabled = false;
    }
    close();
  };

  saveBtn.addEventListener("click", handleSave);
  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  }, { once: true });
}

/**
 * Show loading state
 */
function showLoadingState() {
  const container = document.getElementById("conversations-list");
  if (!container) return;

  container.innerHTML = `
        <div class="conversations-loading">
            <div class="loading-spinner"></div>
            <p>Loading conversations...</p>
        </div>
    `;
}

/**
 * Show error state
 */
function showErrorState() {
  const container = document.getElementById("conversations-list");
  if (!container) return;

  container.innerHTML = `
        <div class="conversations-empty">
            <p style="color: #ef4444;">Failed to load conversations.<br>Please refresh the page.</p>
        </div>
    `;
}

/**
 * Format timestamp
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get active conversation ID
 */
export function getActiveConversationId() {
  return activeConversationId;
}

/**
 * Update conversation after new message
 */
export function updateConversationPreview(convId, preview) {
  const conv = conversations.find((c) => c.id === convId);
  if (conv) {
    conv.preview = preview;
    conv.updated_at = new Date().toISOString();

    // Move to top
    conversations = conversations.filter((c) => c.id !== convId);
    conversations.unshift(conv);

    renderConversations();
  }
}
