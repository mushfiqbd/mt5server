# Silver Pro VPS Server

Node.js WebSocket server for Silver Pro Copytrade System.

## Features

- ✅ WebSocket server for real-time communication
- ✅ License verification API
- ✅ Trade signal broadcasting
- ✅ Connection monitoring
- ✅ Health check endpoints

## Installation

```bash
npm install
```

## Configuration

Edit `.env` file:
```env
PORT=8080
NODE_ENV=production
API_SECRET=your-secret-key
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Endpoints

### Health Check
```
GET /api/health
```

### Verify License
```
POST /api/verify-license
Body: { "licenseKey": "..." }
```

### Create License
```
POST /api/create-license
Body: { "user": "...", "expiryDays": 365 }
```

### Statistics
```
GET /api/stats
```

## WebSocket Protocol

### Master Registration
```json
{
  "type": "register-master",
  "apiKey": "your-api-key"
}
```

### Receiver Registration
```json
{
  "type": "register-receiver",
  "licenseKey": "your-license-key",
  "riskMode": 2
}
```

### Trade Signal
```json
{
  "type": "trade-signal",
  "trade": {
    "symbol": "EURUSD",
    "action": "BUY",
    "volume": 0.1,
    "sl": 1.0850,
    "tp": 1.0950
  }
}
```

## Demo Licenses

- `DEMO-KEY-12345678`
- `DEMO-KEY-87654321`

Both valid until end of 2025.

## Deployment

See `../DEPLOYMENT.md` for full deployment guide.

## Support

support@silverpro.network

