import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createTask } from "../api/tasks";

const EMPTY_TASK = {
  title: "",
  description: "",
  reward: "",
  difficulty: "medium",
  estimatedMinutes: "",
  mode: "online",
};

function normalizeTagsInput(value) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export default function TaskCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_TASK);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);
  const [error, setError] = useState("");
  const [validationIssues, setValidationIssues] = useState([]);
  const [loading, setLoading] = useState(false);

  const canAddTag = useMemo(() => tagInput.trim().length > 0, [tagInput]);

  const addTags = () => {
    const nextTags = normalizeTagsInput(tagInput);
    if (!nextTags.length) {
      return;
    }

    setTags((current) => Array.from(new Set([...current, ...nextTags])));
    setTagInput("");
  };

  const removeTag = (tagToRemove) => {
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setValidationIssues([]);
    setLoading(true);

    try {
      const created = await createTask({
        title: form.title.trim() || null,
        description: form.description.trim(),
        reward: Number(form.reward),
        difficulty: form.difficulty,
        estimated_minutes: Number(form.estimatedMinutes),
        mode: form.mode,
        tags,
      });
      navigate(`/tasks/${created.id}`);
    } catch (err) {
      if (Array.isArray(err.issues) && err.issues.length > 0) {
        setValidationIssues(err.issues);
        setError("Please fix the fields below.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Tasks</p>
          <h1>Create task</h1>
        </div>
        <nav className="topbar-nav">
          <Link to="/tasks">Feed</Link>
          <Link to="/tasks/taken">Taken tasks</Link>
          <Link to="/tasks/given">Given tasks</Link>
          <Link to="/profile">Profile</Link>
        </nav>
      </header>

      <form className="panel form-panel" onSubmit={onSubmit}>
        <label>
          Title
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Optional short title"
            maxLength={120}
          />
        </label>

        <label>
          Description
          <textarea
            rows="6"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Describe what needs to be done"
            required
          />
        </label>

        <div className="form-grid">
          <label>
            Reward
            <input
              type="number"
              min="1"
              step="1"
              value={form.reward}
              onChange={(e) => setForm({ ...form, reward: e.target.value })}
              placeholder="100"
              inputMode="numeric"
              required
            />
          </label>

          <label>
            Difficulty
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label>
            Estimated minutes
            <input
              type="number"
              min="1"
              step="1"
              value={form.estimatedMinutes}
              onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
              placeholder="30"
              required
            />
          </label>

          <label>
            Mode
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </label>
        </div>

        <label>
          Tags
          <div className="tag-entry">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTags();
                }
              }}
              placeholder="Add tags separated by commas"
            />
            <button type="button" onClick={addTags} disabled={!canAddTag}>
              Add tag
            </button>
          </div>
        </label>

        <div className="chip-list">
          {tags.length ? (
            tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
                <button type="button" className="chip-remove" onClick={() => removeTag(tag)}>
                  ×
                </button>
              </span>
            ))
          ) : (
            <p className="muted">No tags selected yet.</p>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        {validationIssues.length > 0 && (
          <ul className="error-list">
            {validationIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}

        <div className="actions">
          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}

