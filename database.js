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
        account_name TEXT,
        account_number TEXT,
        account_balance REAL,
        account_currency TEXT,
        broker TEXT,
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
      )`,
      
      `CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        api_key TEXT UNIQUE,
        status TEXT DEFAULT 'active',
        last_login INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`,
      
      `CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES admin_users(id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS dashboard_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        setting_key TEXT NOT NULL,
        setting_value TEXT,
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, setting_key),
        FOREIGN KEY (user_id) REFERENCES admin_users(id)
      )`
    ];

    for (const query of queries) {
      await this.run(query);
    }
    
    // Create indexes for performance
    await this.run('CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_connections_id ON connections(connection_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_dashboard_settings_user ON dashboard_settings(user_id)');
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
    // Increment activation_count only on first successful verification
    // Prevents re-verification from inflating the count
    return this.run(
      `UPDATE licenses 
         SET last_verified = ?, 
             activation_count = CASE 
               WHEN activation_count IS NULL THEN 1 
               WHEN activation_count < 1 THEN activation_count + 1 
               ELSE activation_count 
             END 
       WHERE license_key = ?`,
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
  async addConnection(connectionId, type, licenseKey, ipAddress, accountInfo = null) {
    // Check if connection already exists
    const existing = await this.getConnectionById(connectionId);
    if (existing) {
      // Update existing connection
      const fields = ['status = ?', 'last_ping = ?'];
      const values = ['active', Math.floor(Date.now() / 1000)];
      
      if (accountInfo) {
        if (accountInfo.accountName) {
          fields.push('account_name = ?');
          values.push(accountInfo.accountName);
        }
        if (accountInfo.accountNumber) {
          fields.push('account_number = ?');
          values.push(accountInfo.accountNumber);
        }
        if (accountInfo.accountBalance !== undefined) {
          fields.push('account_balance = ?');
          values.push(accountInfo.accountBalance);
        }
        if (accountInfo.accountCurrency) {
          fields.push('account_currency = ?');
          values.push(accountInfo.accountCurrency);
        }
        if (accountInfo.broker) {
          fields.push('broker = ?');
          values.push(accountInfo.broker);
        }
      }
      
      values.push(connectionId);
      return this.run(
        `UPDATE connections SET ${fields.join(', ')} WHERE connection_id = ?`,
        values
      );
    }
    
    // Insert new connection
    if (accountInfo) {
      return this.run(
        `INSERT INTO connections (connection_id, type, license_key, ip_address, account_name, account_number, account_balance, account_currency, broker, last_ping) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          connectionId, 
          type, 
          licenseKey, 
          ipAddress, 
          accountInfo.accountName || null,
          accountInfo.accountNumber || null,
          accountInfo.accountBalance || null,
          accountInfo.accountCurrency || null,
          accountInfo.broker || null,
          Math.floor(Date.now() / 1000)
        ]
      );
    }
    
    return this.run(
      'INSERT INTO connections (connection_id, type, license_key, ip_address, last_ping) VALUES (?, ?, ?, ?, ?)',
      [connectionId, type, licenseKey, ipAddress, Math.floor(Date.now() / 1000)]
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

  async getConnectionsByType(type) {
    return this.all('SELECT * FROM connections WHERE type = ? AND status = ?', [type, 'active']);
  }

  async getConnectionById(connectionId) {
    return this.get('SELECT * FROM connections WHERE connection_id = ?', [connectionId]);
  }

  async updateConnection(connectionId, data) {
    const fields = [];
    const values = [];
    
    if (data.license_key !== undefined) {
      fields.push('license_key = ?');
      values.push(data.license_key);
    }
    if (data.last_ping !== undefined) {
      fields.push('last_ping = ?');
      values.push(data.last_ping);
    }
    
    if (fields.length === 0) return;
    
    values.push(connectionId);
    return this.run(`UPDATE connections SET ${fields.join(', ')} WHERE connection_id = ?`, values);
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

  // Admin user methods
  async createAdminUser(username, email, passwordHash, apiKey = null) {
    return this.run(
      'INSERT INTO admin_users (username, email, password_hash, api_key) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, apiKey]
    );
  }

  async getAdminByEmail(email) {
    return this.get('SELECT * FROM admin_users WHERE email = ? AND status = ?', [email, 'active']);
  }

  async getAdminByUsername(username) {
    return this.get('SELECT * FROM admin_users WHERE username = ? AND status = ?', [username, 'active']);
  }

  async getAdminByApiKey(apiKey) {
    return this.get('SELECT * FROM admin_users WHERE api_key = ? AND status = ?', [apiKey, 'active']);
  }

  async updateAdminLastLogin(userId) {
    return this.run('UPDATE admin_users SET last_login = ? WHERE id = ?', [Math.floor(Date.now() / 1000), userId]);
  }

  async getAllAdmins() {
    return this.all('SELECT id, username, email, role, status, last_login, created_at FROM admin_users');
  }

  // Session methods
  async createSession(userId, sessionToken, ipAddress, userAgent, expiresAt) {
    return this.run(
      'INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
      [userId, sessionToken, ipAddress, userAgent, expiresAt]
    );
  }

  async getSession(sessionToken) {
    const now = Math.floor(Date.now() / 1000);
    return this.get(
      'SELECT s.*, u.username, u.email, u.role FROM user_sessions s JOIN admin_users u ON s.user_id = u.id WHERE s.session_token = ? AND s.expires_at > ?',
      [sessionToken, now]
    );
  }

  async deleteSession(sessionToken) {
    return this.run('DELETE FROM user_sessions WHERE session_token = ?', [sessionToken]);
  }

  async deleteExpiredSessions() {
    const now = Math.floor(Date.now() / 1000);
    return this.run('DELETE FROM user_sessions WHERE expires_at < ?', [now]);
  }

  // Dashboard settings methods
  async saveSetting(userId, key, value) {
    return this.run(
      'INSERT OR REPLACE INTO dashboard_settings (user_id, setting_key, setting_value, updated_at) VALUES (?, ?, ?, ?)',
      [userId, key, value, Math.floor(Date.now() / 1000)]
    );
  }

  async getSetting(userId, key) {
    const result = await this.get(
      'SELECT setting_value FROM dashboard_settings WHERE user_id = ? AND setting_key = ?',
      [userId, key]
    );
    return result ? result.setting_value : null;
  }

  async getAllSettings(userId) {
    const rows = await this.all(
      'SELECT setting_key, setting_value FROM dashboard_settings WHERE user_id = ?',
      [userId]
    );
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    return settings;
  }

  async deleteSetting(userId, key) {
    return this.run(
      'DELETE FROM dashboard_settings WHERE user_id = ? AND setting_key = ?',
      [userId, key]
    );
  }
}

export default Database;

