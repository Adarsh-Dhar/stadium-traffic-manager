import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityMiddleware } from "./middlewares/security";
import { register, collectDefaultMetrics, Counter } from 'prom-client';

collectDefaultMetrics();

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const app: Express = express();

// Prometheus scrape endpoint — registered before pinoHttp to suppress per-scrape log noise
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request handler middleware to increment HTTP request counter
app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      route: (req as any).route?.path ?? req.path,
      status: res.statusCode,
    });
  });
  next();
});

// Toggleable security middleware for load-testing (DT_SECURITY)
app.use(securityMiddleware);

app.use("/api", router);

export default app;
