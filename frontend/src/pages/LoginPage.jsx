import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login, setToken } from "../api/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [telegramUsername, setTelegramUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [validationIssues, setValidationIssues] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (location.state?.registrationSuccess) {
      setSuccessMessage("Profile created successfully! Now, login.");
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setValidationIssues([]);
    setLoading(true);

    try {
      const data = await login(telegramUsername, password);
      setToken(data.access_token);
      navigate("/tasks");
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
        <h1>Login to VibErrands</h1>
        <label>Telegram handle</label>
        <input
          value={telegramUsername}
          onChange={(e) => setTelegramUsername(e.target.value)}
          placeholder="@username"
          pattern="^@[A-Za-z0-9_]{3,63}$"
          title="Handle must start with @ and contain only letters, numbers, or underscores"
          required
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          required
        />

        {successMessage && <p className="admin-notice">{successMessage}</p>}
        {error && <p className="error">{error}</p>}
        {validationIssues.length > 0 && (
          <ul className="error-list">
            {validationIssues.map((issue, index) => (
              <li key={`${issue}-${index}`}>{issue}</li>
            ))}
          </ul>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Login"}
        </button>

        <p>
          New here? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  );
}
