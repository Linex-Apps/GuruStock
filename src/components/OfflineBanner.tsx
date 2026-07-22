import { useState, useEffect } from "react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setOffline(false);
    }
    function handleOffline() {
      setOffline(true);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="sticky top-0 z-50 bg-amber-600 text-white text-center py-2 px-4 text-sm font-medium shadow-md">
      <span className="inline-flex items-center gap-2">
        <span role="img" aria-label="offline">📡</span>
        You&rsquo;re offline &mdash; using cached data
      </span>
    </div>
  );
}
