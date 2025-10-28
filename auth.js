import crypto from 'crypto';

class Auth {
  constructor(secretKey) {
    this.secretKey = secretKey || process.env.API_SECRET || 'change-this-secret';
  }

  // Generate secure API key
  static generateAPIKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate license key
  static generateLicenseKey() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex').toUpperCase();
    return `SP-${timestamp}-${random}`;
  }

  // Verify API key
  verifyAPIKey(apiKey) {
    // In production, check against database
    return apiKey && apiKey.length > 16;
  }

  // Hash license key for verification
  hashLicenseKey(licenseKey) {
    return crypto.createHash('sha256').update(licenseKey).digest('hex');
  }

  // Generate JWT-like token for short-term auth
  generateToken(payload, expiryMinutes = 60) {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const payloadObj = {
      ...payload,
      iat: now,
      exp: now + (expiryMinutes * 60)
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');

    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  // Verify token
  verifyToken(token) {
    try {
      if (!token || typeof token !== 'string') {
        return null;
      }
      
      const parts = token.split('.');
      
      if (parts.length !== 3) {
        return null;
      }
      
      const [headerB64, payloadB64, signature] = parts;
      
      if (!headerB64 || !payloadB64 || !signature) {
        return null;
      }
      
      const expectedSignature = crypto
        .createHmac('sha256', this.secretKey)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Expired
      }

      return payload;
    } catch (err) {
      return null;
    }
  }

  // Middleware for authentication
  authenticate(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '') || 
                  req.headers['x-api-key'];

    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    const payload = this.verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.auth = payload;
    next();
  }

  // Rate limiting (simple in-memory implementation)
  createRateLimiter(requestsPerMinute = 60) {
    const requests = new Map();

    return (req, res, next) => {
      const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
      const now = Date.now();
      
      if (!requests.has(ip)) {
        requests.set(ip, { count: 1, resetTime: now + 60000 });
        return next();
      }

      const record = requests.get(ip);
      
      if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + 60000;
        return next();
      }

      if (record.count >= requestsPerMinute) {
        return res.status(429).json({ error: 'Too many requests' });
      }

      record.count++;
      next();
    };
  }
}

export default Auth;

