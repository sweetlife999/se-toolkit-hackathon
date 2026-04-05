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

async function parseError(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json();
    return payload.detail || payload.message || fallbackMessage;
  }

  const text = await response.text();
  return text || fallbackMessage;
}

async function post(path, payload, fallbackMessage) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await parseError(response, fallbackMessage);
    throw new Error(message);
  }

  return response.json();
}

export function verifyAdmin(payload) {
  return post("/admin/verify", payload, "Could not verify admin credentials");
}

export function adminRemoveTask(payload) {
  return post("/admin/task/remove", payload, "Could not remove task");
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

