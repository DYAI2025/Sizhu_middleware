import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // FuFire Proxy Routes
  app.post("/api/fufire/*", async (req, res) => {
    try {
      const { fuFireConfig, fufirePath, body } = req.body;
      
      const apiKey = process.env[fuFireConfig.apiKeySecretRef] || process.env.FUFIRE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "NO_FUFIRE_API_KEY_CONFIGURED" });
      }
      if (!fuFireConfig.baseUrl) {
        return res.status(500).json({ error: "NO_FUFIRE_BASE_URL_CONFIGURED" });
      }
      if (!fuFireConfig.enabled) {
        return res.status(500).json({ error: "FUFIRE_ENDPOINT_DISABLED" });
      }

      const fufireUrl = `${fuFireConfig.baseUrl.replace(/\/$/, '')}${fufirePath}`;

      // Set up the fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), fuFireConfig.timeoutMs || 10000);

      try {
        const response = await fetch(fufireUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 401) {
            return res.status(response.status).json({ error: "FUFIRE_UNAUTHORIZED" });
          }
          if (response.status === 429) {
            return res.status(response.status).json({ error: "FUFIRE_RATE_LIMITED" });
          }
          let errorText = "FUFIRE_INVALID_RESPONSE";
          if (fufirePath.includes("chronometry")) errorText = "FUFIRE_CHRONOMETRY_FAILED";
          else if (fufirePath.includes("wuxing")) errorText = "FUFIRE_WUXING_FAILED";
          else if (fufirePath.includes("bazi")) errorText = "FUFIRE_BAZI_FAILED";
          
          return res.status(response.status).json({ error: errorText, details: await response.text() });
        }

        const data = await response.json();
        return res.json(data);
      } catch (fetchError: any) {
        if (fetchError.name === 'AbortError') {
          return res.status(504).json({ error: "FUFIRE_TIMEOUT" });
        }
        throw fetchError;
      }
    } catch (err: any) {
      console.error("FuFire server boundary error:", err);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // eslint-disable-next-line no-undef
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
