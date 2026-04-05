import { useEffect, useRef } from "react";

export function useTasksChangedRefresh(onRefresh) {
  const refreshRef = useRef(onRefresh);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleTasksChanged = () => {
      refreshRef.current?.();
    };

    window.addEventListener("tasks:changed", handleTasksChanged);
    return () => window.removeEventListener("tasks:changed", handleTasksChanged);
  }, []);
}

