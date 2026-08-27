import { NextFunction, Request, Response } from "express";
import { getPrisma } from "../prisma.js";

// Issue 26 — resolves X-Dev-Requester-Id into req.requester for every
// Requester-scoped endpoint (api-spec.md §0). This is a Lab 2 testing
// mechanism, not authentication — see specification.md BR-05/BR-29.
export interface AuthedRequester {
  id: number;
  fullName: string;
  isActive: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requester?: AuthedRequester;
    }
  }
}

export async function requesterAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("X-Dev-Requester-Id");
  const id = header ? Number(header) : NaN;

  if (!header || !Number.isInteger(id)) {
    res.status(400).json({
      error: "MISSING_REQUESTER",
      message: "X-Dev-Requester-Id header is required",
    });
    return;
  }

  const requester = await getPrisma().requesterUser.findUnique({ where: { id } });

  if (!requester) {
    res.status(400).json({
      error: "UNKNOWN_REQUESTER",
      message: "No Development Requester with that id",
    });
    return;
  }

  if (!requester.isActive) {
    res.status(403).json({
      error: "REQUESTER_INACTIVE",
      message: "This Development Requester is no longer active",
    });
    return;
  }

  req.requester = { id: requester.id, fullName: requester.fullName, isActive: requester.isActive };
  next();
}
