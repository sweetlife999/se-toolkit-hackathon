import { getToken } from "./auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function parseError(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  function formatDetail(detail) {
    const fieldLabel = {
      title: "Title",
      description: "Description",
      reward: "Reward",
      estimated_minutes: "Estimated time",
      mode: "Mode",
      tags: "Tags",
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
        message: issues[0] || "Please review the highlighted fields.",
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

function authHeaders() {
  const token = getToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders(),
    },
  });

  if (!response.ok) {
    const parsed = await parseError(response, "Request failed");
    const message = parsed.issues.length > 0 ? "Please fix the fields below." : parsed.message;
    const error = new Error(message);
    error.issues = parsed.issues;
    throw error;
  }

  return response.json();
}

export async function getTasks(filters = {}) {
  const params = new URLSearchParams();

  if (filters.mode) {
    params.set("mode", filters.mode);
  }

  if (filters.tag) {
    params.set("tag", filters.tag);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request(`/tasks${suffix}`);
}

export async function getTask(taskId) {
  return request(`/tasks/${taskId}`);
}

export async function getTakenTasks() {
  return request("/tasks/taken");
}

export async function getGivenTasks() {
  return request("/tasks/given");
}

export async function getTaskHistory(limit = 100, category = "all") {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("category", category);
  return request(`/tasks/history?${params.toString()}`);
}

export async function createTask(payload) {
  return request("/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function takeTask(taskId) {
  return request(`/tasks/${taskId}/take`, {
    method: "POST",
  });
}

export async function completeTask(taskId) {
  return request(`/tasks/${taskId}/complete`, {
    method: "POST",
  });
}

export async function cancelTask(taskId) {
  return request(`/tasks/${taskId}/cancel`, {
    method: "POST",
  });
}

