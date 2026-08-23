const configuredApiUrl = (import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');

// In dev mode, the Vite proxy forwards /api/* to the local Django backend.
// In production (Vercel), rewrites in vercel.json proxy API paths to Cloud Run
// on the same origin, so an empty base URL (same-origin) works.
// For other deployments, set VITE_API_URL to the backend URL.
export const API_BASE_URL = (
  configuredApiUrl ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8002' : '')
).replace(/\/+$/, '');

export function apiUrl(input) {
  const value = typeof input === 'string' ? input : input?.url;
  if (!value) return value;
  if (/^https?:\/\//.test(value)) return value;
  if (value.startsWith('/api/')) return `${API_BASE_URL}${value}`;
  return value;
}

export function installApiFetch() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = apiUrl(input);
    const options = url === input || (typeof input !== 'string' && url === input.url)
      ? init
      : { ...init, credentials: init?.credentials === 'omit' ? 'omit' : 'include' };
    return nativeFetch(url, options);
  };
}
