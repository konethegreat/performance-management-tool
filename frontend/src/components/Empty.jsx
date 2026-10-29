// Empty-state block — a calm, centered placeholder with an optional icon + action.
export function Empty({ title, hint, action, icon }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon || (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 10h8M8 14h5" />
          </svg>
        )}
      </div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
