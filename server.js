const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;
const CONFIG_FILE = path.join(__dirname, 'mongodb_config.json');

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '15mb' }));

// -------------------------------------------------------------
// MongoDB State & Connection Manager
// -------------------------------------------------------------
let mongoClient = null;
let mongoDb = null;
let mongoStatus = 'unconfigured'; // 'unconfigured' | 'connecting' | 'connected' | 'error'
let lastSyncTime = null;
let lastSyncTimestamp = Date.now();
let activeUri = process.env.MONGODB_URI_EM || process.env.MONGODB_URI || null;

// Read locally saved config if environment variable is not present
if (!activeUri && fs.existsSync(CONFIG_FILE)) {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.uri) activeUri = parsed.uri;
  } catch (err) {
    console.error('Failed to read mongodb_config.json:', err.message);
  }
}

async function connectToMongo(uri) {
  if (!uri) {
    mongoStatus = 'unconfigured';
    return { success: false, message: 'No MongoDB URI provided' };
  }

  mongoStatus = 'connecting';
  try {
    if (mongoClient) {
      try { await mongoClient.close(); } catch (e) {}
    }

    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 7000,
      connectTimeoutMS: 10000
    });

    await client.connect();
    // Ping to confirm connection
    await client.db('admin').command({ ping: 1 });

    mongoClient = client;
    mongoDb = client.db('gps_english_medium');
    activeUri = uri;
    mongoStatus = 'connected';
    console.log('✔ Connected to MongoDB Atlas successfully! Database: gps_english_medium');

    // Save URI locally for auto-reconnect on server restart
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ uri: activeUri, updatedAt: new Date().toISOString() }, null, 2));
    } catch (e) {}

    return { success: true, message: 'Connected to MongoDB Atlas (English Medium)' };
  } catch (err) {
    let msg = err.message || '';
    if (msg.includes('SSL alert number 80') || msg.includes('tlsv1 alert internal error')) {
      msg = 'MongoDB Atlas rejected connection (SSL alert 80). Your IP address is not whitelisted. In MongoDB Atlas, go to Network Access -> Add IP Address -> 0.0.0.0/0 (Allow Access from Anywhere).';
    }
    console.error('❌ MongoDB Atlas connection error:', msg);
    mongoStatus = 'error';
    return { success: false, error: msg };
  }
}

// Auto-connect on startup if URI is available
if (activeUri) {
  connectToMongo(activeUri);
}

// -------------------------------------------------------------
// API Endpoints for MongoDB Atlas Database
// -------------------------------------------------------------

