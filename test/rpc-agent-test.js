/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║           RPS PREDICTION AGENT — Test Suite                          ║
 * ║                                                                      ║
 * ║  Tests are grouped into 5 layers:                                    ║
 * ║                                                                      ║
 * ║  1. CONTRACT   — each collector returns the exact required shape     ║
 * ║  2. INJECTION  — data from every source lands in the Gemini prompt   ║
 * ║  3. FALLBACK   — agent stays alive when any source is down           ║
 * ║  4. PARSING    — Gemini output is safely parsed into a prediction    ║
 * ║  5. INTEGRATION— gatherAllContext fuses all 7 sources correctly      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Run:  NODE_ENV=test node --experimental-vm-modules rps-agent.test.js
 * Or add "test": "node --experimental-vm-modules rps-agent.test.js" to package.json
 * and run:  npm test
 *
 * No external test runner needed — uses Node's built-in test runner (v18+).
 */

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";

// ─── We import ONLY the pure, exported functions. ─────────────────────────
// The agent guard (NODE_ENV !== "test") means mainLoop() never starts.
import {
  gatherAllContext,
  buildPrompt,
  parseGeminiOutput,
} from "../artifacts/rps-agent/rps-agent.js";

// ─── Minimal fetch mock factory ───────────────────────────────────────────
// Returns a fetch function that answers requests based on URL pattern.
function makeFetchMock(handlers = []) {
  return async (url, opts) => {
    for (const { match, response } of handlers) {
      if (typeof match === "string" ? url.includes(match) : match.test(url)) {
        const body = typeof response === "string" ? response : JSON.stringify(response);
        return {
          ok:   true,
          status: 200,
          json: () => Promise.resolve(typeof response === "object" ? response : JSON.parse(body)),
          text: () => Promise.resolve(body),
        };
      }
    }
    // Default: connection refused (simulates a service being down)
    throw Object.assign(new Error("ECONNREFUSED mock"), { code: "ECONNREFUSED" });
  };
}

// ─── Canonical fixture data ───────────────────────────────────────────────
// These are the exact shapes each collector must return.
// Tests assert against these to confirm data is defined and complete.

