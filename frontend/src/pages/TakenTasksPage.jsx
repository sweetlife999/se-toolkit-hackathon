import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTakenTasks } from "../api/tasks";

function TakenTaskCard({ task }) {
  const creatorLabel = task.creator_telegram_username || `#${task.creator_id}`;

  return (
    <article className="task-card">
      <div className="task-card-head">
        <div>
          <p className="eyebrow">{task.mode}</p>
          <h2>
            <Link to={`/tasks/${task.id}`}>{task.title || `Task #${task.id}`}</Link>
          </h2>
        </div>
        <span className={`status status-${task.status}`}>{task.status}</span>
      </div>

      <p className="task-description">{task.description}</p>

      <div className="task-meta">
        <span>Price: {Number(task.price).toFixed(2)}</span>
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
      </div>
    </article>
  );
}

export default function TakenTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    setError("");
    setLoading(true);
    getTakenTasks()
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
  }, []);

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Tasks</p>
          <h1>My taken tasks</h1>
        </div>
        <nav className="topbar-nav">
          <Link to="/tasks">Open feed</Link>
          <Link to="/tasks/new">Create task</Link>
          <Link to="/profile">Profile</Link>
        </nav>
      </header>

      {loading ? (
        <div className="panel">Loading your taken tasks...</div>
      ) : error ? (
        <div className="panel">
          <p className="error">{error}</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="panel">
          <p className="muted">You have not taken any tasks yet.</p>
        </div>
      ) : (
        <div className="task-grid">
          {tasks.map((task) => (
            <TakenTaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

