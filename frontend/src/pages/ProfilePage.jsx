import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearToken, fetchMe } from "../api/auth";
import { getTaskHistory } from "../api/tasks";

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [historyCategory, setHistoryCategory] = useState("all");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetchMe()
      .then((profile) => {
        if (mounted) {
          setUser(profile);
        }
      })
      .catch((err) => {
        if (err?.message === "Unauthorized") {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        if (mounted) {
          setHistoryError(err?.message || "Could not load history");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const onLogout = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  const telegramHandle = (user?.telegram_username || "").replace(/^@/, "");
  const telegramProfileUrl = telegramHandle ? `https://t.me/${telegramHandle}` : null;

  useEffect(() => {
    if (!user) {
      return;
    }

    let mounted = true;
    setHistoryLoading(true);
    setHistoryError("");

    getTaskHistory(120, historyCategory)
      .then((activity) => {
        if (mounted) {
          setHistory(activity);
        }
      })
      .catch((err) => {
        if (mounted) {
          setHistoryError(err?.message || "Could not load history");
        }
      })
      .finally(() => {
        if (mounted) {
          setHistoryLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [user, historyCategory]);

  const formatHistoryLine = (entry) => {
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
        </div>
      </section>

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
              <div key={entry.id} className="history-row">
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
