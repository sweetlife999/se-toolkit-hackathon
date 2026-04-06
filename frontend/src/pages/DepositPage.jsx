import { Link } from "react-router-dom";

const SUPPORT_TELEGRAM_URL = "https://t.me/DirectorOfSweetLife";

export default function DepositPage() {
  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Finance</p>
          <h1>Deposit</h1>
        </div>
        <nav className="topbar-nav">
          <Link to="/profile">Profile</Link>
          <Link to="/tasks">Feed</Link>
        </nav>
      </header>

      <section className="panel">
        <p className="muted">To continue with deposit, contact support directly.</p>
        <h2>Message @DirectorOfSweetLife</h2>

        <div className="actions">
          <a className="secondary-link" href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noreferrer">
            Open Telegram profile
          </a>
          <Link className="secondary-link" to="/profile">
            Back to profile
          </Link>
        </div>
      </section>
    </div>
  );
}

