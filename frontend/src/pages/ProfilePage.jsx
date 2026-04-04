import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
        navigate("/login");
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
    navigate("/login");
  };

  if (loading) {
    return <div className="auth-wrapper">Loading profile...</div>;
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h1>Your profile</h1>
        <p>Telegram: {user?.telegram_username}</p>
        <p>User ID: {user?.id}</p>
        <button onClick={onLogout}>Logout</button>
      </div>
    </div>
  );
}
