import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearToken, fetchMe } from "../api/auth";

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetchMe()
      .then((data) => {
        if (mounted) {
          setUser(data);
        }
      })
      .catch(() => {
        clearToken();
        navigate("/login", { replace: true });
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
        <p>User ID: {user?.id}</p>

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
    </div>
  );
}
