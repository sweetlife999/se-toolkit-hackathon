import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchMe } from "../api/auth";
import { completeTask, getTask, takeTask } from "../api/tasks";

function TagList({ tags }) {
  if (!tags.length) {
    return <p className="muted">No tags yet.</p>;
  }

  return (
    <div className="chip-list">
      {tags.map((tag) => (
        <span key={tag.id} className="chip chip-static">
          {tag.name}
        </span>
      ))}
    </div>
  );
}

export default function TaskDetailsPage() {
  const { taskId } = useParams();
  const [task, setTask] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const loadTask = async () => {
    const [taskData, me] = await Promise.all([getTask(taskId), fetchMe()]);
    setTask(taskData);
    setCurrentUser(me);
  };

  useEffect(() => {
    let mounted = true;

    setError("");
    setLoading(true);
    loadTask()
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
  }, [taskId]);

  const refresh = async () => {
    const taskData = await getTask(taskId);
    setTask(taskData);
  };

  const onTake = async () => {
    setError("");
    setActionLoading(true);

    try {
      await takeTask(taskId);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const onComplete = async () => {
    setError("");
    setActionLoading(true);

    try {
      const updated = await completeTask(taskId);
      setTask(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="page-shell"><div className="panel">Loading task...</div></div>;
  }

  if (error && !task) {
    return (
      <div className="page-shell">
        <div className="panel">
          <p className="error">{error}</p>
          <Link to="/tasks">Back to feed</Link>
        </div>
      </div>
    );
  }

  const isCreator = currentUser?.id === task?.creator_id;
  const canTake = task?.status === "open" && !isCreator;
  const canComplete = task?.status === "in_work" && isCreator;

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Task #{task.id}</p>
          <h1>{task.title || "Untitled task"}</h1>
        </div>
        <nav className="topbar-nav">
          <Link to="/tasks">Feed</Link>
          <Link to="/tasks/new">Create task</Link>
          <Link to="/profile">Profile</Link>
        </nav>
      </header>

      <section className="panel task-detail">
        <div className="task-card-head">
          <div>
            <p className="eyebrow">{task.mode}</p>
            <span className={`status status-${task.status}`}>{task.status}</span>
          </div>
          <div className="task-meta">
            <span>Price: {Number(task.price).toFixed(2)}</span>
            <span>Estimated: {task.estimated_minutes} min</span>
            <span>Creator: #{task.creator_id}</span>
            {task.assignee_id ? <span>Assignee: #{task.assignee_id}</span> : <span>Assignee: none</span>}
          </div>
        </div>

        <p className="task-description">{task.description}</p>

        <TagList tags={task.tags} />

        {error && <p className="error">{error}</p>}

        <div className="actions">
          {canTake && (
            <button type="button" onClick={onTake} disabled={actionLoading}>
              {actionLoading ? "Taking..." : "Take task"}
            </button>
          )}
          {canComplete && (
            <button type="button" onClick={onComplete} disabled={actionLoading}>
              {actionLoading ? "Saving..." : "Mark done"}
            </button>
          )}
          <Link className="secondary-link" to="/tasks">
            Back to feed
          </Link>
          {isCreator && task.status === "open" && <span className="muted">You created this task.</span>}
        </div>
      </section>
    </div>
  );
}


