const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const TOKEN_STORAGE_KEY = "viberrands_access_token";

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function parseError(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  function formatDetail(detail) {
    const fieldLabel = {
      username: "Telegram handle",
      telegram_username: "Telegram handle",
      password: "Password",
    };

    function toFriendlyMessage(path, message) {
      const normalizedPath = path.split(".").filter(Boolean);
      const fieldKey = normalizedPath[normalizedPath.length - 1] || "";
      const field = fieldLabel[fieldKey] || "Field";
      const lowerMsg = message.toLowerCase();

      if (lowerMsg.includes("field required")) {
        return `${field} is required.`;
      }

      if (lowerMsg.includes("at least") && lowerMsg.includes("characters")) {
        return `${field} is too short.`;
      }

      if (lowerMsg.includes("string pattern")) {
        return `${field} format is invalid.`;
      }

      if (lowerMsg.includes("input should be")) {
        return `${field} has an invalid value.`;
      }

      return path ? `${field}: ${message}` : message;
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

export function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function register(payload) {
  const response = await fetch(apiUrl("/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const parsed = await parseError(response, "Registration failed");
    const message = parsed.issues.length > 0 ? "Please fix the fields below." : parsed.message;
    const error = new Error(message);
    error.issues = parsed.issues;
    throw error;
  }

  return response.json();
}

export async function login(telegramUsername, password) {
  const formData = new URLSearchParams();
  formData.append("username", telegramUsername);
  formData.append("password", password);

  const response = await fetch(apiUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  if (!response.ok) {
    const parsed = await parseError(response, "Login failed");
    const message = parsed.issues.length > 0 ? "Please fix the fields below." : parsed.message;
    const error = new Error(message);
    error.issues = parsed.issues;
    throw error;
  }

  return response.json();
}

export async function fetchMe() {
  const token = getToken();
  const response = await fetch(apiUrl("/auth/me"), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unauthorized");
  }

  return response.json();
}

export async function getUserHistory(limit = 120) {
  const token = getToken();
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  const response = await fetch(apiUrl(`/auth/history?${params.toString()}`), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const parsed = await parseError(response, "Could not load history");
    throw new Error(parsed.message);
  }

  return response.json();
}

