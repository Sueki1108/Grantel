// Force redeployment by adding a comment
"use strict";

const functions = require("firebase-functions");
const next = require("next");

const isDev = process.env.NODE_ENV !== "production";

const nextjsServer = next({
  dev: isDev,
  conf: {
    distDir: ".next",
  },
});
const nextjsHandle = nextjsServer.getRequestHandler();

exports.server = functions.https.onRequest((req, res) => {
  return nextjsServer.prepare().then(() => {
    return nextjsHandle(req, res);
  });
});
