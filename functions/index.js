/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/hhttps");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const {https} = require('firebase-functions');
const next = require('next');

const isDev = process.env.NODE_ENV !== 'production';

const server = next({
  dev: isDev,
  // Location of the Next.js project
  conf: {distDir: '.next'},
});

const nextjsHandle = server.getRequestHandler();

exports.server = https.onRequest((req, res) => {
  // log the page.js file path
  // This log is output to the Firebase Functions logs
  console.log('File: ' + req.originalUrl);
  return server.prepare().then(() => nextjsHandle(req, res));
});