function getLocalNetworkIp() {
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

// 1. Health & Connection Status
app.get('/api/db/status', (req, res) => {
  const localIp = getLocalNetworkIp();
  res.json({
    dbType: 'mongodb',
    status: mongoStatus,
    connected: mongoStatus === 'connected',
    hasUri: !!activeUri,
    database: mongoDb ? mongoDb.databaseName : null,
    lastSyncTime: lastSyncTime,
    lastSyncTimestamp: lastSyncTimestamp,
    localIp: localIp,
    networkUrl: localIp ? `http://${localIp}:${PORT}` : null,
    port: PORT
  });
});

// 2. Set / Update MongoDB Atlas Connection String
app.post('/api/db/connect', async (req, res) => {
  const { uri } = req.body;
  if (!uri || typeof uri !== 'string') {
    return res.status(400).json({ success: false, error: 'Valid MongoDB connection string is required.' });
  }

  const result = await connectToMongo(uri.trim());
  if (result.success) {
    res.json({ success: true, status: 'connected', message: 'Successfully connected to MongoDB Atlas!' });
  } else {
    res.status(500).json({ success: false, status: 'error', error: result.error || 'Connection failed' });
  }
});

// 3. Disconnect / Clear MongoDB Config
app.post('/api/db/disconnect', async (req, res) => {
  try {
    if (mongoClient) {
      await mongoClient.close();
      mongoClient = null;
      mongoDb = null;
    }
    activeUri = null;
    mongoStatus = 'unconfigured';
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    res.json({ success: true, message: 'Disconnected from MongoDB Atlas' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Fetch All School Data from MongoDB
app.get('/api/db/school', async (req, res) => {
  if (mongoStatus !== 'connected' || !mongoDb) {
    return res.status(503).json({ success: false, error: 'MongoDB Atlas is not connected' });
  }

  try {
    const collection = mongoDb.collection('school_data');
    const doc = await collection.findOne({ _id: 'glorious_public_school' });
    res.json({ success: true, data: doc || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Sync Entire School Data to MongoDB Atlas
app.post('/api/db/sync', async (req, res) => {
  if (mongoStatus !== 'connected' || !mongoDb) {
    return res.status(503).json({ success: false, error: 'MongoDB Atlas is not connected' });
  }

  try {
    const { teachers, students, marks, attendance, upcomingTests, activeTeacherId } = req.body;
    const collection = mongoDb.collection('school_data');

    const updateDoc = {
      $set: {
        updatedAt: new Date(),
        lastTeacherId: activeTeacherId || null
      }
    };

    if (Array.isArray(teachers)) updateDoc.$set.teachers = teachers;
    if (Array.isArray(students)) updateDoc.$set.students = students;
    if (Array.isArray(marks)) updateDoc.$set.marks = marks;
    if (Array.isArray(attendance)) updateDoc.$set.attendance = attendance;
    if (upcomingTests) updateDoc.$set.upcomingTests = upcomingTests;

    await collection.updateOne(
      { _id: 'glorious_public_school' },
      updateDoc,
      { upsert: true }
    );

    // Also sync teacher-specific isolated document if activeTeacherId provided
    if (activeTeacherId) {
      const teachersCol = mongoDb.collection('teachers_data');
      await teachersCol.updateOne(
        { _id: activeTeacherId },
        {
          $set: {
            updatedAt: new Date(),
            students: students || [],
            marks: marks || [],
            attendance: attendance || [],
            upcomingTests: upcomingTests || {}
          }
        },
        { upsert: true }
      );
    }

    lastSyncTime = new Date().toLocaleTimeString();
    lastSyncTimestamp = Date.now();
    res.json({ success: true, lastSyncTime, lastSyncTimestamp });
  } catch (err) {
    console.error('Sync to MongoDB error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Factory Reset / Wipe School Data in MongoDB Atlas
app.post('/api/db/reset', async (req, res) => {
  if (mongoStatus !== 'connected' || !mongoDb) {
    return res.status(503).json({ success: false, error: 'MongoDB Atlas is not connected' });
  }

  try {
    const { mode, seedStudents, seedMarks, seedAttendance, seedUpcomingTests } = req.body;
    const collection = mongoDb.collection('school_data');
    const teachersCol = mongoDb.collection('teachers_data');

    let updateDoc = {
      $set: {
        updatedAt: new Date(),
        resetMode: mode || 'wipe'
      }
    };

    if (mode === 'wipe' || mode === 'all' || !mode) {
      updateDoc.$set.students = [];
      updateDoc.$set.marks = [];
      updateDoc.$set.attendance = [];
      updateDoc.$set.upcomingTests = [];
      await teachersCol.deleteMany({});
    } else if (mode === 'marks_only') {
      updateDoc.$set.marks = [];
      updateDoc.$set.attendance = [];
      updateDoc.$set.upcomingTests = [];
      await teachersCol.updateMany({}, {
        $set: {
          updatedAt: new Date(),
          marks: [],
          attendance: [],
          upcomingTests: []
        }
      });
    } else if (mode === 'seed' || mode === 'demo') {
      if (Array.isArray(seedStudents)) updateDoc.$set.students = seedStudents;
      if (Array.isArray(seedMarks)) updateDoc.$set.marks = seedMarks;
      if (Array.isArray(seedAttendance)) updateDoc.$set.attendance = seedAttendance;
      if (seedUpcomingTests) updateDoc.$set.upcomingTests = seedUpcomingTests;
    }

    await collection.updateOne(
      { _id: 'glorious_public_school' },
      updateDoc,
      { upsert: true }
    );

    lastSyncTime = new Date().toLocaleTimeString();
    lastSyncTimestamp = Date.now();
    console.log(`✔ [MongoDB] Database reset (${mode || 'wipe'}) applied successfully.`);
    res.json({ success: true, mode: mode || 'wipe', lastSyncTime, lastSyncTimestamp });
  } catch (err) {
    console.error('Reset MongoDB error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Serve Static Frontend Assets
// -------------------------------------------------------------
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for any unhandled routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
if (require.main === module) {
  const localIp = getLocalNetworkIp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 Glorious Public School Tracker (English Medium) is running!`);
    console.log(`💻 PC Local URL:        http://localhost:${PORT}`);
    if (localIp) {
      console.log(`📱 Mobile Phone (Wi-Fi): http://${localIp}:${PORT}`);
    }
    console.log(`📦 Database:            MongoDB Atlas [gps_english_medium] (State: ${mongoStatus})`);
    console.log(`=======================================================`);
  });
}

module.exports = { app, connectToMongo };
