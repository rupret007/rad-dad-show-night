"use client";

export function PrintButton() {
  return (
    <button className="button button-quiet" type="button" onClick={() => window.print()}>
      Print page
    </button>
  );
}
