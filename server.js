import "dotenv/config";
import express from "express";
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { onRequestGet as searchGet } from "./functions/api/search.js";
import { onRequestGet as titleGet } from "./functions/api/title.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const SITE_DIR = path.resolve("_site");

async function forwardFunction(handler, req, res) {
  try {
    const fullUrl = new URL(req.originalUrl, `http://127.0.0.1:${PORT}`);
    const webRequest = new Request(fullUrl.toString(), { method: "GET" });
    const webResponse = await handler({
      request: webRequest,
      env: process.env,
    });

    res.status(webResponse.status);
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const text = await webResponse.text();
    res.send(text);
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
}

app.get("/api/search", (req, res) => forwardFunction(searchGet, req, res));
app.get("/api/title", (req, res) => forwardFunction(titleGet, req, res));

app.use(
  express.static(SITE_DIR, {
    extensions: ["html"],
    index: ["index.html"],
  })
);

app.use((req, res) => {
  const notFoundPath = path.join(SITE_DIR, "404.html");
  if (fs.existsSync(notFoundPath)) {
    res.status(404).sendFile(notFoundPath);
  } else {
    res.status(404).send("Page Not Found");
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Moview preview server listening on http://${HOST}:${PORT}`);
  exec("npx @11ty/eleventy && npx pagefind --site _site", (err, stdout, stderr) => {
    if (err) {
      console.error("[moview] Background build failed:", stderr || err.message);
    } else if (stdout) {
      console.log(stdout.trim());
    }
  });
});
