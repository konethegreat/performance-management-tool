// Deterministic avatar via DiceBear (free, no key). Seeds with a stable opaque
// value (user id where available, else name) so the same person always gets the
// same avatar. Falls back to a monogram if DiceBear is unreachable.
//
// Swap STYLE to "initials" for clean monograms instead of illustrated faces.
import { useState } from "react";

const STYLE = "notionists-neutral";

export function Avatar({ seed, name, size = 36 }) {
  const [failed, setFailed] = useState(false);
  const s = encodeURIComponent(seed || name || "user");
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

  if (failed) {
    return (
      <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
        {initial}
      </span>
    );
  }
  return (
    <img
      className="avatar"
      src={`https://api.dicebear.com/9.x/${STYLE}/svg?seed=${s}&radius=50&backgroundColor=1b2440,3d5878,b08d57`}
      alt={name || "avatar"}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
