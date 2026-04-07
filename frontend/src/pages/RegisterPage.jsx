import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [telegramUsername, setTelegramUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [validationIssues, setValidationIssues] = useState([]);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setValidationIssues([]);
    setLoading(true);

    try {
      await register({ telegram_username: telegramUsername, password });
      navigate("/login", { state: { registrationSuccess: true } });
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
    <div className="auth-wrapper">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Create VibErrands account</h1>
        <label>Telegram handle</label>
        <input
          value={telegramUsername}
          onChange={(e) => setTelegramUsername(e.target.value)}
          placeholder="@username"
          pattern="^@[A-Za-z][A-Za-z0-9_]{2,62}$"
          title="Handle must start with @, then a letter, and contain only letters, numbers, or underscores"
          required
        />
        <small>
          Use your handle, for example @username (the first character after @ must
          be a letter).
        </small>

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimum 6 characters"
          minLength={6}
          required
        />

        {error && <p className="error">{error}</p>}
        {validationIssues.length > 0 && (
          <ul className="error-list">
            {validationIssues.map((issue, index) => (
              <li key={`${issue}-${index}`}>{issue}</li>
            ))}
          </ul>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Register"}
        </button>

        <p>
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </form>
    </div>
  );
}
