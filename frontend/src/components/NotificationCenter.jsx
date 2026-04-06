import { useCallback, useEffect, useRef, useState } from "react";
import { getTaskHistory, getTasks, getTrackingPreferences } from "../api/tasks";

const POLL_INTERVAL_MS = 25000;
const MAX_TOASTS = 5;
const AUTO_HIDE_MS = 7000;

function formatTaskToast(task) {
  const title = task.title || `Task #${task.id}`;
  const difficulty = task.difficulty ? task.difficulty[0].toUpperCase() + task.difficulty.slice(1) : "Medium";
  const reward = Number(task.reward ?? 0);
  return `New tracked task: ${title} (${difficulty}, ${reward} pts)`;
}

function formatHistoryToast(entry) {
  const title = entry.task_title || `Task #${entry.task_id}`;

  switch (entry.event_type) {
    case "task_created":
      return `History update: you created ${title}`;
    case "task_taken":
      return `History update: ${entry.actor_username} took ${title}`;
    case "task_taken_by_you":
      return `History update: you took ${title}`;
    case "task_completed":
      return `History update: ${entry.actor_username} completed ${title}`;
    case "task_completion_confirmed":
      return `History update: completion confirmed for ${title}`;
    case "task_cancelled":
      return `History update: ${title} was cancelled`;
    default:
      return `History update for ${title}`;
  }
}

function normalizeTrackingSettings(raw) {
  const tags = Array.isArray(raw?.tags)
    ? raw.tags
        .filter((value) => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const difficulties = Array.isArray(raw?.difficulties)
    ? raw.difficulties
        .filter((value) => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value === "easy" || value === "medium" || value === "hard")
    : [];

  const minReward = Number(raw?.min_reward ?? 0);

  return {
    tags: Array.from(new Set(tags)),
    difficulties: Array.from(new Set(difficulties)),
    min_reward: Number.isFinite(minReward) && minReward > 0 ? Math.floor(minReward) : 0,
  };
}

function isTrackedTask(task, tracking) {
  const hasAnyFilter = tracking.tags.length > 0 || tracking.difficulties.length > 0 || tracking.min_reward > 0;
  if (!hasAnyFilter) {
    return false;
  }

  const taskTags = Array.isArray(task.tags)
    ? task.tags
        .map((tag) => (typeof tag?.name === "string" ? tag.name.trim().toLowerCase() : ""))
        .filter(Boolean)
    : [];

  const taskDifficulty = (task.difficulty || "medium").toString().toLowerCase();
  const taskReward = Number(task.reward ?? 0);

  const tagMatch = tracking.tags.length === 0 || tracking.tags.some((tag) => taskTags.includes(tag));
  const difficultyMatch = tracking.difficulties.length === 0 || tracking.difficulties.includes(taskDifficulty);
  const rewardMatch = tracking.min_reward <= 0 || taskReward >= tracking.min_reward;
  return tagMatch && difficultyMatch && rewardMatch;
}

export default function NotificationCenter() {
  const [toasts, setToasts] = useState([]);
  const [tracking, setTracking] = useState({ tags: [], difficulties: [], min_reward: 0 });

  const seenTaskIdsRef = useRef(new Set());
  const seenHistoryIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const timeoutIdsRef = useRef([]);
  const pollingRef = useRef(false);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message, kind = "info") => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, kind }].slice(-MAX_TOASTS));

      const timeoutId = window.setTimeout(() => {
        removeToast(id);
      }, AUTO_HIDE_MS);
      timeoutIdsRef.current.push(timeoutId);
    },
    [removeToast]
  );

  const syncNotifications = useCallback(
    async ({ silent } = { silent: false }) => {
      if (pollingRef.current) {
        return;
      }

      pollingRef.current = true;
      try {
        const [trackingSettings, openTasks, taskHistory] = await Promise.all([
          getTrackingPreferences(),
          getTasks(),
          getTaskHistory(80, "all"),
        ]);

        const normalizedTracking = normalizeTrackingSettings(trackingSettings);
        setTracking(normalizedTracking);

        const currentTaskIds = new Set(openTasks.map((task) => task.id));
        const currentHistoryIds = new Set(taskHistory.map((entry) => entry.id));

        if (!initializedRef.current) {
          seenTaskIdsRef.current = currentTaskIds;
          seenHistoryIdsRef.current = currentHistoryIds;
          initializedRef.current = true;
          return;
        }

        if (!silent) {
          const newTrackedTasks = openTasks
            .filter((task) => !seenTaskIdsRef.current.has(task.id))
            .filter((task) => isTrackedTask(task, normalizedTracking))
            .slice(0, 3);

          for (const task of newTrackedTasks) {
            pushToast(formatTaskToast(task), "task");
          }

          const newHistoryEntries = taskHistory.filter((entry) => !seenHistoryIdsRef.current.has(entry.id)).slice(0, 3);
          for (const entry of newHistoryEntries) {
            pushToast(formatHistoryToast(entry), "history");
          }
        }

        seenTaskIdsRef.current = currentTaskIds;
        seenHistoryIdsRef.current = currentHistoryIds;
      } catch (error) {
        if (!String(error?.message || "").toLowerCase().includes("unauthorized")) {
          console.warn("Notification polling failed", error);
        }
      } finally {
        pollingRef.current = false;
      }
    },
    [pushToast]
  );

  useEffect(() => {
    syncNotifications({ silent: true });

    const intervalId = window.setInterval(() => {
      syncNotifications({ silent: false });
    }, POLL_INTERVAL_MS);

    const onTasksChanged = () => syncNotifications({ silent: false });
    const onTrackingChanged = () => syncNotifications({ silent: true });

    window.addEventListener("tasks:changed", onTasksChanged);
    window.addEventListener("tracking:changed", onTrackingChanged);

    return () => {
      window.removeEventListener("tasks:changed", onTasksChanged);
      window.removeEventListener("tracking:changed", onTrackingChanged);
      window.clearInterval(intervalId);
      for (const timeoutId of timeoutIdsRef.current) {
        window.clearTimeout(timeoutId);
      }
      timeoutIdsRef.current = [];
    };
  }, [syncNotifications]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
      <div className="toast-stack-meta">
        Tracking: {tracking.tags.length} tag(s), {tracking.difficulties.length} difficulty level(s)
        {tracking.min_reward > 0 ? `, min reward ${tracking.min_reward}` : ""}
      </div>
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          <p>{toast.message}</p>
          <button type="button" className="toast-close" onClick={() => removeToast(toast.id)} aria-label="Dismiss">
            x
          </button>
        </div>
      ))}
    </div>
  );
}

