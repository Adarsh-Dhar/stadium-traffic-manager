import { Router, type IRouter } from "express";
import {
  ValidateTicketBody,
  ScanTicketBody,
  ScaleServerBody,
  StartSimulationBody,
} from "@workspace/api-zod";
import {
  validateTicket,
  scanTicket,
  scaleServer,
  resetSystem,
  aiAnalyze,
  startSimulation,
  stopSimulation,
  getCurrentMetrics,
  getMetricsHistory,
  getAlerts,
  getStadiumCapacity,
  getSimulationStatus,
  getMcpStatus,
} from "../lib/stadium-state.js";
import apiFootball from "../lib/api-football.js";

const router: IRouter = Router();

// POST /ticket/validate
router.post("/ticket/validate", async (req, res): Promise<void> => {
  const parsed = ValidateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const startTime = Date.now();
  const { ticketId } = parsed.data;
  const result = validateTicket(ticketId);

  if (result.overloaded) {
    res.status(503).json({
      error: "Service overloaded",
      metrics: getCurrentMetrics(),
    });
    return;
  }

  const processingTime = Date.now() - startTime;
  res
    .status(result.valid ? 200 : 401)
    .json({ valid: result.valid, processingTime, metrics: getCurrentMetrics() });
});

// POST /ticket/scan
router.post("/ticket/scan", async (req, res): Promise<void> => {
  const parsed = ScanTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ticketId, gate } = parsed.data;
  const result = scanTicket(ticketId, gate);

  res.json({
    success: result.success,
    gate,
    entryTime: new Date().toISOString(),
    totalEntered: result.totalEntered,
  });
});

// GET /stadium/capacity
router.get("/stadium/capacity", async (_req, res): Promise<void> => {
  res.json(getStadiumCapacity());
});

// GET /metrics/current
router.get("/metrics/current", async (_req, res): Promise<void> => {
  res.json(getCurrentMetrics());
});

// GET /metrics/history
router.get("/metrics/history", async (_req, res): Promise<void> => {
  res.json(getMetricsHistory());
});

// GET /metrics/alerts
router.get("/metrics/alerts", async (_req, res): Promise<void> => {
  res.json(getAlerts());
});

// POST /admin/scale
router.post("/admin/scale", async (req, res): Promise<void> => {
  const parsed = ScaleServerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  scaleServer(parsed.data.action);
  const metrics = getCurrentMetrics();

  res.json({
    success: true,
    activeServers: metrics.activeServers,
    metrics,
  });
});

// POST /admin/reset
router.post("/admin/reset", async (_req, res): Promise<void> => {
  resetSystem();
  res.json({ status: "reset" });
});

// POST /admin/ai-analyze
router.post("/admin/ai-analyze", async (_req, res): Promise<void> => {
  const result = aiAnalyze();
  res.json({
    status: result.serversAdded > 0 ? "scaled" : "analyzed",
    analysis: result.analysis,
    actions: result.actions,
    confidence: result.confidence,
    serversAdded: result.serversAdded,
    metricsAfter: getCurrentMetrics(),
  });
});

// POST /simulation/start
router.post("/simulation/start", async (req, res): Promise<void> => {
  const parsed = StartSimulationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { intensity = "medium", durationSeconds = 120 } = parsed.data;
  const status = startSimulation(intensity, durationSeconds);
  const elapsedSeconds = status.startedAt
    ? Math.round((Date.now() - status.startedAt) / 1000)
    : 0;

  res.json({ ...status, elapsedSeconds });
});

// POST /simulation/stop
router.post("/simulation/stop", async (_req, res): Promise<void> => {
  const status = stopSimulation();
  res.json({ ...status, elapsedSeconds: 0 });
});

// GET /simulation/status
router.get("/simulation/status", async (_req, res): Promise<void> => {
  res.json(getSimulationStatus());
});

// GET /metrics/mcp-status
router.get("/metrics/mcp-status", async (_req, res): Promise<void> => {
  res.json(getMcpStatus());
});

// FIFA World Cup 2026 Endpoints

// GET /worldcup/matches - Get all World Cup matches
router.get("/worldcup/matches", async (req, res): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const data = await apiFootball.getWorldCupMatches(
      status as 'live' | 'upcoming' | 'finished' | undefined
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch World Cup matches" });
  }
});

// GET /worldcup/upcoming - Get upcoming World Cup matches
router.get("/worldcup/upcoming", async (_req, res): Promise<void> => {
  try {
    const data = await apiFootball.getUpcomingMatches(10);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch upcoming matches" });
  }
});

// GET /worldcup/live - Get live World Cup matches
router.get("/worldcup/live", async (_req, res): Promise<void> => {
  try {
    const data = await apiFootball.getLiveMatches();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch live matches" });
  }
});

// GET /worldcup/standings - Get World Cup standings/table
router.get("/worldcup/standings", async (_req, res): Promise<void> => {
  try {
    const data = await apiFootball.getWorldCupStandings();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch standings" });
  }
});

// GET /worldcup/tournament - Get tournament information
router.get("/worldcup/tournament", async (_req, res): Promise<void> => {
  try {
    const data = await apiFootball.getTournamentInfo();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tournament info" });
  }
});

// GET /worldcup/team/:id - Get team information
router.get("/worldcup/team/:id", async (req, res): Promise<void> => {
  try {
    const teamId = parseInt(req.params.id, 10);
    if (isNaN(teamId)) {
      res.status(400).json({ error: "Invalid team ID" });
      return;
    }
    const data = await apiFootball.getTeamInfo(teamId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch team info" });
  }
});

// GET /worldcup/match/:id/stats - Get match statistics
router.get("/worldcup/match/:id/stats", async (req, res): Promise<void> => {
  try {
    const fixtureId = parseInt(req.params.id, 10);
    if (isNaN(fixtureId)) {
      res.status(400).json({ error: "Invalid fixture ID" });
      return;
    }
    const data = await apiFootball.getMatchStats(fixtureId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch match stats" });
  }
});

export default router;
