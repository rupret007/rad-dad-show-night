"use client";

import { useState } from "react";

export function PrintButton() {
  return (
    <button className="button button-quiet" type="button" onClick={() => window.print()}>
      Print page
    </button>
  );
}

export function ShareButton() {
  const [label, setLabel] = useState("Share live page");

  async function share() {
    const payload = {
      title: "Rad Dad + Friends | Show Night",
      text: "Current run of show and set order for Rad Dad + Friends.",
      url: window.location.href,
    };

    if (navigator.share) {
      await navigator.share(payload);
      return;
    }

    await navigator.clipboard.writeText(window.location.href);
    setLabel("Link copied");
    window.setTimeout(() => setLabel("Share live page"), 1800);
  }

  return <button className="button button-share" type="button" onClick={share}>{label}</button>;
}
