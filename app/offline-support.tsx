"use client";

import { useEffect } from "react";
import { canConfirmOfflineReady, offlineReadyKey } from "../lib/show-read-integrity";

const READY_EVENT = "rad-dad-offline-ready";

export default function OfflineSupport() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let preparing = false;
    let prepareAgain = false;

    async function prepareOfflineCopy() {
      if (!active) return;
      if (preparing) {
        prepareAgain = true;
        return;
      }
      preparing = true;
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

        // A refresh can replace HTML before all of its new assets are saved.
        // Retire the previous readiness claim until this attempt completes.
        localStorage.removeItem(offlineReadyKey(showSlug));
        window.dispatchEvent(
          new CustomEvent(READY_EVENT, { detail: { showSlug, cachedAt: null } }),
        );

        const showQuery = encodeURIComponent(showSlug);
        // Resource timing may omit early loads when its buffer fills. Include
        // document scripts/styles and their preloads even without timing entries.
        const documentAssets = Array.from(
          document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
            'script[src], link[rel~="stylesheet"][href], link[rel~="modulepreload"][href], link[rel~="preload"][as="script"][href], link[rel~="preload"][as="style"][href]',
          ),
          (element) => element instanceof HTMLScriptElement ? element.src : element.href,
        );
        const resources = [
          ...documentAssets,
          ...performance.getEntriesByType("resource").map((entry) => entry.name),
        ]
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
        // A queued refresh supersedes this result before it can announce or
        // persist readiness, even while preparations remain serialized.
        if (!active || prepareAgain || !result.ready) return;
        const cachedAt = new Date().toISOString();
        localStorage.setItem(offlineReadyKey(showSlug), cachedAt);
        window.dispatchEvent(
          new CustomEvent(READY_EVENT, { detail: { showSlug, cachedAt } }),
        );
        void navigator.storage?.persist?.();
      } catch {
        // The local song snapshot still works if installation is blocked.
      } finally {
        // Serialize client preparations and coalesce online events so an older
        // success cannot restore readiness during the next attempt.
        preparing = false;
        if (active && prepareAgain) {
          prepareAgain = false;
          void prepareOfflineCopy();
        }
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
      resolve({ ready: canConfirmOfflineReady(event.data) });
    };
    worker.postMessage({ type: "CACHE_SHOW", urls }, [channel.port2]);
  });
}
