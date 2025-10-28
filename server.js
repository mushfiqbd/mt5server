import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Database from './database.js';
import Auth from './auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const API_SECRET = process.env.API_SECRET || 'change-this-secret-key-in-production';

// Initialize database and auth
const db = new Database();
const auth = new Auth(API_SECRET);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Server state
const connections = {
  masters: new Map(),
  receivers: new Map()
};

// HTTP API Routes

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const stats = await db.getConnections();
    res.json({
      status: 'online',
      timestamp: Date.now(),
      masters: connections.masters.size,
      receivers: connections.receivers.size,
      totalConnections: stats.length,
      version: '1.0.0'
    });
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({ status: 'error' });
  }
});

// License verification
app.post('/api/verify-license', async (req, res) => {
  try {
    const { licenseKey } = req.body;
    
    if (!licenseKey) {
      return res.status(400).json({ success: false, message: 'License key required' });
    }
    
    const license = await db.getLicense(licenseKey);
    
    if (!license) {
      await db.log('info', 'License verification failed', { licenseKey, reason: 'not_found' });
      return res.json({ success: false, message: 'Invalid license' });
    }
    
    const now = Math.floor(Date.now() / 1000);
    const expiryTime = license.expiry_date;
    
    if (license.status !== 'active') {
      return res.json({ success: false, message: 'License inactive' });
    }
    
    if (now > expiryTime) {
      return res.json({ success: false, message: 'License expired' });
    }
    
    // Update last verified
    await db.updateLicenseVerified(licenseKey);
    await db.log('info', 'License verified', { licenseKey, user: license.user_email });
    
    res.json({
      success: true,
      active: true,
      expiry: expiryTime * 1000,
      user: license.user_email
    });
  } catch (err) {
    console.error('License verification error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create license (protected)
app.post('/api/create-license', auth.authenticate.bind(auth), async (req, res) => {
  try {
    const { user, expiryDays = 365 } = req.body;
    
    if (!user) {
      return res.status(400).json({ success: false, message: 'User email required' });
    }
    
    const licenseKey = Auth.generateLicenseKey();
    const expiryDate = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);
    
    await db.createLicense(licenseKey, user, expiryDate);
    await db.log('info', 'License created', { licenseKey, user, expiryDays });
    
    res.json({
      success: true,
      licenseKey: licenseKey,
      expiry: expiryDate * 1000,
      user: user
    });
  } catch (err) {
    console.error('License creation error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all licenses
app.get('/api/licenses', auth.authenticate.bind(auth), async (req, res) => {
  try {
    const licenses = await db.getAllLicenses();
    res.json({ success: true, licenses });
  } catch (err) {
    console.error('Get licenses error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Deactivate license
app.post('/api/deactivate-license', auth.authenticate.bind(auth), async (req, res) => {
  try {
    const { licenseKey } = req.body;
    await db.deactivateLicense(licenseKey);
    await db.log('info', 'License deactivated', { licenseKey });
    res.json({ success: true });
  } catch (err) {
    console.error('License deactivation error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const connections = await db.getConnections();
    const recentTrades = await db.getRecentTrades(10);
    
    res.json({
      masters: connections.filter(c => c.type === 'master').length,
      receivers: connections.filter(c => c.type === 'receiver').length,
      totalConnections: connections.length,
      recentTrades: recentTrades
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get logs
app.get('/api/logs', auth.authenticate.bind(auth), async (req, res) => {
  try {
    const { level, limit = 100 } = req.query;
    const logs = await db.getLogs(level || null, parseInt(limit));
    res.json({ success: true, logs });
  } catch (err) {
    console.error('Get logs error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Send trade (HTTP API for MQL5 bots)
app.post('/api/send-trade', async (req, res) => {
  try {
    const { symbol, action, volume, sl, tp, apiKey, licenseKey } = req.body;
    
    // Validate trade data
    if (!symbol || !action || !volume) {
      return res.status(400).json({ success: false, message: 'Missing required trade data' });
    }
    
    // Log trade
    await db.logTrade(licenseKey || 'http-client', symbol, action, volume, sl, tp);
    
    // Build trade signal
    const tradeSignal = { symbol, action, volume, sl, tp, licenseKey };
    
    // Broadcast to all receivers via WebSocket
    await broadcastTradeSignal(tradeSignal);
    
    res.json({ 
      success: true, 
      message: 'Trade broadcasted successfully',
      receivers: connections.receivers.size
    });
  } catch (err) {
    console.error('Send trade error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Register master bot
app.post('/api/register-master', async (req, res) => {
  try {
    const { accountName, accountNumber, accountBalance, accountCurrency, broker } = req.body;
    
    if (!accountNumber) {
      return res.status(400).json({ success: false, message: 'Account number required' });
    }
    
    // Create unique connection ID for master
    const connectionId = `master_${accountNumber}_${Date.now()}`;
    
    // Add master connection to database with account info
    await db.addConnection(connectionId, 'master', null, req.ip, {
      accountName,
      accountNumber,
      accountBalance,
      accountCurrency,
      broker
    });
    
    console.log(`✅ Master registered: ${accountName} (${accountNumber}) - ${accountCurrency} ${accountBalance}`);
    
    res.json({ 
      success: true, 
      message: 'Master registered successfully',
      connectionId,
      accountName,
      accountNumber
    });
  } catch (err) {
    console.error('Register master error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Register receiver via HTTP (for MQL5 bots that can't use WebSocket)
app.post('/api/register-receiver', async (req, res) => {
  try {
    const { licenseKey } = req.body;
    
    if (!licenseKey) {
      return res.status(400).json({ success: false, message: 'License key required' });
    }
    
    // Verify license
    const license = await db.getLicense(licenseKey);
    
    if (!license || license.status !== 'active' || Math.floor(Date.now() / 1000) > license.expiry_date) {
      return res.status(401).json({ success: false, message: 'Invalid or expired license' });
    }
    
    // Get active master info
    const masters = await db.getConnectionsByType('master');
    let masterName = "Unknown";
    let masterBroker = "";
    
    if (masters && masters.length > 0) {
      const master = masters[0]; // Get first active master
      masterName = master.account_name || "Unknown";
      masterBroker = master.broker || "";
    }
    
    res.json({ 
      success: true, 
      message: 'Receiver registered',
      expiry: license.expiry_date * 1000,
      masterName: masterName,
      masterBroker: masterBroker
    });
  } catch (err) {
    console.error('Register receiver error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Heartbeat endpoint (for connection keepalive)
app.post('/api/heartbeat', async (req, res) => {
  try {
    const { connectionId, type } = req.body;
    if (connectionId) {
      await db.updateConnectionPing(connectionId);
    }
    res.json({ success: true, timestamp: Date.now() });
  } catch (err) {
    console.error('Heartbeat error:', err);
    res.status(500).json({ success: false });
  }
});

// Generate API key (admin only)
app.post('/api/generate-api-key', auth.authenticate.bind(auth), (req, res) => {
  const apiKey = Auth.generateAPIKey();
  res.json({ success: true, apiKey });
});

// WebSocket Server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Silver Pro Server listening on port ${PORT}`);
  
  // Initialize database
  try {
    await db.connect();
    await db.init();
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Database initialization failed:', err);
    process.exit(1);
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', async (ws, req) => {
  const clientId = uuidv4();
  const ipAddress = req.socket.remoteAddress;
  
  console.log(`✅ New connection: ${clientId} from ${ipAddress}`);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (!data || typeof data !== 'object') {
        console.log('Invalid message format from client:', clientId);
        return;
      }
      
      switch(data.type) {
        case 'register-master':
          await registerMaster(clientId, ws, data, ipAddress);
          break;
          
        case 'register-receiver':
          await registerReceiver(clientId, ws, data, ipAddress);
          break;
          
        case 'trade-signal':
          if (data.trade && typeof data.trade === 'object') {
            await broadcastTradeSignal(data.trade);
          }
          break;
          
        case 'ping':
          await handlePing(clientId, data);
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (err) {
      console.error('Error handling message:', err);
      await db.log('error', 'WebSocket message error', { clientId, error: err.message });
    }
  });
  
  ws.on('close', async () => {
    console.log(`❌ Client disconnected: ${clientId}`);
    await unregisterMaster(clientId);
    await unregisterReceiver(clientId);
    await db.log('info', 'Client disconnected', { clientId });
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    db.log('error', 'WebSocket error', { clientId, error: error.message });
  });
});

async function registerMaster(id, ws, data, ip) {
  // Verify API key
  if (!auth.verifyAPIKey(data.apiKey)) {
    ws.close(1008, 'Invalid API key');
    return;
  }
  
  connections.masters.set(id, {
    ws,
    apiKey: data.apiKey,
    connected: Date.now(),
    ping: 0,
    ipAddress: ip
  });
  
  await db.addConnection(id, 'master', null, ip);
  await db.log('info', 'Master registered', { connectionId: id });
  
  broadcastToReceivers({
    type: 'connection-update',
    masters: connections.masters.size
  });
  
  console.log(`📡 Master registered: ${id}`);
}

async function registerReceiver(id, ws, data, ip) {
  // Verify license
  const license = await db.getLicense(data.licenseKey);
  
  if (!license || license.status !== 'active' || Math.floor(Date.now() / 1000) > license.expiry_date) {
    ws.close(1008, 'Invalid or expired license');
    await db.log('warn', 'Receiver rejected', { connectionId: id, licenseKey: data.licenseKey });
    return;
  }
  
  connections.receivers.set(id, {
    ws,
    licenseKey: data.licenseKey,
    connected: Date.now(),
    riskMode: data.riskMode || 1,
    ipAddress: ip
  });
  
  await db.addConnection(id, 'receiver', data.licenseKey, ip);
  await db.log('info', 'Receiver registered', { connectionId: id, licenseKey: data.licenseKey });
  
  broadcastToMasters({
    type: 'receiver-update',
    totalReceivers: connections.receivers.size
  });
  
  console.log(`📥 Receiver registered: ${id}`);
}

async function unregisterMaster(id) {
  if (connections.masters.delete(id)) {
    await db.removeConnection(id);
    broadcastToReceivers({
      type: 'connection-update',
      masters: connections.masters.size
    });
  }
}

async function unregisterReceiver(id) {
  if (connections.receivers.delete(id)) {
    await db.removeConnection(id);
    broadcastToMasters({
      type: 'receiver-update',
      totalReceivers: connections.receivers.size
    });
  }
}

async function broadcastTradeSignal(trade) {
  if (!trade || typeof trade !== 'object') {
    console.error('Invalid trade signal:', trade);
    return;
  }
  
  console.log(`📤 Broadcasting trade signal:`, trade);
  
  // Log trade to database
  try {
    await db.logTrade(
      trade.licenseKey || 'master',
      trade.symbol || 'UNKNOWN',
      trade.action || 'UNKNOWN',
      trade.volume || 0,
      trade.sl || null,
      trade.tp || null
    );
  } catch (err) {
    console.error('Error logging trade:', err);
  }
  
  // Broadcast to all receivers
  const message = JSON.stringify({
    type: 'trade-signal',
    trade: trade,
    timestamp: Date.now()
  });
  
  let sent = 0;
  connections.receivers.forEach((receiver) => {
    try {
      if (receiver && receiver.ws) {
        receiver.ws.send(message);
        sent++;
      }
    } catch (err) {
      console.error('Error sending to receiver:', err);
    }
  });
  
  console.log(`✅ Signal sent to ${sent} receivers`);
  await db.log('info', 'Trade signal broadcasted', { symbol: trade.symbol || 'UNKNOWN', receivers: sent });
}

function broadcastToReceivers(data) {
  const message = JSON.stringify(data);
  connections.receivers.forEach((receiver) => {
    try {
      if (receiver && receiver.ws && receiver.ws.readyState === 1) { // 1 = OPEN
        receiver.ws.send(message);
      }
    } catch (err) {
      console.error('Error broadcasting to receiver:', err);
    }
  });
}

function broadcastToMasters(data) {
  const message = JSON.stringify(data);
  connections.masters.forEach((master) => {
    try {
      if (master && master.ws && master.ws.readyState === 1) { // 1 = OPEN
        master.ws.send(message);
      }
    } catch (err) {
      console.error('Error broadcasting to master:', err);
    }
  });
}

async function handlePing(connectionId, data) {
  await db.updateConnectionPing(connectionId);
  
  // Update last ping in connections
  if (connections.masters.has(connectionId)) {
    const master = connections.masters.get(connectionId);
    master.lastPing = Date.now();
  }
  
  if (connections.receivers.has(connectionId)) {
    const receiver = connections.receivers.get(connectionId);
    receiver.lastPing = Date.now();
  }
}

// Periodic cleanup (remove old connections, old logs)
setInterval(async () => {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 300; // 5 minutes
    await db.run('DELETE FROM connections WHERE last_ping < ? AND status = ?', [cutoff, 'active']);
    
    // Keep only last 10,000 logs
    await db.run('DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY timestamp DESC LIMIT 10000)');
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}, 60000); // Every minute

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await db.log('info', 'Server shutting down');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await db.log('info', 'Server shutting down');
  await db.close();
  process.exit(0);
});

console.log('✨ Silver Pro Copytrade Server initialized');
