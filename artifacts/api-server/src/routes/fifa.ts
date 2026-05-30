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
  startSimulationWrapper as startSimulation,
  stopSimulation,
  getCurrentMetrics,
  getMetricsHistory,
  getAlerts,
  getStadiumCapacity,
  getSimulationStatus,
  getMcpStatus,
} from "../lib/stadium-state.js";
import { logger } from "../lib/logger.js";
import { pushEvent } from "../lib/dynatrace.js";
import {
  getAllMatches,
  getUpcomingMatches,
  getLiveMatches,
  getFinishedMatches,
  getMatchById,
  getStandings,
  getGroupStandings,
  tournament,
} from "../lib/wc2026-data.js";

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
  const result = await validateTicket(ticketId);

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
  const result = await scanTicket(ticketId, gate);

  res.json({
    success: result.success,
    gate,
    entryTime: new Date().toISOString(),
    totalEntered: result.totalEntered,
  });
});

// GET /stadium/capacity
router.get("/stadium/capacity", (_req, res): void => {
  res.json(getStadiumCapacity());
});

// GET /metrics/current
router.get("/metrics/current", (_req, res): void => {
  res.json(getCurrentMetrics());
});

// GET /metrics/history
router.get("/metrics/history", (_req, res): void => {
  res.json(getMetricsHistory());
});

// GET /metrics/alerts
router.get("/metrics/alerts", (_req, res): void => {
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
  await resetSystem();
  res.json({ status: "reset" });
});

// POST /admin/ai-analyze
router.post("/admin/ai-analyze", async (_req, res): Promise<void> => {
  try {
    const result = await aiAnalyze();
    res.json({
      status: result.serversAdded > 0 ? "scaled" : "analyzed",
      analysis: result.analysis,
      actions: result.actions,
      confidence: result.confidence,
      serversAdded: result.serversAdded,
      metricsAfter: getCurrentMetrics(),
    });
  } catch (err: any) {
    logger.error({ err }, "/admin/ai-analyze failed");
    res.status(500).json({ error: "AI analysis failed", details: String(err?.message ?? err) });
  }
});

// POST /admin/log-event
router.post("/admin/log-event", async (req, res): Promise<void> => {
  try {
    const { title = "manual", description = "", severity = "INFO" } = req.body || {};
    const ok = await pushEvent(title, description, severity as any);
    if (!ok) {
      logger.error("/admin/log-event failed");
      res.status(500).json({ success: false, error: "dynatrace ingest failed" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "/admin/log-event failed");
    res.status(500).json({ success: false, error: String(err?.message ?? err) });
  }
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
router.post("/simulation/stop", (_req, res): void => {
  const status = stopSimulation();
  res.json({ ...status, elapsedSeconds: 0 });
});

// GET /simulation/status
router.get("/simulation/status", (_req, res): void => {
  res.json(getSimulationStatus());
});

// GET /metrics/mcp-status
router.get("/metrics/mcp-status", (_req, res): void => {
  res.json(getMcpStatus());
});

// FIFA World Cup 2026 Endpoints

// GET /worldcup/matches - Get all World Cup matches
router.get("/worldcup/matches", async (req, res): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    let data;
    if (status === 'live') {
      data = await getLiveMatches();
    } else if (status === 'upcoming') {
      data = await getUpcomingMatches();
    } else if (status === 'finished') {
      data = await getFinishedMatches();
    } else {
      data = await getAllMatches();
    }
    res.json(data);
  } catch (err) {
    logger.error({ err }, "GET /worldcup/matches failed");
    res.status(500).json({ error: "Failed to fetch World Cup matches" });
  }
});

// GET /worldcup/upcoming - Get upcoming World Cup matches
router.get("/worldcup/upcoming", async (_req, res): Promise<void> => {
  try {
    const data = await getUpcomingMatches(10);
    res.json(data);
  } catch (err) {
    logger.error({ err }, "GET /worldcup/upcoming failed");
    res.status(500).json({ error: "Failed to fetch upcoming matches" });
  }
});

// GET /worldcup/live - Get live World Cup matches
router.get("/worldcup/live", async (_req, res): Promise<void> => {
  try {
    const data = await getLiveMatches();
    res.json(data);
  } catch (err) {
    logger.error({ err }, "GET /worldcup/live failed");
    res.status(500).json({ error: "Failed to fetch live matches" });
  }
});

// GET /worldcup/standings - Get World Cup standings/table
router.get("/worldcup/standings", async (_req, res): Promise<void> => {
  try {
    const data = await getStandings();
    res.json(data);
  } catch (err) {
    logger.error({ err }, "GET /worldcup/standings failed");
    res.status(500).json({ error: "Failed to fetch standings" });
  }
});

// GET /worldcup/tournament - Get tournament information
router.get("/worldcup/tournament", (_req, res): void => {
  res.json(tournament);
});

// GET /worldcup/team/:id - Get team information
router.get("/worldcup/team/:id", async (req, res): Promise<void> => {
  try {
    const teamId = parseInt(req.params.id, 10);
    if (isNaN(teamId)) {
      res.status(400).json({ error: "Invalid team ID" });
      return;
    }
    // Derive team info from matches/standings
    const all = await getAllMatches();
    const teamMatches = all.matches.filter(
      (m: any) => m.homeTeam.id === teamId || m.awayTeam.id === teamId
    );
    const team = teamMatches[0]?.homeTeam.id === teamId ? teamMatches[0].homeTeam : teamMatches[0]?.awayTeam;
    res.json(team || null);
  } catch (err) {
    logger.error({ err }, "GET /worldcup/team/:id failed");
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
    const data = await getMatchById(fixtureId);
    res.json(data);
  } catch (err) {
    logger.error({ err }, "GET /worldcup/match/:id/stats failed");
    res.status(500).json({ error: "Failed to fetch match stats" });
  }
});

// GET /worldcup/group/:name - Get group standings and matches
router.get("/worldcup/group/:name", async (req, res): Promise<void> => {
  try {
    const groupName = req.params.name;
    const data = await getGroupStandings(groupName);
    res.json(data);
  } catch (err) {
    logger.error({ err }, "GET /worldcup/group/:name failed");
    res.status(500).json({ error: "Failed to fetch group standings" });
  }
});

// GET /worldcup/bracket - Get knockout stage matches
router.get("/worldcup/bracket", async (_req, res): Promise<void> => {
  try {
    const allMatches = await getAllMatches();
    const knockoutMatches = allMatches.matches.filter((m: any) => m.stage !== 'GROUP_STAGE');
    res.json({ matches: knockoutMatches });
  } catch (err) {
    logger.error({ err }, "GET /worldcup/bracket failed");
    res.status(500).json({ error: "Failed to fetch bracket" });
  }
});

export default router;
