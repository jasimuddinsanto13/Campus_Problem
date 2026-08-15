import { useState } from 'react';
import { initialsOf } from '../context/UserContext';

/**
 * Circular avatar: shows the profile photo, falling back to initials when
 * there is no photo, or when the photo fails to load (e.g. the media file
 * was deleted or moved — the DB reference then points at a missing file).
 *
 * Usage: <Avatar name="Jasim Uddin Santo" src="/media/...png" className="h-10 w-10 text-[13px]" />
 */
export default function Avatar({ name, src, className = '', imgClassName = '' }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-ink font-bold text-white ${className}`}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover ${imgClassName}`}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
