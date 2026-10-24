// DOM まわりの小さな道具。

export const $ = (id) => document.getElementById(id);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const button = (className, text, onclick) => Object.assign(el("button", className, text), { type: "button", onclick });
