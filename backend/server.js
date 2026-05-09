require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const cityRouter = require('./routes/city');
const { fetchAndStoreAll } = require('./services/fetchAndStoreAll');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/cities', cityRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});



// Serve static frontend files from the 'frontend/dist' directory
// This assumes your Vite build output is in 'frontend/dist'
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

// Handle client-side routing (SPA fallback)
// All non-API routes should serve the index.html file
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  // Serve index.html for all other routes
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const connectDatabase = async () => {
  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI is not set. API routes can run, but scheduled persistence is disabled.');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
};

const startServer = () => {
  connectDatabase();

  const server = app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Set PORT to another value or stop the existing process.`);
      process.exit(1);
    }

    throw error;
  });

  cron.schedule('*/15 * * * *', async () => {
    if (mongoose.connection.readyState !== 1) {
      console.warn('Skipping scheduled data fetch because MongoDB is not connected.');
      return;
    }

    console.log('Running scheduled data fetch...');
    try {
      await fetchAndStoreAll();
      console.log('Data fetch completed');
    } catch (e) {
      console.error('Scheduled fetch error:', e);
    }
  });

  return server;
};

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
