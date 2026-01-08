# DarkMode AI Server

Backend API server for DarkMode AI - a real-time interview and meeting assistant.

## Tech Stack

- **Runtime**: Node.js + Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: JWT with refresh tokens
- **Payments**: Stripe
- **Storage**: Local filesystem or S3/Cloudflare R2
- **Email**: SMTP (Resend, SendGrid, etc.)

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- (Optional) Stripe account for payments
- (Optional) S3/R2 bucket for file storage

### Local Development

1. **Clone and install:**
   ```bash
   git clone https://github.com/plutaslab-hq/darkmode-ai-server.git
   cd darkmode-ai-server
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Set up database:**
   ```bash
   # Start PostgreSQL (using Docker)
   docker compose up -d

   # Run migrations
   npx prisma db push

   # (Optional) Seed data
   npm run seed
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

Server runs at `http://localhost:3001`

### Environment Variables

See `.env.example` for all available configuration options.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for access tokens
- `JWT_REFRESH_SECRET` - Secret for refresh tokens

**Optional:**
- `STRIPE_*` - Stripe payment configuration
- `AWS_*` - S3/R2 storage configuration
- `SMTP_*` - Email service configuration

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/verify-email` - Verify email address

### User
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update profile
- `PUT /api/user/settings` - Update settings

### Sessions
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/:id` - Get session
- `PUT /api/sessions/:id` - Update session
- `DELETE /api/sessions/:id` - Delete session

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents/upload` - Upload document
- `GET /api/documents/:id` - Get document
- `DELETE /api/documents/:id` - Delete document

### Subscriptions
- `POST /api/subscriptions/checkout` - Create checkout session
- `POST /api/subscriptions/portal` - Create billing portal session
- `GET /api/subscriptions/status` - Get subscription status

### Webhooks
- `POST /api/webhooks/stripe` - Stripe webhook handler

## Deployment

### Railway (Recommended)

1. Create a new project on [Railway](https://railway.app)
2. Add PostgreSQL database
3. Deploy from GitHub
4. Set environment variables
5. Railway will auto-detect the `railway.json` config

### Docker

```bash
docker build -t darkmode-ai-server .
docker run -p 3001:3001 --env-file .env darkmode-ai-server
```

## License

MIT License - see [LICENSE](LICENSE)

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
