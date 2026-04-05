import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getTasks, takeTask } from "../api/tasks";

function TaskCard({ task, onTake, takingId }) {
  const isTaking = takingId === task.id;
  const creatorLabel = task.creator_telegram_username || `#${task.creator_id}`;
  const difficultyLabel = task.difficulty ? `${task.difficulty[0].toUpperCase()}${task.difficulty.slice(1)}` : "Medium";

  return (
    <article className="task-card">
      <div className="task-card-head">
        <div>
          <p className="eyebrow">{task.mode}</p>
          <h2>
            <Link to={`/tasks/${task.id}`}>{task.title || `Task #${task.id}`}</Link>
          </h2>
          <span className={`difficulty-badge difficulty-${task.difficulty || "medium"}`}>{difficultyLabel}</span>
        </div>
        <span className={`status status-${task.status}`}>{task.status}</span>
      </div>

      <p className="task-description">{task.description}</p>

      <div className="task-meta">
        <span>Reward: {Number(task.reward)}</span>
        <span>Time: {task.estimated_minutes} min</span>
        <span>Creator: {creatorLabel}</span>
      </div>

      <div className="chip-list">
        {task.tags.map((tag) => (
          <span key={tag.id} className="chip chip-static">
            {tag.name}
          </span>
        ))}
      </div>

      <div className="actions">
        <Link className="secondary-link" to={`/tasks/${task.id}`}>
          Details
        </Link>
        {task.status === "open" && (
          <button type="button" onClick={() => onTake(task.id)} disabled={isTaking}>
            {isTaking ? "Taking..." : "Take task"}
          </button>
        )}
      </div>
    </article>
  );
}

export default function TaskFeedPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [mode, setMode] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [takingId, setTakingId] = useState(null);

  useEffect(() => {
    let mounted = true;

    setError("");
    setLoading(true);
    getTasks({ mode: mode || undefined, tag: tag || undefined })
      .then((data) => {
        if (mounted) {
          setTasks(data);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message);
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
  }, [mode, tag]);

  const handleTake = async (taskId) => {
    setError("");
    setTakingId(taskId);

    try {
      await takeTask(taskId);
      navigate("/tasks/taken");
    } catch (err) {
      setError(err.message);
    } finally {
      setTakingId(null);
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Tasks</p>
          <h1>Open task feed</h1>
        </div>
        <nav className="topbar-nav">
          <Link to="/tasks/new">Create task</Link>
          <Link to="/tasks/taken">Taken tasks</Link>
          <Link to="/tasks/given">Given tasks</Link>
          <Link to="/profile">Profile</Link>
        </nav>
      </header>

      <section className="panel filters">
        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">All</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </label>

        <label>
          Tag
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Search by tag" />
        </label>
      </section>

      {loading ? (
        <div className="panel">Loading tasks...</div>
      ) : error ? (
        <div className="panel">
          <p className="error">{error}</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="panel">
          <p className="muted">No open tasks match the current filters.</p>
        </div>
      ) : (
        <div className="task-grid">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onTake={handleTake} takingId={takingId} />
          ))}
        </div>
      )}
    </div>
  );
}

