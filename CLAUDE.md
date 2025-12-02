# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
pnpm dev              # Start development server with .env.dev
pnpm dev:server       # Start development server with NODE_ENV=development
pnpm dev:machine      # Start machine service development server
pnpm dev:minimal      # Start minimal server

# Building and Production
pnpm build            # Build TypeScript (skips libCheck, allows implicit any)
pnpm start            # Start production server
pnpm start:server     # Start server with tsx
pnpm start:machine    # Start machine service

# Testing
pnpm test             # Run Jest tests
pnpm test:watch       # Run Jest in watch mode
pnpm test:unit        # Run Vitest unit tests
pnpm test:unit:watch  # Run Vitest unit tests in watch mode
pnpm test:integration # Run Jest integration tests
pnpm test:api         # Run API tests
pnpm test:login       # Run login tests
pnpm test:sessions    # Run session tests
pnpm test:credits     # Run credits tests
pnpm test:all         # Run all tests

# Database
pnpm migrate          # Run database migrations
pnpm migrate:proxy-port # Run proxy port migration

# Utilities
pnpm create-test-user # Create test user
pnpm client-demo      # Run client demo
pnpm verify-credits   # Verify credit deduction
```

## Architecture Overview

This is a distributed Playwright browser management system with three main components:

1. **Management Server** (`src/server.ts`): Main API server providing user management, credit billing, and session allocation
2. **Machine Service** (`src/machine/index.ts`): Runs Playwright browser instances, can be deployed as a cluster
3. **Client SDK** (`src/sdk/client.ts`): Client library for users to create and manage Playwright sessions

### Key Directories Structure

- `src/controllers/` - API request handlers (auth, session, user, file, machine)
- `src/services/` - Business logic (credits monitoring, session management, machine gRPC)
- `src/models/` - Database models (user, session, machine, credit history, operation logs)
- `src/routes/` - Fastify route definitions and middleware
- `src/machine/` - Machine service code (browser instances, gRPC service, proxy handling)
- `src/schemas/` - Zod validation schemas for API requests
- `src/plugins/` - Fastify plugins (auth, error handling, swagger, content type parsing)
- `src/middlewares/` - Request middleware (auth, logging)
- `src/utils/` - Utility functions (auth, response, logger, webhook)

### Database and Models

Uses Knex.js with SQLite or MySQL. Key models:
- Users: Authentication and credit management
- Sessions: Playwright browser session tracking
- Machines: Browser instance machine registration and monitoring
- Credit History: Billing and usage tracking
- Operation Logs: Audit trail

### File Upload Systems

Two file upload mechanisms:
1. **Standard Upload**: Files stored on management server (`/api/files/upload`)
2. **Distributed Upload**: Files transferred directly to machine instances via WebSocket for distributed architectures

### Authentication & Authorization

- JWT-based authentication with role system (admin/user)
- Credit-based billing system where usage consumes credits
- Session management with WebSocket proxy connections

### Machine Service Architecture

- gRPC communication between management server and machine instances
- WebSocket proxy for client-to-browser connections
- Browser instance lifecycle management with Playwright
- Health monitoring and automatic failover

### Testing Strategy

- Jest for integration tests
- Vitest for unit tests
- Manual API tests in `tests/` directory
- Credit system integration testing

### Development Environment

Uses dotenv with environment-specific configs (`.env.dev`). The system supports both SQLite for development and MySQL for production.

### Key Technical Details

- TypeScript with relaxed compilation settings (`skipLibCheck`, `noImplicitAny: false`)
- Fastify web framework with extensive plugin ecosystem
- Playwright for browser automation
- gRPC for inter-service communication
- WebSocket for real-time browser proxy connections