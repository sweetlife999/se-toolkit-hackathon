import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, setToken } from "../api/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [telegramUsername, setTelegramUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await login(telegramUsername, password);
      setToken(data.access_token);
      navigate("/profile");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Login to VibErrands</h1>
        <label>Telegram username</label>
        <input
          value={telegramUsername}
          onChange={(e) => setTelegramUsername(e.target.value)}
          placeholder="@username"
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

        {error && <p className="error">{error}</p>}

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
