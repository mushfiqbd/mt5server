import dotenv from 'dotenv';

dotenv.config();

const config = {
  // Server
  port: parseInt(process.env.PORT) || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Security
  apiSecret: process.env.API_SECRET || 'change-this-secret-key',
  
  // Database
  dbType: process.env.DB_TYPE || 'sqlite',
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: parseInt(process.env.DB_PORT) || 3306,
  dbName: process.env.DB_NAME || 'silverpro',
  dbUser: process.env.DB_USER,
  dbPass: process.env.DB_PASS,
  
  // Email (optional)
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  
  // Monitoring (optional)
  sentryDsn: process.env.SENTRY_DSN,
  
  // Rate Limiting
  rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS) || 100,
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
  
  // License defaults
  defaultLicenseDays: parseInt(process.env.DEFAULT_LICENSE_DAYS) || 365,
  
  // Connection timeouts
  connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT) || 300000, // 5 minutes
  pingInterval: parseInt(process.env.PING_INTERVAL) || 30000, // 30 seconds
};

export default config;

