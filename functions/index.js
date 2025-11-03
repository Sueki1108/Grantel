
const functions = require("firebase-functions");
const next = require("next");

const isDev = process.env.NODE_ENV !== "production";

const server = next({
  dev: isDev,
  // Location of the Next.js project
  conf: { distDir: ".next" },
});

const nextjsHandle = server.getRequestHandler();

exports.server = functions.https.onRequest((req, res) => {
  console.log("File: " + req.originalUrl);
  return server.prepare().then(() => nextjsHandle(req, res));
});
