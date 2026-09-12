"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { api } from "@/lib/supabase/rpc";
import { offsetIsStale, recordOffsetSample } from "./clock";

/**
 * Re-checks the server clock when the tab comes back to the foreground.
 *
 * A laptop that slept for six hours wakes with a device clock that may have
 * drifted or been corrected. Measuring again on return keeps the displayed
 * number honest without polling while nobody is looking.
 */
export function useClockSync(): void {
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      if (!offsetIsStale()) return;
      const sentAt = Date.now();
      try {
        const serverTime = await api.serverNow(supabaseBrowser());
        if (cancelled) return;
        recordOffsetSample({
          sentAt,
          receivedAt: Date.now(),
          serverTime: new Date(serverTime).getTime(),
        });
      } catch {
        // Offline, or the request failed. The previous offset still stands,
        // and elapsed time keeps rendering correctly from it.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };

    void sync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, []);
}
