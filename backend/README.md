# AETERNA Backend API

A production-level TypeScript Express.js API with PostgreSQL, Redis, and blockchain integration for the AETERNA autonomous agent platform.

## Features

- **Production TypeScript Express.js API** with comprehensive error handling
- **PostgreSQL database** with Prisma ORM for type-safe database operations
- **Redis caching** for high-performance data access
- **JWT authentication** with refresh tokens and session management
- **WebSocket server** for real-time updates
- **Blockchain integration** with ethers.js for agent tokenization
- **Comprehensive validation** with Joi schemas
- **Rate limiting** with Redis-backed storage
- **Structured logging** with Winston
- **API documentation** with automatic endpoint discovery
- **Health monitoring** with detailed service checks

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+ (optional but recommended)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Set up the database:
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed with test data
npm run db:seed
```

### Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## API Documentation

The API is RESTful with the following endpoints:

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/logout` - Logout user
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/me` - Get current user profile

### Users
- `GET /api/v1/users/profile` - Get user profile
- `PUT /api/v1/users/profile` - Update user profile
- `POST /api/v1/users/link-wallet` - Link wallet address
- `GET /api/v1/users/stats` - Get user statistics

### Agents
- `GET /api/v1/agents` - List user agents
- `POST /api/v1/agents` - Create new agent
- `GET /api/v1/agents/:id` - Get agent details
- `PUT /api/v1/agents/:id` - Update agent
- `DELETE /api/v1/agents/:id` - Delete agent
- `GET /api/v1/agents/:id/memories` - Get agent memories
- `GET /api/v1/agents/:id/metrics` - Get agent performance metrics

### Memories
- `GET /api/v1/memories` - List user memories
- `POST /api/v1/memories` - Create new memory
- `GET /api/v1/memories/:id` - Get memory details
- `PUT /api/v1/memories/:id` - Update memory
- `DELETE /api/v1/memories/:id` - Delete memory
- `GET /api/v1/memories/search/query` - Search memories

### Transactions
- `GET /api/v1/transactions` - List user transactions
- `POST /api/v1/transactions` - Create new transaction
- `GET /api/v1/transactions/:id` - Get transaction details
- `PATCH /api/v1/transactions/:id/cancel` - Cancel pending transaction

### Health
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health status
- `GET /health/database` - Database health check
- `GET /health/redis` - Redis health check
- `GET /health/blockchain` - Blockchain health check

### WebSocket Events

Connect to `/socket.io` with authentication token:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Listen for events
socket.on('agent_status', (data) => {
  console.log('Agent status update:', data);
});

socket.on('memory_created', (data) => {
  console.log('New memory:', data);
});

socket.on('transaction_update', (data) => {
  console.log('Transaction update:', data);
});
```

## Architecture

### Database Schema

The database uses PostgreSQL with the following main entities:

- **Users** - User accounts with authentication and profile data
- **Agents** - AI agents owned by users with capabilities and configuration
- **Memories** - Agent memories with hierarchical relationships
- **Transactions** - Blockchain transactions for agent operations
- **Sessions** - User authentication sessions
- **AuditLogs** - System activity logging

### Caching Strategy

Redis is used for:
- User session caching
- API response caching
- Rate limiting counters
- WebSocket connection management

### Security

- JWT tokens with refresh token rotation
- bcrypt password hashing with configurable rounds
- API key authentication for service access
- Rate limiting per IP and user
- Input validation and sanitization
- CORS protection
- Security headers with Helmet

### Blockchain Integration

Optional blockchain integration for:
- Agent tokenization (NFTs)
- Memory storage on IPFS
- Transaction recording
- Ownership verification

## Configuration

### Environment Variables

```env
# Server
NODE_ENV=development|production
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/database

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Blockchain (optional)
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-project-id
ETHEREUM_PRIVATE_KEY=your-private-key
SMART_CONTRACT_ADDRESS=0x...

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Security
BCRYPT_SALT_ROUNDS=12
CORS_ORIGINS=http://localhost:3000
```

## Monitoring and Logging

### Health Checks

The API provides comprehensive health monitoring:

- Basic health check at `/health`
- Detailed service status at `/health/detailed`
- Individual service checks at `/health/{service}`
- Kubernetes-ready readiness and liveness probes

### Logging

Structured logging with Winston:

- Console output in development
- File rotation in production
- Different log levels (error, warn, info, debug)
- Request/response logging
- Error tracking with context

### Performance Monitoring

Built-in performance tracking:

- Response time measurement
- Memory usage monitoring
- Database query performance
- Cache hit/miss ratios
- WebSocket connection metrics

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Production Considerations

1. **Database**: Use connection pooling and read replicas
2. **Redis**: Use Redis Cluster for high availability
3. **Security**: Rotate JWT secrets regularly
4. **Monitoring**: Use APM tools like New Relic or DataDog
5. **Scaling**: Use PM2 for process management

## Development

### Code Style

- TypeScript with strict mode enabled
- ESLint for code linting
- Prettier for code formatting
- Joi for runtime validation

### Testing

- Jest for unit testing
- Supertest for API testing
- Test database isolation
- Coverage reports

### Database Migrations

```bash
# Create new migration
npx prisma migrate dev --name migration-name

# Deploy migrations to production
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details