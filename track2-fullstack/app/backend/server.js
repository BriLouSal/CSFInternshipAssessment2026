const express = require('express');
const path = require('path');
const { initDb } = require('./db');
const animalsRouter = require('./routes/animals');
const paddocksRouter = require('./routes/paddocks');

const app = express();
const PORT = process.env.PORT || 3000;

// Add a limit to prevent JSON huge payloads that'll cause the server to slow down or wastes memory

app.use(express.json({ limit: '50kb' }))
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/animals', animalsRouter);
app.use('/api/paddocks', paddocksRouter);

initDb();

function start(port = PORT) {
  const server = app.listen(port, () => {
    const address = server.address();
    const resolvedPort = address && typeof address === 'object' ? address.port : port;
    console.log(`FarmTracker running at http://localhost:${resolvedPort}`);
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = app;
module.exports.start = start;
