// Position catalog — the single source of truth that maps every firm position
// onto a permission TIER (the Role enum) plus capability flags. This is how the
// system supports many job titles without a bespoke dashboard per title: the
// position decides the rights, the Role enum stays a small set of capability
// tiers, and `title` is just the human label.
//
// Capabilities:
//   firmWide        — sees all departments / firm-wide analytics (leadership/admin)
//   manageReports   — owns & drafts reports for the people who report to them
//   reviewSubject   — is themselves a subject of 360 performance reviews
//   socialRaterOnly — may only give feedback on social/soft competencies, never
//                     case-related ones (support staff rating attorneys)
//
// `tier` must be one of the Role enum values: ADMIN | MANAGER | ATTORNEY | SUPPORT | CLIENT.

export const CAP_DEFAULTS = {
  firmWide: false,
  manageReports: false,
  reviewSubject: false,
  socialRaterOnly: false,
};

// group is for the sign-up dropdown's optgroups; seniorityRank orders people
// (higher = more senior) for "who can review whom" and display ordering.
export const POSITIONS = [
  // ── Leadership (admin-provisioned, not self-registerable) ──
  { key: "managing_partner", label: "Managing Partner", group: "Leadership", tier: "ADMIN", seniorityRank: 100, capabilities: { firmWide: true, manageReports: true, reviewSubject: true } },
  { key: "chief_executive",  label: "Chief Executive",  group: "Leadership", tier: "ADMIN", seniorityRank: 99,  capabilities: { firmWide: true, manageReports: true } },
  { key: "chairperson",      label: "Chairperson",      group: "Leadership", tier: "ADMIN", seniorityRank: 98,  capabilities: { firmWide: true } },
  { key: "administrator",    label: "System Administrator / HR", group: "Leadership", tier: "ADMIN", seniorityRank: 95, capabilities: { firmWide: true, manageReports: true } },

  // ── Supervisors (manage reports; reviewed themselves) ──
  { key: "senior_partner",     label: "Senior Partner",     group: "Partners & Directors", tier: "MANAGER", seniorityRank: 90, capabilities: { manageReports: true, reviewSubject: true } },
  { key: "partner",            label: "Partner",            group: "Partners & Directors", tier: "MANAGER", seniorityRank: 85, capabilities: { manageReports: true, reviewSubject: true } },
  { key: "director",           label: "Director",           group: "Partners & Directors", tier: "MANAGER", seniorityRank: 84, capabilities: { manageReports: true, reviewSubject: true } },
  { key: "associate_director", label: "Associate Director", group: "Partners & Directors", tier: "MANAGER", seniorityRank: 80, capabilities: { manageReports: true, reviewSubject: true } },
  { key: "junior_partner",     label: "Junior Partner",     group: "Partners & Directors", tier: "MANAGER", seniorityRank: 78, capabilities: { manageReports: true, reviewSubject: true } },

  // ── Professionals (reviewed; the core attorney population) ──
  { key: "consultant",        label: "Consultant",        group: "Attorneys", tier: "ATTORNEY", seniorityRank: 70, capabilities: { reviewSubject: true } },
  { key: "senior_associate",  label: "Senior Associate",  group: "Attorneys", tier: "ATTORNEY", seniorityRank: 60, capabilities: { reviewSubject: true } },
  { key: "associate",         label: "Associate",         group: "Attorneys", tier: "ATTORNEY", seniorityRank: 50, capabilities: { reviewSubject: true } },
  { key: "candidate_attorney",label: "Candidate Attorney",group: "Attorneys", tier: "ATTORNEY", seniorityRank: 40, capabilities: { reviewSubject: true } },

  // ── Support staff (rate colleagues on social/soft dimensions only) ──
  { key: "paralegal",       label: "Paralegal",        group: "Support Staff", tier: "SUPPORT", seniorityRank: 30, capabilities: { socialRaterOnly: true } },
  { key: "legal_secretary", label: "Legal Secretary",  group: "Support Staff", tier: "SUPPORT", seniorityRank: 25, capabilities: { socialRaterOnly: true } },
  { key: "typist",          label: "Typist",           group: "Support Staff", tier: "SUPPORT", seniorityRank: 20, capabilities: { socialRaterOnly: true } },

  // ── External ──
  { key: "client", label: "Client", group: "External", tier: "CLIENT", seniorityRank: 0, capabilities: {} },
];

const BY_KEY = new Map(POSITIONS.map((p) => [p.key, p]));

export function findPosition(key) {
  return key ? BY_KEY.get(key) || null : null;
}

export function tierForPosition(key) {
  const p = findPosition(key);
  return p ? p.tier : null;
}

// Capability fallback by Role tier, for users created before positions existed.
function capabilitiesForRole(role) {
  switch (role) {
    case "ADMIN":    return { ...CAP_DEFAULTS, firmWide: true, manageReports: true };
    case "MANAGER":  return { ...CAP_DEFAULTS, manageReports: true, reviewSubject: true };
    case "ATTORNEY": return { ...CAP_DEFAULTS, reviewSubject: true };
    case "SUPPORT":  return { ...CAP_DEFAULTS, socialRaterOnly: true };
    case "CLIENT":   return { ...CAP_DEFAULTS };
    default:         return { ...CAP_DEFAULTS };
  }
}

// Resolve a user's capabilities: prefer their position, fall back to their role.
export function capabilitiesForUser(user) {
  const p = findPosition(user.position);
  if (p) return { ...CAP_DEFAULTS, ...p.capabilities };
  return capabilitiesForRole(user.role);
}

// Positions a person may choose at sign-up — excludes firm-wide/leadership and
// external client (those are provisioned by an admin), grouped for the dropdown.
export function selfRegisterablePositions() {
  const allowed = POSITIONS.filter((p) => !p.capabilities.firmWide && p.tier !== "CLIENT");
  const groups = {};
  for (const p of allowed) {
    (groups[p.group] ||= []).push({ key: p.key, label: p.label, tier: p.tier });
  }
  return Object.entries(groups).map(([group, positions]) => ({ group, positions }));
}

export function isSelfRegisterable(key) {
  const p = findPosition(key);
  return !!p && !p.capabilities.firmWide && p.tier !== "CLIENT";
}
