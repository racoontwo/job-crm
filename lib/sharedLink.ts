// Share menus rarely send a bare URL — LinkedIn sends "Check out this job at
// Acme: https://...", others put the page title on its own line first. Pull
// out the first http(s) URL and keep the rest as context.
//
// capture/api/save.js has its own copy of this (it deploys on its own,
// without this repo's code); keep the two in sync.

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

export function parseSharedLink(text: string): { url: string; sharedText: string | null } | null {
  const match = text.match(URL_PATTERN);
  if (!match) return null;

  // Trailing punctuation from the surrounding sentence isn't part of the URL.
  const url = match[0].replace(/[).,;!?]+$/, "");
  try {
    new URL(url);
  } catch {
    return null;
  }

  const rest = text.replace(match[0], "").trim();
  return { url, sharedText: rest || null };
}
