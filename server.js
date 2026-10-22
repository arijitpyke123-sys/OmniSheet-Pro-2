// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
var HOST = "0.0.0.0";
app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path !== "/api/health") {
      const duration = Date.now() - start;
      console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "OmniSheet Pro",
    environment: process.env.NODE_ENV || "production",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    render: {
      deployedOnRender: Boolean(process.env.RENDER),
      serviceId: process.env.RENDER_SERVICE_ID || "local",
      serviceName: process.env.RENDER_SERVICE_NAME || "omni-sheet-pro",
      instanceId: process.env.RENDER_INSTANCE_ID || "local-instance"
    }
  });
});
app.get("/api/quota-plans", (_req, res) => {
  res.status(200).json({
    rateLimitEngine: "Netflix-Style Token Bucket & Sliding Window",
    plans: [
      { id: "free", name: "Starter Tier", priceRupees: 0, hourlyQuota: 10, burstPerMinute: 25 },
      { id: "basic_50", name: "Basic Plan", priceRupees: 50, hourlyQuota: 500, burstPerMinute: 80 },
      { id: "pro_199", name: "Pro Collaborative", priceRupees: 199, hourlyQuota: 2500, burstPerMinute: 250 },
      { id: "enterprise_499", name: "Enterprise Scale", priceRupees: 499, hourlyQuota: 1e4, burstPerMinute: 1e3 }
    ]
  });
});
var distPath = path.resolve(__dirname, "dist");
var indexPath = path.join(distPath, "index.html");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      } else if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    }
  }));
  app.get("*", (_req, res) => {
    res.sendFile(indexPath);
  });
} else {
  console.warn(`[WARN] Dist folder not found at ${distPath}. Run 'npm run build' first.`);
  app.get("*", (_req, res) => {
    res.status(503).send(`
      <!DOCTYPE html>
      <html>
        <head><title>OmniSheet Pro - Building</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:#f8fafc;">
          <h1>OmniSheet Pro is initializing...</h1>
          <p>The production frontend is being compiled. Please run <code>npm run build</code> or refresh shortly.</p>
        </body>
      </html>
    `);
  });
}
var server = app.listen(PORT, HOST, () => {
  console.log(`===============================================`);
  console.log(`\u{1F680} OmniSheet Pro Server running on http://${HOST}:${PORT}`);
  console.log(`\u{1F4E1} Health Check: http://${HOST}:${PORT}/api/health`);
  console.log(`\u{1F310} Ready for Render Deployment!`);
  console.log(`===============================================`);
});
var handleShutdown = (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("Forcing shutdown after timeout");
    process.exit(1);
  }, 1e4);
};
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
