import { Request, Response, NextFunction } from "express";

export function securityMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only activate when DT_SECURITY=true
  if (process.env.DT_SECURITY !== "true") return next();

  const raw = req.headers["x-api-key"] ?? req.headers["authorization"];
  let token: string | undefined;
  if (Array.isArray(raw)) token = raw[0];
  else if (typeof raw === "string") token = raw;

  if (token?.startsWith("Bearer ")) token = token.replace(/^Bearer\s+/i, "");

  const expected = process.env.LOAD_TEST_API_KEY;

  if (!expected) {
    console.warn(
      "[security] DT_SECURITY=true but LOAD_TEST_API_KEY is not set — blocking all requests",
    );
    res.status(500).json({ error: "Server misconfiguration: LOAD_TEST_API_KEY missing" });
    return;
  }

  if (token !== expected) {
    res.status(401).json({ error: "Unauthorized: invalid or missing x-api-key" });
    return;
  }

  next();
}
