/**
 * Netlify Function → Express API
 * Paths: /api/*  (via _redirects / netlify.toml)
 */
const serverless = require("serverless-http");

/* Detekto cloud PARA se të ngarkohet server/db.js (mkdir /tmp) */
process.env.DB_MODE = process.env.DB_MODE || "sqlite";
process.env.NETLIFY = process.env.NETLIFY || "true";
process.env.AWS_LAMBDA_FUNCTION_NAME =
  process.env.AWS_LAMBDA_FUNCTION_NAME || "gjeodeti-api";

let cached;

function normalizeEventPath(event) {
  let p = event.path || event.rawPath || "/";
  // "/.netlify/functions/api/auth/login" → "/auth/login"
  p = p.replace(/^\/\.netlify\/functions\/[^/]+/, "");
  if (!p || p === "/") p = "/";
  // Ensure Express sees "/api/..."
  if (!p.startsWith("/api")) {
    p = "/api" + (p.startsWith("/") ? p : `/${p}`);
  }
  event.path = p;
  if (event.rawPath) event.rawPath = p;
  return event;
}

async function getHandler() {
  if (cached) return cached;
  const { createApp } = require("../../server/index");
  const app = await createApp({ apiOnly: true });
  cached = serverless(app, {
    binary: ["image/*", "application/octet-stream"],
  });
  return cached;
}

exports.handler = async (event, context) => {
  try {
    normalizeEventPath(event);
    const handler = await getHandler();
    return await handler(event, context);
  } catch (err) {
    console.error("API function error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: err.message || "Gabim në Netlify Function",
        hint: "Kontrollo Function logs në Netlify → Functions",
      }),
    };
  }
};
