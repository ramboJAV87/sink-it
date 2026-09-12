// RN's JS engine (Hermes) doesn't provide btoa/atob. Our share-code payload is always
// plain ASCII JSON (numbers, feature keys), so a minimal base64 codec is enough — no
// need for the UTF-8 escape dance the browser prototype used.

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64Encode(input: string): string {
  let output = "";
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = i + 1 < input.length ? input.charCodeAt(i + 1) : NaN;
    const c = i + 2 < input.length ? input.charCodeAt(i + 2) : NaN;
    const chunk = (a << 16) | ((isNaN(b) ? 0 : b) << 8) | (isNaN(c) ? 0 : c);
    output += CHARS[(chunk >> 18) & 63];
    output += CHARS[(chunk >> 12) & 63];
    output += isNaN(b) ? "=" : CHARS[(chunk >> 6) & 63];
    output += isNaN(c) ? "=" : CHARS[chunk & 63];
  }
  return output;
}

export function base64Decode(input: string): string {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "");
  let output = "";
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = CHARS.indexOf(clean[i]);
    const e2 = CHARS.indexOf(clean[i + 1]);
    const e3 = clean[i + 2] !== undefined ? CHARS.indexOf(clean[i + 2]) : -1;
    const e4 = clean[i + 3] !== undefined ? CHARS.indexOf(clean[i + 3]) : -1;
    const chunk = ((e1 < 0 ? 0 : e1) << 18) | ((e2 < 0 ? 0 : e2) << 12) | ((e3 < 0 ? 0 : e3) << 6) | (e4 < 0 ? 0 : e4);
    output += String.fromCharCode((chunk >> 16) & 255);
    if (e3 >= 0) output += String.fromCharCode((chunk >> 8) & 255);
    if (e4 >= 0) output += String.fromCharCode(chunk & 255);
  }
  return output;
}
