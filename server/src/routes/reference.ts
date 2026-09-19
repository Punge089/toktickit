import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";

// Issue 24 — reference data (api-spec.md §1-2 of docs/lab-02). No auth
// (Categories/Related Systems are visible to every authenticated role),
// only isActive rows, safe 500 on DB failure.
//
// Issue 64 — GET /api/dev-requesters is removed entirely (BR-39): it
// existed only to power the Development Requester selector, which real
// Login replaces. Calling the old path now returns Express's default 404,
// verified by a regression test rather than left undocumented.
export const referenceRouter = Router();

referenceRouter.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(categories);
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Unable to load categories." });
  }
});

referenceRouter.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const relatedSystems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(relatedSystems);
  } catch {
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Unable to load related systems." });
  }
});
