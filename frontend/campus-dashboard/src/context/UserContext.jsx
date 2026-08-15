import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const UserContext = createContext(null);

const FALLBACK = {
  id: null,
  fullName: 'Santo',
  username: 'santoAdmin',
  email: '',
  role: null,
  department: '',
  batch: '',
  section: '',
  profilePicture: null,
};

/** "Jasim Uddin Santo" -> "JU" (fallback "SA" for empty input). */
export function initialsOf(name) {
  return (
    (name || '')
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'SA'
  );
}

export function UserProvider({ children }) {
  const [user, setUser] = useState({ ...FALLBACK, loading: true });

  // On page load, fetch the persisted profile from GET /api/profile/.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/profile/', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const p = data && data.profile;
        setUser({
          id: (p && p.id) || null,
          fullName: (p && p.full_name) || FALLBACK.fullName,
          username: (p && p.username) || FALLBACK.username,
          email: (p && p.email) || '',
          role: (p && p.role) || null,
          department: (p && p.department) || '',
          batch: (p && p.batch) || '',
          section: (p && p.section) || '',
          profilePicture: (p && p.profile_picture) || null,
          loading: false,
        });
      })
      .catch(() => {
        if (!cancelled) setUser((prev) => ({ ...prev, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Called by the Settings page after a successful save so the sidebar and
  // header avatars update immediately, without a browser refresh.
  const updateProfile = useCallback((patch) => {
    setUser((prev) => ({ ...prev, ...patch, loading: false }));
  }, []);

  const value = useMemo(
    () => ({ ...user, initials: initialsOf(user.fullName), updateProfile }),
    [user, updateProfile],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
