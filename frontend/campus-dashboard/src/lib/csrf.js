export function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Django's CSRF token, read from the csrftoken cookie (set on login). */
export function getCsrfToken() {
  return getCookie('csrftoken');
}
