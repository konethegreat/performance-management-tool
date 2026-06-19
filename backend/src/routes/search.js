// Global search behind the ⌘K command bar. Returns people and reviews the caller
// is allowed to see (same role scoping as the dashboards), capped for a quick palette.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const name = (u) => `${u.firstName} ${u.lastName}`;

router.get("/", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (q.length < 2 || req.user.role === "CLIENT") return res.json({ people: [], reviews: [] });
  const role = req.user.role;

  // People: managers see reports + self; ADMIN/ATTORNEY see active colleagues. No clients.
  const peopleWhere = {
    active: true,
    role: { not: "CLIENT" },
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
    ],
  };
  if (role === "MANAGER") peopleWhere.AND = [{ OR: [{ managerId: req.user.id }, { id: req.user.id }] }];
  const people = await prisma.user.findMany({ where: peopleWhere, take: 6, orderBy: { lastName: "asc" } });

  // Reviews the caller can access, matched on subject name or cycle.
  const scope = role === "ATTORNEY" ? { subjectId: req.user.id } : role === "MANAGER" ? { managerId: req.user.id } : {};
  const reviews = await prisma.performanceReview.findMany({
    where: {
      ...scope,
      OR: [
        { subject: { firstName: { contains: q, mode: "insensitive" } } },
        { subject: { lastName: { contains: q, mode: "insensitive" } } },
        { cycle: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    include: { subject: true, cycle: true },
    take: 6,
    orderBy: { updatedAt: "desc" },
  });

  // Each person jumps to their latest accessible review (or /me for yourself).
  const peopleOut = [];
  for (const p of people) {
    let link = p.id === req.user.id ? "/me" : null;
    if (!link) {
      const rvWhere = { subjectId: p.id };
      if (role === "MANAGER") rvWhere.managerId = req.user.id;
      const rv = await prisma.performanceReview.findFirst({ where: rvWhere, orderBy: { updatedAt: "desc" }, select: { id: true } });
      if (rv) link = `/reviews/${rv.id}`;
    }
    peopleOut.push({ id: p.id, name: name(p), title: p.title, link });
  }

  res.json({
    people: peopleOut,
    reviews: reviews.map((r) => ({ id: r.id, subject: name(r.subject), cycle: r.cycle.name, status: r.status, link: `/reviews/${r.id}` })),
  });
});

export default router;
