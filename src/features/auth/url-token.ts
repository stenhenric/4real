export function scrubSensitiveTokenFromCurrentUrl(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) {
    return;
  }

  const url = new URL(window.location.href);
  if (!url.searchParams.has('token')) {
    return;
  }

  url.searchParams.delete('token');
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
}
