import { pgTable, text, boolean, integer, bigint, timestamp, index } from "drizzle-orm/pg-core";

// ── tickets ────────────────────────────────────────────────────────────────
// 100k pre-seeded rows. validateTicket() does a real SELECT on this.
export const tickets = pgTable("tickets", {
	id:         text("id").primaryKey(),           // e.g. TICKET_0_2026WC
	used:       boolean("used").notNull().default(false),
	gate:       text("gate"),
	scannedAt:  bigint("scanned_at", { mode: "number" }),
}, (t) => [
	index("tickets_used_idx").on(t.used),
]);

// ── request_log ───────────────────────────────────────────────────────────
// Every validate call inserts a row here — this is what creates real I/O
// pressure at 100k scale and exhausts the connection pool.
export const requestLog = pgTable("request_log", {
	id:         bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
	ticketId:   text("ticket_id").notNull(),
	status:     text("status").notNull(),    // 'valid' | 'invalid' | 'overloaded'
	latencyMs:  integer("latency_ms").notNull(),
	ts:         bigint("ts", { mode: "number" }).notNull(),
}, (t) => [
	index("request_log_ts_idx").on(t.ts),
	index("request_log_ticket_idx").on(t.ticketId),
]);

// ── metrics_snapshots ──────────────────────────────────────────────────────
// Persists every metrics snapshot — Dynatrace can query this too.
export const metricsSnapshots = pgTable("metrics_snapshots", {
	id:               bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
	ts:               bigint("ts", { mode: "number" }).notNull(),
	avgLatency:       integer("avg_latency").notNull(),
	p95Latency:       integer("p95_latency").notNull(),
	p99Latency:       integer("p99_latency").notNull(),
	cpuUsage:         integer("cpu_usage").notNull(),
	memoryUsage:      integer("memory_usage").notNull(),
	activeServers:    integer("active_servers").notNull(),
	requestsPerSec:   integer("requests_per_sec").notNull(),
	errorRate:        integer("error_rate").notNull(),
	totalRequests:    bigint("total_requests", { mode: "number" }).notNull(),
}, (t) => [
	index("metrics_ts_idx").on(t.ts),
]);
