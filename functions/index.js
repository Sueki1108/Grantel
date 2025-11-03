"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const next = require("next");

const isDev = process.env.NODE_ENV !== "production";

const nextjsServer = next({
  dev: isDev,
  conf: {
    distDir: ".next",
  },
});
const nextjsHandle = nextjsServer.getRequestHandler();

exports.server = onRequest((req, res) => {
  return nextjsServer.prepare().then(() => {
    return nextjsHandle(req, res);
  });
});
