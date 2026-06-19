// Social vs case-related competency tagging — the single source of truth for
// which dimensions a "social rater" (support staff: paralegal, legal secretary,
// typist) is permitted to score. This is Stage 2 of the roadmap.
//
// We tag via the existing Competency.category instead of adding a new column:
// the firm's 8-competency framework already groups into Technical / Client /
// Business / Behavioural, and the Behavioural group *is* the social/soft set
// (Communication, Mentorship & Teamwork, Ethics & Professional Responsibility).
//
// To change which competencies support staff may rate, edit SOCIAL_CATEGORIES
// below — routes, the seed and the form all derive from it, nothing else.

export const SOCIAL_CATEGORIES = ["Behavioural"];

// True when a competency row (or any { category }) is a social/soft dimension.
export function isSocialCompetency(competency) {
  return !!competency && SOCIAL_CATEGORIES.includes(competency.category);
}

// Prisma `where` fragment selecting only the social/soft competencies.
export const socialCategoryWhere = { category: { in: SOCIAL_CATEGORIES } };
