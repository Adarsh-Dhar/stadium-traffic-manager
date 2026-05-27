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

export default router;