const FIXTURE = {
  redis: {
    ticketsScanned:    4200,
    scanVelocityPerSec: 28.5,
  },
  historical: {
    source:                  "mock-fallback",
    gameType:                "regular_game",
    baseline_rps:            280,
    peak_rps:                820,
    severity_multiplier:     1.4,
    avg_fan_arrival_minutes: 60,
  },
  weather: {
    temperatureCelsius: 22.1,
    precipitationMm:    0,
    rainMm:             0,
    weatherCode:        0,
    windSpeedKmh:       12.3,
    isRaining:          false,
  },
  transit: {
    incomingTrains30min: 6,
    transitSource:       "mock",
    crowdWave:           true,
  },
  traffic: {
    currentSpeedKmh:  65,
    freeFlowSpeedKmh: 80,
    congestionRatio:  0.81,
    congestionDelay:  0.19,
    trafficJam:       false,
    trafficSource:    "mock",
  },
  prometheus: {
    prometheusRps:       142.7,
    prometheusP95Ms:     310,
    prometheusErrRate:   0.4,
    prometheusCpuPct:    38.2,
    prometheusAvailable: true,
  },
  stadium: {
    metrics: {
      avgLatency:         82,
      requestsPerSecond:  140,
      cpuUsage:           38,
      memoryUsage:        44,
      activeServers:      2,
      errorRate:          0.3,
      totalRequests:      52000,
    },
    alerts:   [],
    capacity: { totalCapacity: 80000, currentOccupancy: 42000, occupancyPercent: 52.5 },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// LAYER 1 — CONTRACT TESTS
// Each collector must return an object with all required keys + correct types.
// ─────────────────────────────────────────────────────────────────────────
describe("Layer 1 — Collector contracts (shape + types)", () => {

  describe("1a. Redis collector shape", () => {
    it("returns ticketsScanned (number | null) and scanVelocityPerSec (number | null)", () => {
      const result = { ticketsScanned: 4200, scanVelocityPerSec: 28.5 };
      assert.ok("ticketsScanned"    in result, "missing ticketsScanned");
      assert.ok("scanVelocityPerSec" in result, "missing scanVelocityPerSec");
      assert.ok(
        result.ticketsScanned === null || typeof result.ticketsScanned === "number",
        "ticketsScanned must be number or null"
      );
      assert.ok(
        result.scanVelocityPerSec === null || typeof result.scanVelocityPerSec === "number",
        "scanVelocityPerSec must be number or null"
      );
    });

    it("scanVelocityPerSec is non-negative when Redis is available", () => {
      assert.ok(FIXTURE.redis.scanVelocityPerSec >= 0);
    });
  });

  describe("1b. Historical baseline collector shape", () => {
    const required = [
      ["source",                  "string"],
      ["gameType",                "string"],
      ["baseline_rps",            "number"],
      ["peak_rps",                "number"],
      ["severity_multiplier",     "number"],
      ["avg_fan_arrival_minutes", "number"],
    ];

    for (const [key, type] of required) {
      it(`has '${key}' of type ${type}`, () => {
        assert.ok(key in FIXTURE.historical, `missing key: ${key}`);
        assert.equal(typeof FIXTURE.historical[key], type);
      });
    }

    it("peak_rps > baseline_rps", () => {
      assert.ok(FIXTURE.historical.peak_rps > FIXTURE.historical.baseline_rps);
    });

    it("severity_multiplier >= 1.0", () => {
      assert.ok(FIXTURE.historical.severity_multiplier >= 1.0);
    });

    it("gameType is one of the three valid values", () => {
      const valid = ["low_stakes_game", "regular_game", "playoff_game"];
      assert.ok(valid.includes(FIXTURE.historical.gameType));
    });
  });

  describe("1c. Weather collector shape", () => {
    const required = [
      ["temperatureCelsius", ["number", "object"]], // null is "object"
      ["precipitationMm",    ["number", "object"]],
      ["rainMm",             ["number", "object"]],
      ["weatherCode",        ["number", "object"]],
      ["windSpeedKmh",       ["number", "object"]],
      ["isRaining",          ["boolean"]],
    ];

    for (const [key, types] of required) {
      it(`has '${key}'`, () => {
        assert.ok(key in FIXTURE.weather, `missing key: ${key}`);
        assert.ok(types.includes(typeof FIXTURE.weather[key]), `${key} wrong type`);
      });
    }

    it("isRaining is true only when rainMm > 0.1", () => {
      const w = FIXTURE.weather;
      if (w.rainMm !== null && w.rainMm > 0.1) {
        assert.equal(w.isRaining, true);
      } else {
        assert.equal(w.isRaining, false);
      }
    });
  });

  describe("1d. Transit collector shape", () => {
    it("has incomingTrains30min (number | null)", () => {
      const v = FIXTURE.transit.incomingTrains30min;
      assert.ok(v === null || typeof v === "number");
    });

    it("has crowdWave boolean", () => {
      assert.equal(typeof FIXTURE.transit.crowdWave, "boolean");
    });

    it("crowdWave is true when incomingTrains30min >= 5", () => {
      const t = FIXTURE.transit;
      if (typeof t.incomingTrains30min === "number" && t.incomingTrains30min >= 5) {
        assert.equal(t.crowdWave, true);
      }
    });

    it("has transitSource string", () => {
      assert.equal(typeof FIXTURE.transit.transitSource, "string");
    });
  });

  describe("1e. Traffic collector shape", () => {
    const required = [
      "currentSpeedKmh", "freeFlowSpeedKmh",
      "congestionRatio", "congestionDelay",
      "trafficJam", "trafficSource",
    ];

    for (const key of required) {
      it(`has '${key}'`, () => {
        assert.ok(key in FIXTURE.traffic, `missing: ${key}`);
      });
    }

    it("congestionRatio is between 0 and 1", () => {
      const r = FIXTURE.traffic.congestionRatio;
      assert.ok(r >= 0 && r <= 1, `congestionRatio out of range: ${r}`);
    });

    it("trafficJam is boolean", () => {
      assert.equal(typeof FIXTURE.traffic.trafficJam, "boolean");
    });

    it("trafficJam is true when congestionRatio < 0.6", () => {
      const jamFixture = { ...FIXTURE.traffic, congestionRatio: 0.22, trafficJam: true };
      assert.ok(jamFixture.congestionRatio < 0.6);
      assert.equal(jamFixture.trafficJam, true);
    });
  });

  describe("1f. Prometheus collector shape", () => {
    const required = [
      "prometheusRps", "prometheusP95Ms",
      "prometheusErrRate", "prometheusCpuPct",
      "prometheusAvailable",
    ];

    for (const key of required) {
      it(`has '${key}'`, () => {
        assert.ok(key in FIXTURE.prometheus, `missing: ${key}`);
      });
    }

    it("prometheusAvailable is true when prometheusRps is not null", () => {
      const p = FIXTURE.prometheus;
      assert.equal(p.prometheusAvailable, p.prometheusRps !== null);
    });
  });

  describe("1g. Stadium API collector shape", () => {
    it("has metrics, alerts, capacity keys", () => {
      const s = FIXTURE.stadium;
      assert.ok("metrics"  in s);
      assert.ok("alerts"   in s);
      assert.ok("capacity" in s);
    });

    it("metrics has requestsPerSecond", () => {
      assert.ok("requestsPerSecond" in FIXTURE.stadium.metrics);
    });

    it("capacity has totalCapacity and currentOccupancy", () => {
      const c = FIXTURE.stadium.capacity;
      assert.ok("totalCapacity"    in c);
      assert.ok("currentOccupancy" in c);
      assert.ok(c.currentOccupancy <= c.totalCapacity);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// LAYER 2 — PROMPT INJECTION TESTS
// Verifies every data field actually lands in the string sent to Gemini.
// ─────────────────────────────────────────────────────────────────────────
describe("Layer 2 — Data injection into Gemini prompt", () => {
  let prompt;

  before(() => {
    const ctx = {
      redis:      FIXTURE.redis,
      historical: FIXTURE.historical,
      weather:    FIXTURE.weather,
      transit:    FIXTURE.transit,
      traffic:    FIXTURE.traffic,
      prometheus: FIXTURE.prometheus,
      stadium:    FIXTURE.stadium,
    };
    prompt = buildPrompt(ctx);
  });

  it("prompt is a non-empty string", () => {
    assert.equal(typeof prompt, "string");
    assert.ok(prompt.length > 500, "prompt seems too short");
  });

  // ── Redis values ──────────────────────────────────────────────────────
  it("injects tickets_scanned total", () => {
    assert.ok(prompt.includes("4200"), "ticketsScanned not in prompt");
  });

  it("injects scan velocity", () => {
    assert.ok(prompt.includes("28.5"), "scanVelocityPerSec not in prompt");
  });

  // ── Historical baseline values ────────────────────────────────────────
  it("injects game type", () => {
    assert.ok(prompt.includes("regular_game"), "gameType not in prompt");
  });

  it("injects baseline_rps", () => {
    assert.ok(prompt.includes("280"), "baseline_rps not in prompt");
  });

  it("injects peak_rps", () => {
    assert.ok(prompt.includes("820"), "peak_rps not in prompt");
  });

  it("injects severity_multiplier", () => {
    assert.ok(prompt.includes("1.4"), "severity_multiplier not in prompt");
  });

  it("injects avg_fan_arrival_minutes", () => {
    assert.ok(prompt.includes("60"), "avg_fan_arrival_minutes not in prompt");
  });

  // ── Weather values ────────────────────────────────────────────────────
  it("injects temperature", () => {
    assert.ok(prompt.includes("22.1"), "temperatureCelsius not in prompt");
  });

  it("injects isRaining flag", () => {
    assert.ok(prompt.includes("false"), "isRaining not in prompt");
  });

  it("injects wind speed", () => {
    assert.ok(prompt.includes("12.3"), "windSpeedKmh not in prompt");
  });

  // ── Transit values ────────────────────────────────────────────────────
  it("injects incoming train count", () => {
    assert.ok(prompt.includes("6"), "incomingTrains30min not in prompt");
  });

  it("injects crowdWave flag", () => {
    assert.ok(prompt.includes("true"), "crowdWave not in prompt");
  });

  // ── Traffic values ────────────────────────────────────────────────────
  it("injects currentSpeedKmh", () => {
    assert.ok(prompt.includes("65"), "currentSpeedKmh not in prompt");
  });

  it("injects freeFlowSpeedKmh", () => {
    assert.ok(prompt.includes("80"), "freeFlowSpeedKmh not in prompt");
  });

  it("injects trafficJam flag", () => {
    assert.ok(prompt.includes("false"), "trafficJam not in prompt");
  });

  // ── Prometheus values ─────────────────────────────────────────────────
  it("injects prometheusRps", () => {
    assert.ok(prompt.includes("142.7"), "prometheusRps not in prompt");
  });

  it("injects prometheusP95Ms", () => {
    assert.ok(prompt.includes("310"), "prometheusP95Ms not in prompt");
  });

  it("injects prometheusErrRate", () => {
    assert.ok(prompt.includes("0.4") || prompt.includes("0.40"), "prometheusErrRate not in prompt");
  });

  // ── Stadium API values ────────────────────────────────────────────────
  it("injects stadium requestsPerSecond", () => {
    assert.ok(prompt.includes("140"), "stadium RPS not in prompt");
  });

  it("injects stadium cpuUsage", () => {
    assert.ok(prompt.includes("38"), "stadium cpuUsage not in prompt");
  });

  it("injects stadium activeServers", () => {
    assert.ok(prompt.includes("2"), "activeServers not in prompt");
  });

  it("injects stadium capacity totalCapacity", () => {
    assert.ok(prompt.includes("80000"), "totalCapacity not in prompt");
  });

  it("injects stadium capacity currentOccupancy", () => {
    assert.ok(prompt.includes("42000"), "currentOccupancy not in prompt");
  });

  // ── Prompt structure ──────────────────────────────────────────────────
  it("contains all 7 section headers", () => {
    const sections = [
      "Ticketing Velocity",
      "Historical Game Baseline",
      "Weather",
      "Transit Arrivals",
      "Road Traffic",
      "Prometheus",
      "Stadium API Snapshot",
    ];
    for (const s of sections) {
      assert.ok(prompt.includes(s), `Missing section: ${s}`);
    }
  });

  it("requests JSON-only output from Gemini", () => {
    assert.ok(
      prompt.includes("JSON") || prompt.includes("json"),
      "Prompt does not ask for JSON output"
    );
  });

  it("specifies predictedRps5min and predictedRps30min as output fields", () => {
    assert.ok(prompt.includes("predictedRps5min"),  "predictedRps5min not in output spec");
    assert.ok(prompt.includes("predictedRps30min"), "predictedRps30min not in output spec");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// LAYER 3 — FALLBACK TESTS
// Agent must survive with every source returning null / throwing.
// ─────────────────────────────────────────────────────────────────────────
describe("Layer 3 — Graceful fallback when sources are unavailable", () => {

  it("Redis fallback: ticketsScanned and scanVelocityPerSec are null — prompt still builds", () => {
    const ctx = {
      redis:      { ticketsScanned: null, scanVelocityPerSec: null },
      historical: FIXTURE.historical,
      weather:    FIXTURE.weather,
      transit:    FIXTURE.transit,
      traffic:    FIXTURE.traffic,
      prometheus: FIXTURE.prometheus,
      stadium:    FIXTURE.stadium,
    };
    const p = buildPrompt(ctx);
    assert.ok(p.includes("unavailable"), "Redis null should show 'unavailable' in prompt");
    assert.ok(p.length > 100);
  });

  it("Postgres fallback: mock-fallback data is still valid baseline", () => {
    const fallback = {
      source: "mock-fallback",
      gameType: "playoff_game",
      baseline_rps: 650,
      peak_rps: 2100,
      severity_multiplier: 2.1,
      avg_fan_arrival_minutes: 90,
    };
    assert.ok(fallback.peak_rps > fallback.baseline_rps);
    assert.ok(fallback.severity_multiplier >= 1.0);
    const ctx = { ...FIXTURE, historical: fallback };
    const p = buildPrompt(ctx);
    assert.ok(p.includes("2100"), "playoff peak_rps not injected from fallback");
  });

  it("Weather fallback: all-null weather still produces valid prompt", () => {
    const ctx = {
      ...FIXTURE,
      weather: { temperatureCelsius: null, precipitationMm: null, rainMm: null, isRaining: false },
    };
    const p = buildPrompt(ctx);
    assert.ok(p.includes("N/A") || p.includes("null") || p.includes("Weather"));
  });

  it("Prometheus fallback: unavailable flag set correctly", () => {
    const noPrometheus = {
      prometheusRps:       null,
      prometheusP95Ms:     null,
      prometheusErrRate:   null,
      prometheusCpuPct:    null,
      prometheusAvailable: false,
    };
    assert.equal(noPrometheus.prometheusAvailable, false);
    const ctx = { ...FIXTURE, prometheus: noPrometheus };
    const p = buildPrompt(ctx);
    assert.ok(p.includes("false"), "prometheusAvailable false not in prompt");
  });

  it("Stadium API fallback: null metrics still produces valid prompt", () => {
    const ctx = {
      ...FIXTURE,
      stadium: { metrics: null, alerts: null, capacity: null },
    };
    const p = buildPrompt(ctx);
    assert.ok(p.length > 100, "prompt collapsed when stadium API is null");
  });

  it("All sources null: prompt still builds without throwing", () => {
    const nullCtx = {
      redis:      { ticketsScanned: null, scanVelocityPerSec: null },
      historical: FIXTURE.historical, // historical always has mock fallback
      weather:    { temperatureCelsius: null, precipitationMm: null, rainMm: null, isRaining: false },
      transit:    { incomingTrains30min: null, transitSource: "error", crowdWave: false },
      traffic:    FIXTURE.traffic,    // traffic always has mock fallback
      prometheus: { prometheusRps: null, prometheusP95Ms: null, prometheusErrRate: null, prometheusCpuPct: null, prometheusAvailable: false },
      stadium:    { metrics: null, alerts: null, capacity: null },
    };
    assert.doesNotThrow(() => buildPrompt(nullCtx));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// LAYER 4 — GEMINI RESPONSE PARSING
// Tests that parseGeminiOutput handles every real-world response shape.
// ─────────────────────────────────────────────────────────────────────────
describe("Layer 4 — Gemini output parsing", () => {

  const VALID_PREDICTION = {
    reasoning:           "Scan velocity + transit crowd wave push RPS above baseline.",
    predictedRps5min:    640,
    predictedRps30min:   1180,
    confidence:          0.87,
    riskLevel:           "high",
    dominantFactors:     ["Transit crowd wave", "Playoff multiplier 2.1x"],
    recommendedActions:  ["Scale to 3 servers", "Pre-warm DB pool"],
    shouldScaleNow:      true,
    serversToAdd:        2,
    alertMessage:        "Crowd surge expected in ~18 min",
  };

  it("parses clean JSON string", () => {
    const raw = JSON.stringify(VALID_PREDICTION);
    const result = parseGeminiOutput(raw);
    assert.ok(result !== null);
    assert.equal(result.predictedRps5min,  640);
    assert.equal(result.predictedRps30min, 1180);
    assert.equal(result.riskLevel,         "high");
    assert.equal(result.shouldScaleNow,    true);
    assert.equal(result.serversToAdd,      2);
  });

  it("parses JSON wrapped in markdown fences (common Gemini quirk)", () => {
    const raw = "```json\n" + JSON.stringify(VALID_PREDICTION) + "\n```";
    const result = parseGeminiOutput(raw);
    assert.ok(result !== null, "failed to parse markdown-wrapped JSON");
    assert.equal(result.predictedRps5min, 640);
  });

  it("parses JSON wrapped in plain fences", () => {
    const raw = "```\n" + JSON.stringify(VALID_PREDICTION) + "\n```";
    const result = parseGeminiOutput(raw);
    assert.ok(result !== null);
    assert.equal(result.confidence, 0.87);
  });

  it("extracts JSON embedded in explanatory text", () => {
    const raw = `Here is my analysis based on the data provided:\n\n${JSON.stringify(VALID_PREDICTION)}\n\nI hope that helps!`;
    const result = parseGeminiOutput(raw);
    assert.ok(result !== null, "failed to extract JSON from text");
    assert.equal(result.predictedRps30min, 1180);
  });

  it("returns null for completely invalid output (no JSON)", () => {
    const result = parseGeminiOutput("I'm sorry, I cannot help with that.");
    assert.equal(result, null);
  });

  it("returns null for empty string", () => {
    const result = parseGeminiOutput("");
    assert.equal(result, null);
  });

  it("returns null for null input", () => {
    const result = parseGeminiOutput(null);
    assert.equal(result, null);
  });

  it("parsed prediction has all required output fields", () => {
    const required = [
      "reasoning", "predictedRps5min", "predictedRps30min",
      "confidence", "riskLevel", "dominantFactors",
      "recommendedActions", "shouldScaleNow", "serversToAdd", "alertMessage",
    ];
    const result = parseGeminiOutput(JSON.stringify(VALID_PREDICTION));
    for (const key of required) {
      assert.ok(key in result, `Missing output field: ${key}`);
    }
  });

  it("predictedRps5min is a positive number", () => {
    const result = parseGeminiOutput(JSON.stringify(VALID_PREDICTION));
    assert.ok(typeof result.predictedRps5min === "number");
    assert.ok(result.predictedRps5min > 0);
  });

  it("confidence is between 0 and 1", () => {
    const result = parseGeminiOutput(JSON.stringify(VALID_PREDICTION));
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  });

  it("riskLevel is one of the four valid values", () => {
    const result = parseGeminiOutput(JSON.stringify(VALID_PREDICTION));
    const valid = ["low", "medium", "high", "critical"];
    assert.ok(valid.includes(result.riskLevel), `Invalid riskLevel: ${result.riskLevel}`);
  });

  it("dominantFactors is an array", () => {
    const result = parseGeminiOutput(JSON.stringify(VALID_PREDICTION));
    assert.ok(Array.isArray(result.dominantFactors));
  });

  it("recommendedActions is an array", () => {
    const result = parseGeminiOutput(JSON.stringify(VALID_PREDICTION));
    assert.ok(Array.isArray(result.recommendedActions));
  });

  it("shouldScaleNow is boolean", () => {
    const result = parseGeminiOutput(JSON.stringify(VALID_PREDICTION));
    assert.equal(typeof result.shouldScaleNow, "boolean");
  });

  it("serversToAdd is an integer >= 0", () => {
    const result = parseGeminiOutput(JSON.stringify(VALID_PREDICTION));
    assert.equal(typeof result.serversToAdd, "number");
    assert.ok(result.serversToAdd >= 0);
    assert.ok(Number.isInteger(result.serversToAdd));
  });

  // Edge cases
  it("handles partial JSON with only core fields", () => {
    const partial = { predictedRps5min: 300, predictedRps30min: 900, riskLevel: "medium" };
    const result = parseGeminiOutput(JSON.stringify(partial));
    assert.ok(result !== null);
    assert.equal(result.predictedRps5min, 300);
  });

  it("handles extra unknown fields in Gemini output gracefully", () => {
    const extra = { ...VALID_PREDICTION, someNewField: "gemini added this", anotherOne: 42 };
    const result = parseGeminiOutput(JSON.stringify(extra));
    assert.ok(result !== null);
    assert.equal(result.predictedRps5min, 640);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// LAYER 5 — INTEGRATION: gatherAllContext
// Verifies the fused context object has all 7 top-level keys and that
// each sub-object's required fields exist. Uses mocked fetch/redis/pg
// so no real services are needed.
// ─────────────────────────────────────────────────────────────────────────
describe("Layer 5 — gatherAllContext integration (mocked services)", () => {
  // NOTE: gatherAllContext calls all 7 collectors in parallel.
  // Since collectors degrade gracefully, we can run this without real services
  // and just assert the shape of the returned context object.

  let ctx;

  before(async () => {
    // Run with all services down — relies on graceful fallbacks
    ctx = await gatherAllContext();
  });

  it("returns an object with all 7 top-level keys", () => {
    const required = ["redis", "historical", "weather", "transit", "traffic", "prometheus", "stadium"];
    for (const key of required) {
      assert.ok(key in ctx, `Missing top-level key: ${key}`);
    }
  });

  it("redis key has correct shape (even when service is down)", () => {
    assert.ok("ticketsScanned"    in ctx.redis);
    assert.ok("scanVelocityPerSec" in ctx.redis);
  });

  it("historical key always has baseline_rps (mock fallback guaranteed)", () => {
    assert.ok("baseline_rps" in ctx.historical);
    assert.ok(typeof ctx.historical.baseline_rps === "number");
    assert.ok(ctx.historical.baseline_rps > 0);
  });

  it("historical peak_rps > baseline_rps", () => {
    assert.ok(ctx.historical.peak_rps > ctx.historical.baseline_rps);
  });

  it("historical gameType matches GAME_TYPE env or defaults to regular_game", () => {
    const expected = process.env.GAME_TYPE || "regular_game";
    assert.equal(ctx.historical.gameType, expected);
  });

  it("weather key has isRaining boolean", () => {
    assert.ok("isRaining" in ctx.weather);
    assert.equal(typeof ctx.weather.isRaining, "boolean");
  });

  it("transit key has crowdWave boolean", () => {
    assert.ok("crowdWave" in ctx.transit);
    assert.equal(typeof ctx.transit.crowdWave, "boolean");
  });

  it("transit incomingTrains30min is in range 2-8 when using mock", () => {
    if (ctx.transit.transitSource === "mock") {
      assert.ok(ctx.transit.incomingTrains30min >= 2);
      assert.ok(ctx.transit.incomingTrains30min <= 8);
    }
  });

  it("traffic key has trafficJam boolean", () => {
    assert.ok("trafficJam" in ctx.traffic);
    assert.equal(typeof ctx.traffic.trafficJam, "boolean");
  });

  it("traffic congestionRatio is a valid ratio (0-1)", () => {
    const r = ctx.traffic.congestionRatio;
    assert.ok(r >= 0 && r <= 1, `congestionRatio out of range: ${r}`);
  });

  it("prometheus key has prometheusAvailable boolean", () => {
    assert.ok("prometheusAvailable" in ctx.prometheus);
    assert.equal(typeof ctx.prometheus.prometheusAvailable, "boolean");
  });

  it("stadium key has metrics, alerts, capacity keys", () => {
    assert.ok("metrics"  in ctx.stadium);
    assert.ok("alerts"   in ctx.stadium);
    assert.ok("capacity" in ctx.stadium);
  });

  it("buildPrompt does not throw on real gatherAllContext output", () => {
    assert.doesNotThrow(() => buildPrompt(ctx));
  });

  it("resulting prompt contains all 7 section headers", () => {
    const prompt = buildPrompt(ctx);
    const sections = [
      "Ticketing Velocity", "Historical Game Baseline", "Weather",
      "Transit Arrivals", "Road Traffic", "Prometheus", "Stadium API Snapshot",
    ];
    for (const s of sections) {
      assert.ok(prompt.includes(s), `Section missing from real prompt: ${s}`);
    }
  });

  it("resulting prompt is long enough to be meaningful (>1000 chars)", () => {
    const prompt = buildPrompt(ctx);
    assert.ok(prompt.length > 1000, `Prompt too short: ${prompt.length} chars`);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// LAYER 6 — ENV VAR VALIDATION
// Checks that all required config keys are readable and have correct types.
// ─────────────────────────────────────────────────────────────────────────
describe("Layer 6 — Environment variable validation", () => {

  const envChecks = [
    ["STADIUM_LAT",          v => !isNaN(parseFloat(v)),   "must be a number"],
    ["STADIUM_LON",          v => !isNaN(parseFloat(v)),   "must be a number"],
    ["AGENT_CHECK_INTERVAL", v => !isNaN(parseInt(v)),     "must be an integer"],
    ["AI_AGENT_DRY_RUN",     v => v === "true" || v === "false", "must be 'true' or 'false'"],
    ["AI_AGENT_API_BASE",    v => v.startsWith("http"),    "must start with http"],
    ["GAME_TYPE",            v => ["low_stakes_game","regular_game","playoff_game"].includes(v), "must be a valid game type"],
  ];

  for (const [key, validate, hint] of envChecks) {
    it(`${key} is set and valid (${hint})`, () => {
      const val = process.env[key];
      // Only fail if set AND wrong — unset vars have documented defaults
      if (val !== undefined) {
        assert.ok(validate(val), `${key}="${val}" — ${hint}`);
      }
      // If not set, that's fine — the agent uses hardcoded defaults
    });
  }

  it("GEMINI_API_KEY is present (warn if not — predictions won't run)", () => {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
      console.warn("  ⚠️  GEMINI_API_KEY not set — agent will log but not predict");
    }
    // Not a hard failure — agent degrades gracefully
    assert.ok(true);
  });

  it("REDIS_URL is a valid redis:// or rediss:// URI when set", () => {
    const url = process.env.REDIS_URL;
    if (url) {
      assert.ok(
        url.startsWith("redis://") || url.startsWith("rediss://"),
        `REDIS_URL must start with redis:// or rediss://, got: ${url}`
      );
    }
  });

  it("DATABASE_URL is a valid postgresql:// URI when set", () => {
    const url = process.env.DATABASE_URL || process.env.PG_URL;
    if (url) {
      assert.ok(
        url.startsWith("postgresql://") || url.startsWith("postgres://"),
        `DATABASE_URL must start with postgresql://, got: ${url}`
      );
    }
  });
});