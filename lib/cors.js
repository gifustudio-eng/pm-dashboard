// lib/cors.js
// CORS handler untuk Vercel Serverless Functions

function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true; // request handled
  }
  return false; // lanjut ke handler
}

module.exports = { cors };
