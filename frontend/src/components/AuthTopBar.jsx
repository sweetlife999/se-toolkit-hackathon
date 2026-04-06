import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchMe } from "../api/auth";

export default function AuthTopBar() {
  const location = useLocation();
  const [balance, setBalance] = useState(null);

  const loadBalance = useCallback(async () => {
    try {
      const profile = await fetchMe();
      setBalance(Number(profile?.balance ?? 0));
    } catch {
      // Ignore transient errors to keep the UI stable.
    }
  }, []);

  useEffect(() => {
    loadBalance();
  }, [loadBalance, location.pathname]);

  useEffect(() => {
    const onTasksChanged = () => {
      loadBalance();
    };

    window.addEventListener("tasks:changed", onTasksChanged);
    return () => {
      window.removeEventListener("tasks:changed", onTasksChanged);
    };
  }, [loadBalance]);

  return (
    <div className="auth-global-topbar-wrap">
      <div className="auth-global-topbar">
        <Link to="/tasks" className="brand-logo" aria-label="VibErrands home">
          VibErrands
        </Link>
        <div className="topbar-balance">Balance: {balance == null ? "..." : balance}</div>
      </div>
    </div>
  );
}

