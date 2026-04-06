import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/ProfilePage";
import TaskCreatePage from "./pages/TaskCreatePage";
import TaskDetailsPage from "./pages/TaskDetailsPage";
import TaskFeedPage from "./pages/TaskFeedPage";
import TakenTasksPage from "./pages/TakenTasksPage";
import GivenTasksPage from "./pages/GivenTasksPage";
import DepositPage from "./pages/DepositPage";
import WithdrawalPage from "./pages/WithdrawalPage";
import { getToken } from "./api/auth";
import NotificationCenter from "./components/NotificationCenter";
import AuthTopBar from "./components/AuthTopBar";

function ProtectedRoute({ children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <AuthTopBar />
      {children}
      <NotificationCenter />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/deposit"
        element={
          <ProtectedRoute>
            <DepositPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/withdrawal"
        element={
          <ProtectedRoute>
            <WithdrawalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <TaskFeedPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks/new"
        element={
          <ProtectedRoute>
            <TaskCreatePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks/taken"
        element={
          <ProtectedRoute>
            <TakenTasksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks/given"
        element={
          <ProtectedRoute>
            <GivenTasksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks/:taskId"
        element={
          <ProtectedRoute>
            <TaskDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/tasks" replace />} />
    </Routes>
  );
}
