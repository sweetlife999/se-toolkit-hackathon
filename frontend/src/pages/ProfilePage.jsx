import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearToken, fetchMe, getUserHistory } from "../api/auth";
import {
  adminAddAdmin,
  adminDecrementUserBalance,
  adminIncrementAllBalances,
  adminIncrementUserBalance,
  adminRemoveAdmin,
  adminRemoveTask,
} from "../api/admin";
import { getTaskHistory } from "../api/tasks";
import { useTasksChangedRefresh } from "../hooks/useTasksChangedRefresh";

export default function ProfilePage() {
  const navigate = useNavigate();
  const mountedRef = useRef(false);
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [historyCategory, setHistoryCategory] = useState("all");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminValidationIssues, setAdminValidationIssues] = useState([]);
  const [adminNotice, setAdminNotice] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [removeTaskId, setRemoveTaskId] = useState("");
  const [incUserHandle, setIncUserHandle] = useState("");
  const [incUserAmount, setIncUserAmount] = useState("");
  const [allAmount, setAllAmount] = useState("");
  const [allMessage, setAllMessage] = useState("");
  const [decUserHandle, setDecUserHandle] = useState("");
  const [decUserAmount, setDecUserAmount] = useState("");
  const [decComment, setDecComment] = useState("");
  const [addAdminHandle, setAddAdminHandle] = useState("");
  const [removeAdminHandle, setRemoveAdminHandle] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadUserAndHistory = useCallback(async (category) => {
    const taskHistoryPromise = category === "admin" ? Promise.resolve([]) : getTaskHistory(120, category);
    const [profile, taskActivity, adminActivity] = await Promise.all([fetchMe(), taskHistoryPromise, getUserHistory(120)]);

    const mappedTask = category === "admin"
      ? []
      : taskActivity.map((entry) => ({ ...entry, source: "task", uid: `task-${entry.id}-${entry.created_at}` }));

    const mappedAdmin = adminActivity.map((entry) => ({
      ...entry,
      source: "admin",
      uid: `admin-${entry.id}-${entry.created_at}`,
    }));

    const merged = (category === "all"
      ? [...mappedTask, ...mappedAdmin]
      : category === "admin"
        ? mappedAdmin
        : mappedTask
    ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { profile, merged };
  }, []);

  const refreshProfile = useCallback(async () => {
    setHistoryError("");
    setHistoryLoading(true);

    try {
      const { profile, merged } = await loadUserAndHistory(historyCategory);
      if (mountedRef.current) {
        setUser(profile);
        setHistory(merged);
      }
    } catch (err) {
      if (err?.message === "Unauthorized" || String(err?.message || "").toLowerCase().includes("credentials")) {
        if (mountedRef.current) {
          clearToken();
          navigate("/login", { replace: true });
        }
        return;
      }

      if (mountedRef.current) {
        setHistoryError(err?.message || "Could not load profile");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setHistoryLoading(false);
      }
    }
  }, [historyCategory, loadUserAndHistory, navigate]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useTasksChangedRefresh(refreshProfile);

  const onLogout = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  const telegramHandle = (user?.telegram_username || "").replace(/^@/, "");
  const telegramProfileUrl = telegramHandle ? `https://t.me/${telegramHandle}` : null;

  const refreshAfterAdminAction = async () => {
    await refreshProfile();
  };

  const runAdminAction = async (action, successMessage) => {
    setAdminError("");
    setAdminValidationIssues([]);
    setAdminNotice("");
    setAdminLoading(true);
    try {
      await action();
      await refreshAfterAdminAction();
      setAdminNotice(successMessage);
    } catch (err) {
      if (Array.isArray(err.issues) && err.issues.length > 0) {
        setAdminValidationIssues(err.issues);
        setAdminError("Please fix the fields below.");
      } else {
        setAdminError(err.message || "Admin action failed");
      }
    } finally {
      setAdminLoading(false);
    }
  };

  const onRemoveTask = (e) => {
    e.preventDefault();
    runAdminAction(
      () => adminRemoveTask({ task_id: Number(removeTaskId) }),
      "Task removed"
    );
  };

  const onIncrementUser = (e) => {
    e.preventDefault();
    runAdminAction(
      () =>
        adminIncrementUserBalance({
          user_handle: incUserHandle.trim(),
          amount: Number(incUserAmount),
        }),
      "User balance incremented"
    );
  };

  const onIncrementAll = (e) => {
    e.preventDefault();
    runAdminAction(
      () =>
        adminIncrementAllBalances({
          amount: Number(allAmount),
          message: allMessage.trim(),
        }),
      "All balances incremented"
    );
  };

  const onDecrementUser = (e) => {
    e.preventDefault();
    runAdminAction(
      () =>
        adminDecrementUserBalance({
          user_handle: decUserHandle.trim(),
          amount: Number(decUserAmount),
          comment: decComment.trim(),
        }),
      "User balance decremented"
    );
  };

  const onAddAdmin = (e) => {
    e.preventDefault();
    runAdminAction(
      () => adminAddAdmin({ user_handle: addAdminHandle.trim() }),
      `${addAdminHandle.trim()} is now an admin`
    );
  };

  const onRemoveAdmin = (e) => {
    e.preventDefault();
    runAdminAction(
      () => adminRemoveAdmin({ user_handle: removeAdminHandle.trim() }),
      `${removeAdminHandle.trim()} has been removed from admins`
    );
  };

  const formatHistoryLine = (entry) => {
    if (entry.source === "admin") {
      return entry.message;
    }

    const me = user?.telegram_username;
    const actor = entry.actor_username === me ? "You" : entry.actor_username;
    const other = entry.other_username || "unknown";

    switch (entry.event_type) {
      case "task_created":
        return `You created task: ${entry.task_title}`;
      case "task_taken":
        return `${actor} took task: ${entry.task_title}`;
      case "task_taken_by_you":
        return `You took the task from ${other}: ${entry.task_title}`;
      case "task_completed":
        return `${actor} completed task: ${entry.task_title}`;
      case "task_completion_confirmed":
        return `${actor} confirmed the completion of ${entry.task_title}`;
      case "task_cancelled":
        return `${actor} cancelled task: ${entry.task_title}`;
      default:
        return `${actor} updated task: ${entry.task_title}`;
    }
  };

  const formatDelta = (delta) => {
    if (!delta) {
      return "";
    }
    return delta > 0 ? `+${delta}` : `${delta}`;
  };

  const formatHistoryTimestamp = (value) => {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  if (loading) {
    return (
      <div className="page-shell">
        <div className="panel">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Your profile</h1>
        </div>
        <nav className="topbar-nav">
          <Link to="/tasks">Feed</Link>
          <Link to="/tasks/new">Create task</Link>
          <Link to="/tasks/taken">Taken tasks</Link>
          <Link to="/tasks/given">Given tasks</Link>
        </nav>
      </header>

      <section className="panel">
        <p>Telegram: {user?.telegram_username}</p>
        <p>Balance: {user?.balance ?? 0}</p>
        <p>Tasks created: {user?.tasks_created ?? 0}</p>
        <p>Tasks finished: {user?.tasks_finished ?? 0}</p>

        <div className="actions">
          <Link className="secondary-link" to="/tasks">
            Go to tasks
          </Link>
          <Link className="secondary-link" to="/tasks/taken">
            Taken tasks
          </Link>
          <Link className="secondary-link" to="/tasks/given">
            Given tasks
          </Link>
          {telegramProfileUrl && (
            <a className="secondary-link" href={telegramProfileUrl} target="_blank" rel="noreferrer">
              Open Telegram profile
            </a>
          )}
          <button type="button" className="danger-button" onClick={onLogout}>
            Logout
          </button>
          {user?.is_admin && (
            <button type="button" onClick={() => setAdminPanelOpen((current) => !current)}>
              {adminPanelOpen ? "Close admin panel" : "Open admin panel"}
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Telegram Bot</h2>
        {user?.telegram_confirmed ? (
          <p>✅ <strong>Username confirmed!</strong> Your Telegram account is linked.</p>
        ) : (
          <>
            <p>
              Link your Telegram account to earn <strong>+50 points</strong> and receive task
              notifications directly in the bot.
            </p>
            <p>
              Press a button in the bot using the link below, then tap <strong>"✅ Confirm username"</strong>.
            </p>
            <div className="actions">
              <a
                className="secondary-link"
                href="https://github.com/sweetlife999/se-toolkit-hackathon"
                target="_blank"
                rel="noreferrer"
              >
                Confirm your username →
              </a>
            </div>
          </>
        )}
      </section>

      {adminPanelOpen && user?.is_admin && (
        <section className="panel">
          <h2>Admin panel</h2>

          {adminError && <p className="error">{adminError}</p>}
          {adminValidationIssues.length > 0 && (
            <ul className="error-list">
              {adminValidationIssues.map((issue, index) => (
                <li key={`${issue}-${index}`}>{issue}</li>
              ))}
            </ul>
          )}
          {adminNotice && <p className="admin-notice">{adminNotice}</p>}

          <div className="admin-actions-wrap">
            <form className="admin-action" onSubmit={onRemoveTask}>
              <h3>Remove task</h3>
              <input
                type="number"
                min="1"
                step="1"
                value={removeTaskId}
                onChange={(e) => setRemoveTaskId(e.target.value)}
                placeholder="Task ID"
                required
              />
              <button type="submit" disabled={adminLoading}>
                Remove task
              </button>
            </form>

            <form className="admin-action" onSubmit={onIncrementUser}>
              <h3>Increment one user</h3>
              <input
                value={incUserHandle}
                onChange={(e) => setIncUserHandle(e.target.value)}
                placeholder="@user_handle"
                required
              />
              <input
                type="number"
                min="1"
                step="1"
                value={incUserAmount}
                onChange={(e) => setIncUserAmount(e.target.value)}
                placeholder="Amount"
                required
              />
              <button type="submit" disabled={adminLoading}>
                Increment user
              </button>
            </form>

            <form className="admin-action" onSubmit={onIncrementAll}>
              <h3>Increment everybody</h3>
              <input
                type="number"
                min="1"
                step="1"
                value={allAmount}
                onChange={(e) => setAllAmount(e.target.value)}
                placeholder="Amount"
                required
              />
              <textarea
                rows="3"
                value={allMessage}
                onChange={(e) => setAllMessage(e.target.value)}
                placeholder="Message for everybody"
                required
              />
              <button type="submit" disabled={adminLoading}>
                Increment all
              </button>
            </form>

            <form className="admin-action" onSubmit={onDecrementUser}>
              <h3>Decrement one user</h3>
              <input
                value={decUserHandle}
                onChange={(e) => setDecUserHandle(e.target.value)}
                placeholder="@user_handle"
                required
              />
              <input
                type="number"
                min="1"
                step="1"
                value={decUserAmount}
                onChange={(e) => setDecUserAmount(e.target.value)}
                placeholder="Amount"
                required
              />
              <textarea
                rows="3"
                value={decComment}
                onChange={(e) => setDecComment(e.target.value)}
                placeholder="Comment"
                required
              />
              <button type="submit" disabled={adminLoading}>
                Decrement user
              </button>
            </form>

            <form className="admin-action" onSubmit={onAddAdmin}>
              <h3>Make an admin</h3>
              <input
                value={addAdminHandle}
                onChange={(e) => setAddAdminHandle(e.target.value)}
                placeholder="@user_handle"
                required
              />
              <button type="submit" disabled={adminLoading}>
                Make an admin
              </button>
            </form>

            <form className="admin-action" onSubmit={onRemoveAdmin}>
              <h3>Remove from admins</h3>
              <input
                value={removeAdminHandle}
                onChange={(e) => setRemoveAdminHandle(e.target.value)}
                placeholder="@user_handle"
                required
              />
              <button type="submit" disabled={adminLoading}>
                Remove from admins
              </button>
            </form>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="history-header">
          <h2>History</h2>
          <label className="history-filter">
            <span>Filter</span>
            <select value={historyCategory} onChange={(e) => setHistoryCategory(e.target.value)}>
              <option value="all">All</option>
              <option value="created">Created</option>
              <option value="taken">Taken</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        {historyLoading ? (
          <p className="muted">Loading history...</p>
        ) : historyError ? (
          <p className="error">{historyError}</p>
        ) : history.length === 0 ? (
          <p className="muted">No history events yet.</p>
        ) : (
          <div className="history-list">
            {history.map((entry) => (
              <div key={entry.uid || entry.id} className="history-row">
                <span>{formatHistoryLine(entry)}</span>
                <span className="history-meta">
                  <span
                    className={`history-delta ${
                      entry.balance_delta > 0 ? "plus" : entry.balance_delta < 0 ? "minus" : "neutral"
                    }`}
                  >
                    {formatDelta(entry.balance_delta)}
                  </span>
                  <span className="history-time">{formatHistoryTimestamp(entry.created_at)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
