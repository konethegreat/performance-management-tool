import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import {
  findPosition,
  isSelfRegisterable,
  selfRegisterablePositions,
  capabilitiesForUser,
} from "../lib/positions.js";

const router = Router();

// Positions a new user may pick at sign-up (grouped for the dropdown).
router.get("/positions", (_req, res) => {
  res.json({ groups: selfRegisterablePositions() });
});

// Self-service sign-up. The chosen position decides the permission tier and
// capabilities — leadership/firm-wide and client positions are NOT self-
// registerable (an admin provisions those).
router.post("/register", async (req, res) => {
  const { email, password, firstName, lastName, position } = req.body || {};
  if (!email || !password || !firstName || !lastName || !position) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const pos = findPosition(position);
  if (!pos) return res.status(400).json({ error: "Unknown position" });
  if (!isSelfRegisterable(position)) {
    return res.status(403).json({ error: "That position is assigned by an administrator, not at sign-up" });
  }

  const normEmail = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normEmail } });
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const user = await prisma.user.create({
    data: {
      email: normEmail,
      passwordHash: bcrypt.hashSync(password, 10),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: pos.tier,          // tier derived from the position
      title: pos.label,        // human label
      position: pos.key,       // catalog key → capabilities
    },
  });

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.active) return res.status(401).json({ error: "Invalid credentials" });

  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { practiceGroup: true, manager: true },
  });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ user: publicUser(user) });
});

function publicUser(u) {
  return {
    id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName,
    role: u.role, title: u.title, position: u.position,
    capabilities: capabilitiesForUser(u), // derived: position-first, role fallback
    practiceGroupId: u.practiceGroupId,
    managerId: u.managerId, clientAccount: u.clientAccount,
    practiceGroup: u.practiceGroup ? { id: u.practiceGroup.id, name: u.practiceGroup.name } : undefined,
  };
}

export default router;
