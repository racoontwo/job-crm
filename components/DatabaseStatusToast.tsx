"use client";

import { useEffect, useState } from "react";
import { getDatabaseStatus } from "@/lib/actions/actions";

export default function DatabaseStatusToast() {
  // null = still loading / deliberately not configured (nothing to report —
  // MONGODB_URI unset means local-only mode is the current choice, not a
  // problem). Only "configured but failing to connect" is worth a warning.
  const [connected, setConnected] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDatabaseStatus().then((status) => {
      if (cancelled || !status.configured) return;
      setConnected(status.connected);
      setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (connected === null || !visible) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${
        connected
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${connected ? "bg-green-500" : "bg-amber-500"}`} />
      <span>
        {connected
          ? "Connected to MongoDB — showing live data"
          : "MongoDB not connected — showing local data"}
      </span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="ml-1 opacity-60 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
