const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize metrics
let metrics = {
  paircode: 0,
  api: 0,
  bot: 0,
  cdn: 0
};

// HTTP server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Dashboard server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New dashboard client connected');
  
  // Send current metrics to new client
  ws.send(JSON.stringify({
    type: 'INIT',
    data: metrics
  }));
  
  ws.on('close', () => {
    console.log('Dashboard client disconnected');
  });
});

// Endpoint to receive signals from other services
app.post('/signal', express.json(), (req, res) => {
  const { type } = req.body;
  
  if (metrics.hasOwnProperty(type)) {
    metrics[type]++;
    
    // Broadcast update to all connected dashboard clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'UPDATE',
          metric: type,
          value: metrics[type]
        }));
      }
    });
    
    res.status(200).json({ success: true, newCount: metrics[type] });
  } else {
    res.status(400).json({ success: false, error: 'Invalid metric type' });
  }
});

// Endpoint to get current metrics (for services that can't use WebSocket)
app.get('/metrics', (req, res) => {
  res.json(metrics);
});