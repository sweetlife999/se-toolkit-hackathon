import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getTasks, takeTask } from "../api/tasks";

function formatHours(estimatedMinutes) {
  const totalMinutes = Number(estimatedMinutes || 0);
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return "-";
  }

  const hours = totalMinutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
}

function TaskCard({ task, onTake, takingId }) {
  const isTaking = takingId === task.id;
  const creatorLabel = task.creator_telegram_username || "Unknown";
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
        <span>Time: {formatHours(task.estimated_minutes)}</span>
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
  const MIN_REWARD = 0;
  const MAX_REWARD = 10000;

  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [mode, setMode] = useState("");
  const [tag, setTag] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [minReward, setMinReward] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [takingId, setTakingId] = useState(null);
  const normalizedMinReward = Math.min(MAX_REWARD, Math.max(MIN_REWARD, Number(minReward) || 0));

  const loadTasks = async (mountedRef) => {
    setError("");
    setLoading(true);
    try {
      const data = await getTasks({ mode: mode || undefined, tag: tag || undefined, minReward: normalizedMinReward });
      if (mountedRef.current) {
        setTasks(data);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const creator = (task.creator_telegram_username || "").toLowerCase();
      const title = (task.title || "").toLowerCase();
      const description = (task.description || "").toLowerCase();
      const tagMatch = task.tags.some((taskTag) => taskTag.name.toLowerCase().includes(query));
      const searchMatch =
        !query || creator.includes(query) || title.includes(query) || description.includes(query) || tagMatch;
      const taskDifficulty = (task.difficulty || "medium").toLowerCase();
      const difficultyMatch = !difficulty || taskDifficulty === difficulty;
      const rewardMatch = normalizedMinReward <= 0 || Number(task.reward || 0) >= normalizedMinReward;

      return searchMatch && difficultyMatch && rewardMatch;
    });
  }, [tasks, search, difficulty, normalizedMinReward]);

  const clearFilters = () => {
    setMode("");
    setTag("");
    setDifficulty("");
    setMinReward(0);
    setSearch("");
  };

  useEffect(() => {
    const mountedRef = { current: true };

    loadTasks(mountedRef);

    const onTasksChanged = () => {
      if (mountedRef.current) {
        loadTasks(mountedRef);
      }
    };

    window.addEventListener("tasks:changed", onTasksChanged);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("tasks:changed", onTasksChanged);
    };
  }, [mode, tag, normalizedMinReward]);

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

        <label>
          Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">All</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>

        <label>
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, description, creator or tag"
          />
        </label>

        <div className="reward-filter">
          <div className="reward-filter-head">
            <span>Minimum reward</span>
            <strong>{normalizedMinReward}</strong>
          </div>
          <div className="reward-filter-row">
            <input
              type="range"
              min={MIN_REWARD}
              max={MAX_REWARD}
              step="1"
              value={normalizedMinReward}
              onChange={(e) => setMinReward(Math.min(MAX_REWARD, Math.max(MIN_REWARD, Number(e.target.value) || 0)))}
              aria-label="Minimum reward slider"
            />
            <input
              type="number"
              min={MIN_REWARD}
              max={MAX_REWARD}
              step="1"
              value={normalizedMinReward}
              onChange={(e) => setMinReward(Math.min(MAX_REWARD, Math.max(MIN_REWARD, Number(e.target.value) || 0)))}
              placeholder="0"
              inputMode="numeric"
              aria-label="Minimum reward value"
            />
          </div>
          <div className="reward-filter-scale">
            <span>0</span>
            <span>10000</span>
          </div>
        </div>

        <div className="filter-actions">
          <button type="button" className="secondary-button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </section>

      {loading ? (
        <div className="panel">Loading tasks...</div>
      ) : error ? (
        <div className="panel">
          <p className="error">{error}</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="panel">
          <p className="muted">No open tasks match the current filters/search.</p>
        </div>
      ) : (
        <div className="task-grid">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} onTake={handleTake} takingId={takingId} />
          ))}
        </div>
      )}
    </div>
  );
}
