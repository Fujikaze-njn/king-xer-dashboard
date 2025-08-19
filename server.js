const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
const MONGODB_URI = 'mongodb+srv://Alya:Alya2006@alya.wnpwwot.mongodb.net/dashboard?retryWrites=true&w=majority&appName=Alya';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define metrics schema
const metricsSchema = new mongoose.Schema({
  paircode: { type: Number, default: 0 },
  api: { type: Number, default: 0 },
  bot: { type: Number, default: 0 },
  cdn: { type: Number, default: 0 }
});

// Create metrics model
const Metrics = mongoose.model('Metrics', metricsSchema);

// Initialize metrics
let metrics = {
  paircode: 0,
  api: 0,
  bot: 0,
  cdn: 0
};

// Load metrics from database on startup
async function loadMetrics() {
  try {
    let savedMetrics = await Metrics.findOne();
    if (savedMetrics) {
      metrics = savedMetrics;
      console.log('Metrics loaded from database:', metrics);
    } else {
      // Create initial metrics document if none exists
      savedMetrics = new Metrics(metrics);
      await savedMetrics.save();
      console.log('Initial metrics saved to database');
    }
  } catch (err) {
    console.error('Error loading metrics from database:', err);
  }
}

loadMetrics();

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

// Function to update metrics in database
async function updateMetricInDatabase(type, value) {
  try {
    await Metrics.findOneAndUpdate(
      {}, 
      { [type]: value },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Error updating metric in database:', err);
  }
}

// Endpoint to receive signals from other services
app.post('/signal', express.json(), async (req, res) => {
  const { type } = req.body;
  
  if (metrics.hasOwnProperty(type)) {
    metrics[type]++;
    
    // Update metric in database
    await updateMetricInDatabase(type, metrics[type]);
    
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

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  // Save current metrics to database before exiting
  try {
    await Metrics.findOneAndUpdate({}, metrics, { upsert: true });
    console.log('Metrics saved to database');
  } catch (err) {
    console.error('Error saving metrics during shutdown:', err);
  }
  
  server.close(() => {
    mongoose.connection.close();
    console.log('Server shut down');
    process.exit(0);
  });
});