import sqlite3 from 'sqlite3';
import { promisify } from 'util';

class Database {
  constructor() {
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database('./silverpro.db', (err) => {
        if (err) {
          console.error('❌ Database connection error:', err);
          reject(err);
        } else {
          console.log('✅ Database connected');
          resolve();
        }
      });
    });
  }

  async init() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE NOT NULL,
        user_email TEXT,
        status TEXT DEFAULT 'active',
        expiry_date INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        last_verified INTEGER,
        activation_count INTEGER DEFAULT 0
      )`,
      
      `CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT,
        symbol TEXT NOT NULL,
        action TEXT NOT NULL,
        volume REAL NOT NULL,
        sl REAL,
        tp REAL,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        executed BOOLEAN DEFAULT 0,
        FOREIGN KEY (license_key) REFERENCES licenses(license_key)
      )`,
      
      `CREATE TABLE IF NOT EXISTS connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connection_id TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        license_key TEXT,
        ip_address TEXT,
        connected_at INTEGER DEFAULT (strftime('%s', 'now')),
        last_ping INTEGER,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (license_key) REFERENCES licenses(license_key)
      )`,
      
      `CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      )`
    ];

    for (const query of queries) {
      await this.run(query);
    }
    
    // Create indexes for performance
    await this.run('CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_connections_id ON connections(connection_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp)');
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('❌ Database query error:', err);
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database closed');
          resolve();
        }
      });
    });
  }

  // License methods
  async createLicense(licenseKey, userEmail, expiryDate) {
    return this.run(
      'INSERT INTO licenses (license_key, user_email, expiry_date) VALUES (?, ?, ?)',
      [licenseKey, userEmail, expiryDate]
    );
  }

  async getLicense(licenseKey) {
    return this.get('SELECT * FROM licenses WHERE license_key = ?', [licenseKey]);
  }

  async updateLicenseVerified(licenseKey) {
    return this.run(
      'UPDATE licenses SET last_verified = ?, activation_count = activation_count + 1 WHERE license_key = ?',
      [Math.floor(Date.now() / 1000), licenseKey]
    );
  }

  async getAllLicenses() {
    return this.all('SELECT * FROM licenses ORDER BY created_at DESC');
  }

  async deactivateLicense(licenseKey) {
    return this.run('UPDATE licenses SET status = ? WHERE license_key = ?', ['inactive', licenseKey]);
  }

  // Connection methods
  async addConnection(connectionId, type, licenseKey, ipAddress) {
    return this.run(
      'INSERT INTO connections (connection_id, type, license_key, ip_address) VALUES (?, ?, ?, ?)',
      [connectionId, type, licenseKey, ipAddress]
    );
  }

  async removeConnection(connectionId) {
    return this.run('UPDATE connections SET status = ? WHERE connection_id = ?', ['disconnected', connectionId]);
  }

  async updateConnectionPing(connectionId) {
    return this.run('UPDATE connections SET last_ping = ? WHERE connection_id = ?', [Math.floor(Date.now() / 1000), connectionId]);
  }

  async getConnections() {
    return this.all('SELECT * FROM connections WHERE status = ?', ['active']);
  }

  // Trade methods
  async logTrade(licenseKey, symbol, action, volume, sl, tp) {
    return this.run(
      'INSERT INTO trades (license_key, symbol, action, volume, sl, tp) VALUES (?, ?, ?, ?, ?, ?)',
      [licenseKey, symbol, action, volume, sl, tp]
    );
  }

  async getRecentTrades(limit = 100) {
    return this.all('SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?', [limit]);
  }

  async getTradesByLicense(licenseKey, limit = 50) {
    return this.all('SELECT * FROM trades WHERE license_key = ? ORDER BY timestamp DESC LIMIT ?', [licenseKey, limit]);
  }

  // Logging methods
  async log(level, message, metadata = null) {
    return this.run(
      'INSERT INTO logs (level, message, metadata) VALUES (?, ?, ?)',
      [level, message, JSON.stringify(metadata)]
    );
  }

  async getLogs(level = null, limit = 1000) {
    if (level) {
      return this.all('SELECT * FROM logs WHERE level = ? ORDER BY timestamp DESC LIMIT ?', [level, limit]);
    }
    return this.all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?', [limit]);
  }
}

export default Database;

