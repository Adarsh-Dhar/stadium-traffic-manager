import request from 'supertest';
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from '../src/lib/logger.ts';
import router from '../src/routes/index.ts';

// Create the app for testing
const app = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split('?')[0],
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
app.use('/api', router);

describe('FIFA Stadium Traffic Management System - API Tests', () => {
  
  describe('GET /api/healthz', () => {
    test('should return 200 status code', async () => {
      const response = await request(app).get('/api/healthz');
      expect(response.status).toBe(200);
    });

    test('should return healthy status', async () => {
      const response = await request(app).get('/api/healthz');
      expect(response.body.status).toBe('ok');
    });

    test('should return valid JSON response', async () => {
      const response = await request(app).get('/api/healthz');
      expect(response.type).toBe('application/json');
      expect(response.body).toHaveProperty('status');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/api/unknown/endpoint');
      expect(response.status).toBe(404);
    });

    test('should handle missing route gracefully', async () => {
      const response = await request(app).post('/api/nonexistent');
      expect(response.status).toBeGreaterThanOrEqual(404);
    });
  });

  describe('CORS Headers', () => {
    test('should include CORS headers in response', async () => {
      const response = await request(app).get('/api/healthz');
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Request/Response Format', () => {
    test('should accept JSON content-type', async () => {
      const response = await request(app)
        .get('/api/healthz')
        .set('Content-Type', 'application/json');
      expect(response.status).toBeLessThan(400);
    });

    test('should return valid Content-Type header', async () => {
      const response = await request(app).get('/api/healthz');
      expect(response.type).toMatch(/json/);
    });
  });

  describe('HTTP Methods', () => {
    test('should support GET method', async () => {
      const response = await request(app).get('/api/healthz');
      expect(response.status).toBe(200);
    });

    test('should reject unsupported methods gracefully', async () => {
      const response = await request(app).delete('/api/healthz');
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});

describe('API Performance', () => {
  test('health check should respond quickly', async () => {
    const startTime = Date.now();
    await request(app).get('/api/healthz');
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    // Should respond within 500ms
    expect(responseTime).toBeLessThan(500);
  });

  test('should handle concurrent requests', async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(request(app).get('/api/healthz'));
    }
    
    const responses = await Promise.all(promises);
    const successCount = responses.filter(r => r.status === 200).length;
    
    expect(successCount).toBe(10);
  });

  test('should maintain performance under load', async () => {
    const promises = [];
    const startTime = Date.now();
    
    for (let i = 0; i < 50; i++) {
      promises.push(request(app).get('/api/healthz'));
    }
    
    const responses = await Promise.all(promises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / 50;
    
    const successCount = responses.filter(r => r.status === 200).length;
    expect(successCount).toBeGreaterThanOrEqual(45);
    // Average response time should be under 100ms
    expect(avgTime).toBeLessThan(100);
  });
});

describe('API Middleware', () => {
  test('should handle URL encoding', async () => {
    const response = await request(app)
      .get('/api/healthz')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(response.status).toBeLessThan(500);
  });

  test('should apply CORS to all routes', async () => {
    const response = await request(app).options('/api/healthz');
    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });
});
