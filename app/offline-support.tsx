"use client";

import { useEffect } from "react";
import { offlineReadyKey } from "../lib/show-read-integrity";

const READY_EVENT = "rad-dad-offline-ready";

export default function OfflineSupport() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;

    async function prepareOfflineCopy() {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const registration = await navigator.serviceWorker.ready;
        if (!active || !registration.active) return;

        const showRoot =
          document.querySelector<HTMLElement>("[data-show-slug]");
        const showSlug =
          showRoot?.dataset.showSlug ??
          new URL(window.location.href).searchParams.get("show");
        if (!showSlug) return;
        if (showRoot?.dataset.showSource !== "database") return;

        const showQuery = encodeURIComponent(showSlug);
        const resources = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((value) => {
            try {
              const url = new URL(value);
              return (
                url.origin === window.location.origin &&
                !url.pathname.startsWith("/show-control") &&
                !url.pathname.startsWith("/api/")
              );
            } catch {
              return false;
            }
          });
        const urls = Array.from(
          new Set([
            `${window.location.origin}/?show=${showQuery}`,
            `${window.location.origin}/?show=${showQuery}&practice=1`,
            `${window.location.origin}/api/show?show=${showQuery}`,
            ...resources,
          ]),
        );

        const result = await sendCacheMessage(registration.active, urls);
        if (!active || !result.ready) return;
        const cachedAt = new Date().toISOString();
        localStorage.setItem(offlineReadyKey(showSlug), cachedAt);
        window.dispatchEvent(
          new CustomEvent(READY_EVENT, { detail: { showSlug, cachedAt } }),
        );
        void navigator.storage?.persist?.();
      } catch {
        // The local song snapshot still works if installation is blocked.
      }
    }

    const schedule = window.setTimeout(() => void prepareOfflineCopy(), 600);
    const refreshWhenOnline = () => void prepareOfflineCopy();
    window.addEventListener("online", refreshWhenOnline);
    return () => {
      active = false;
      window.clearTimeout(schedule);
      window.removeEventListener("online", refreshWhenOnline);
    };
  }, []);

  return null;
}

function sendCacheMessage(worker: ServiceWorker, urls: string[]) {
  return new Promise<{ ready: boolean }>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve({ ready: false }), 15000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      resolve({ ready: Boolean(event.data?.ready) });
    };
    worker.postMessage({ type: "CACHE_SHOW", urls }, [channel.port2]);
  });
}
