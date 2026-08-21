const configuredApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;

// Automatically use the live Render backend in production if no env var is found.
export const API_BASE_URL = (
  configuredApiUrl || (import.meta.env.DEV ? 'http://127.0.0.1:8002' : 'https://campus-problem.onrender.com')
).replace(/\/+$/, '');

export function apiUrl(input) {
  const value = typeof input === 'string' ? input : input.url;
  if (!value.startsWith('/api/')) return value;
  return `${API_BASE_URL}${value}`;
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
