import { getToken } from "./auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function authHeaders() {
  const token = getToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function notifyTasksChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("tasks:changed"));
  }
}

async function parseError(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  function formatDetail(detail) {
    const fieldLabel = {
      admin_handle: "Admin handle",
      admin_password: "Admin password",
      user_handle: "User handle",
      task_id: "Task ID",
      amount: "Amount",
      message: "Message",
      comment: "Comment",
    };

    function toFriendlyMessage(path, message) {
      const normalizedPath = path.split(".").filter(Boolean);
      const fieldKey = normalizedPath[normalizedPath.length - 1] || "";
      const field = fieldLabel[fieldKey] || "Field";
      const lowerMsg = message.toLowerCase();

      if (lowerMsg.includes("at least") && lowerMsg.includes("characters")) {
        return `${field} is too short.`;
      }

      if (lowerMsg.includes("at most") && lowerMsg.includes("characters")) {
        return `${field} is too long.`;
      }

      if (lowerMsg.includes("greater than") || lowerMsg.includes("positive")) {
        return `${field} must be greater than 0.`;
      }

      if (lowerMsg.includes("field required")) {
        return `${field} is required.`;
      }

      if (lowerMsg.includes("input should be")) {
        return `${field} has an invalid value.`;
      }

      if (lowerMsg.includes("integer") || lowerMsg.includes("whole number")) {
        return `${field} must be a whole number.`;
      }

      return `${field}: ${message}`;
    }

    if (typeof detail === "string") {
      return { message: detail, issues: [] };
    }

    if (Array.isArray(detail)) {
      const issues = detail
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          if (item && typeof item === "object") {
            const path = Array.isArray(item.loc)
              ? item.loc.filter((part) => part !== "body").join(".")
              : "";
            const message = typeof item.msg === "string" ? item.msg : "Invalid value";
            return toFriendlyMessage(path, message);
          }

          return String(item);
        })
        .filter(Boolean);

      return {
        message: issues[0] || "Please review your input.",
        issues,
      };
    }

    if (detail && typeof detail === "object") {
      const message = typeof detail.msg === "string" ? detail.msg : "";
      return { message, issues: message ? [message] : [] };
    }

    return { message: "", issues: [] };
  }

  if (contentType.includes("application/json")) {
    const payload = await response.json();
    const formatted = formatDetail(payload.detail);
    return {
      message: formatted.message || payload.message || fallbackMessage,
      issues: formatted.issues,
    };
  }

  const text = await response.text();
  return {
    message: text || fallbackMessage,
    issues: [],
  };
}

async function post(path, payload, fallbackMessage) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const parsed = await parseError(response, fallbackMessage);
    const message = parsed.issues.length > 0 ? "Please fix the fields below." : parsed.message;
    const error = new Error(message);
    error.issues = parsed.issues;
    throw error;
  }

  return response.json();
}

async function get(path, fallbackMessage) {
  const response = await fetch(apiUrl(path), {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    const parsed = await parseError(response, fallbackMessage);
    const message = parsed.issues.length > 0 ? "Please fix the fields below." : parsed.message;
    const error = new Error(message);
    error.issues = parsed.issues;
    throw error;
  }

  return response.json();
}

export function verifyAdmin() {
  return get("/admin/verify", "Could not verify admin credentials");
}

export function adminRemoveTask(payload) {
  return post("/admin/task/remove", payload, "Could not remove task").then((result) => {
    notifyTasksChanged();
    return result;
  });
}

export function adminIncrementUserBalance(payload) {
  return post("/admin/balance/increment-user", payload, "Could not increment user balance");
}

export function adminIncrementAllBalances(payload) {
  return post("/admin/balance/increment-all", payload, "Could not increment all balances");
}

export function adminDecrementUserBalance(payload) {
  return post("/admin/balance/decrement-user", payload, "Could not decrement user balance");
}

export function adminAddAdmin(payload) {
  return post("/admin/add-admin", payload, "Could not add admin");
}

export function adminRemoveAdmin(payload) {
  return post("/admin/remove-admin", payload, "Could not remove admin");
}

