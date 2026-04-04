import { getToken } from "./auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function parseError(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json();
    return payload.detail || fallbackMessage;
  }

  const text = await response.text();
  return text || fallbackMessage;
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
    const message = await parseError(response, "Request failed");
    throw new Error(message);
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

