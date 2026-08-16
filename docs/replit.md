# FinanceHub SaaS - Replit Development Guide

## Overview

FinanceHub is a comprehensive SaaS financial management platform built with React, Node.js, Express, and PostgreSQL. The system provides personal finance tracking with administrative capabilities, multi-tenancy support, and API access for external integrations.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Styling**: TailwindCSS with Shadcn/UI components
- **State Management**: React Query (@tanstack/react-query) for server state
- **Build Tool**: Vite with hot module replacement
- **Component Library**: Radix UI primitives with custom styling

### Backend Architecture
- **Runtime**: Node.js with Express framework
- **Language**: TypeScript with ESM modules
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Authentication**: Session-based with express-session and API key support
- **Documentation**: Swagger/OpenAPI 3.0 integration

### Database Architecture
- **Primary Database**: PostgreSQL with timezone support (America/Sao_Paulo)
- **ORM**: Drizzle with type-safe queries
- **Multi-tenancy**: Data isolation by user with shared global resources
- **Migrations**: Drizzle Kit for schema management

## Key Components

### 1. User Management System
- **User Types**: Normal users and super administrators
- **Authentication**: Dual authentication (session cookies + API keys)
- **User States**: Active, inactive, and canceled subscription states
- **Impersonation**: Super admin capability to impersonate users for support

### 2. Financial Data Management
- **Wallets**: One wallet per user with calculated balance
- **Transactions**: Income and expense tracking with categories
- **Categories**: Global categories (read-only) + user-specific custom categories
- **Payment Methods**: Global and user-specific payment options

### 3. Administrative System
- **Dashboard**: Real-time statistics and system health monitoring
- **User Management**: CRUD operations with user state transitions
- **Analytics**: User growth, transaction volume, and distribution metrics
- **Impersonation**: Secure user impersonation with audit logging

### 4. API System
- **REST API**: Full CRUD operations for all resources
- **Authentication**: API key-based access for external integrations
- **Documentation**: Auto-generated Swagger documentation at `/docs`
- **Rate Limiting**: Built-in protection mechanisms

### 5. Reporting System
- **Chart Generation**: SVG and image-based charts using Canvas
- **PDF Reports**: Financial reports with jsPDF
- **Real-time Data**: No-cache policy for live financial data

## Data Flow

### Authentication Flow
1. User logs in via web interface (session) or provides API key
2. Middleware validates credentials and loads user context
3. For super admins: optional impersonation workflow with audit trail
4. All subsequent requests include user context for data isolation

### Transaction Flow
1. User creates transaction via web UI or API
2. System validates transaction data and user permissions
3. Transaction is stored with wallet association
4. Wallet balance is recalculated dynamically from all transactions
5. Real-time updates are propagated to UI via React Query

### Multi-tenancy Data Isolation
1. Each user has isolated wallets, transactions, and custom categories
2. Global resources (categories, payment methods) are shared read-only
3. Super admins can access all data with proper authorization checks
4. Impersonation maintains audit trail while preserving data security

## External Dependencies

### Core Dependencies
- **Database**: PostgreSQL 16 (configured in .replit)
- **ORM**: Drizzle ORM with postgres-js driver
- **Canvas**: HTML5 Canvas API for server-side chart generation
- **PDF Generation**: jsPDF for report generation
- **Authentication**: bcryptjs for password hashing

### Development Dependencies
- **Build Tools**: Vite, esbuild for production builds
- **TypeScript**: Full type safety across frontend and backend
- **Swagger**: Auto-generated API documentation
- **TailwindCSS**: Utility-first CSS framework

### External Services
- **Database Hosting**: Configured for PostgreSQL (Neon/Supabase compatible)
- **Session Storage**: In-memory store with MemoryStore
- **File Storage**: Local filesystem for temporary chart/report files

## Deployment Strategy

### Development Environment
- **Platform**: Replit with Node.js 20, Web, and PostgreSQL 16 modules
- **Hot Reload**: Vite development server with HMR
- **Database**: Local PostgreSQL instance
- **Port Configuration**: Application runs on port 5000

### Production Build
- **Build Command**: `npm run build` (Vite + esbuild)
- **Start Command**: `npm run start` (Node.js production server)
- **Deployment Target**: Autoscale (configured in .replit)
- **Static Assets**: Served from dist/public directory

### Environment Variables
- **DATABASE_URL**: PostgreSQL connection string (required)
- **NODE_ENV**: Environment mode (development/production)
- **TZ**: Timezone set to America/Sao_Paulo

### Database Migrations
- **Tool**: Drizzle Kit with push command
- **Location**: migrations/ directory
- **Schema**: Centralized in shared/schema.ts
- **Timezone**: All timestamps use America/Sao_Paulo timezone

## Changelog
- June 27, 2025. **Production Deploy Solution** - Created comprehensive deployment synchronization system with multiple scripts (sync-deploy.js, deploy-production-sync.js) ensuring zero-downtime production deployments with automatic database initialization, complete troubleshooting guide, and platform-specific instructions
- June 26, 2025. **Version 0.0.9 Finalized** - Critical database connection stability fixes with automatic production deployment support, resolving "relation usuarios does not exist" errors through intelligent table creation and data seeding
- June 26, 2025. **Version 0.0.8 Finalized** - Complete mobile responsive layout for transactions with card-based design eliminating horizontal scroll, plus comprehensive standardization of global categories system (13 expense + 4 income categories) with preservation of user-specific custom categories
- June 26, 2025. **Updated Default Global Categories** - Standardized global categories: 13 expense categories (Alimentação, Moradia, Doações, Educação, Imposto, Investimento, Lazer, Pets, Saude, Transporte, Vestuário, Viagem, Outros) and 4 income categories (Investimentos, Salário, Freelance, Outros)
- June 24, 2025. **Mobile Transaction Cards** - Replaced horizontal scroll tables with responsive card layout for mobile devices in transactions listing and dashboard
- June 24, 2025. **Admin Setup Page** - Added database management interface for super admins with migration controls, table integrity verification, and comprehensive status monitoring
- June 24, 2025. **Database Auto-Initialization** - Added startup validation with automatic migrations and admin user creation (teste@teste.com / admin123)
- June 24, 2025. **EasyPanel Deploy Guide** - Created comprehensive deployment guide with configuration steps and troubleshooting for common issues
- June 24, 2025. **Docker Build Fixed** - Resolved Vite dependency error by excluding from esbuild bundle with custom build script, single optimized Dockerfile created
- June 24, 2025. **Docker Deployment Ready** - Complete Docker containerization with multi-stage builds, platform scripts for Heroku/Railway/EasyPanel, and production optimizations
- June 24, 2025. **Version 0.0.7 Released** - Mobile header positioning fixes and admin interface improvements
- June 24, 2025. Fixed mobile header spacing for super admin mode with responsive margin-top adjustments (78px mobile, 75px desktop)
- June 24, 2025. Applied header positioning fixes for both direct super admin and impersonation modes
- June 24, 2025. Removed status filter dropdown from transactions page - status filter now defaults to "TODOS" and is hidden from interface
- June 24, 2025. Added wallet balance badges in admin user listings - super admins can now see each user's current wallet balance with color-coded badges (green for positive, red for negative, gray for zero)
- June 24, 2025. Enhanced admin dashboard with improved wallet distribution information showing clear criteria
- June 23, 2025. **Version 0.0.6 Released** - Complete custom menu positioning solution and navigation updates
- June 23, 2025. Updated sidebar navigation: removed Carteira option and added Relatórios pointing to /reports
- June 23, 2025. Implemented custom menu solution replacing problematic Radix UI components in categories and reminders
- June 23, 2025. Created FIXLAYOUT.md documentation for menu positioning solutions using custom JavaScript/CSS
- June 23, 2025. Fixed menu positioning issues in categories, reminders date picker, and dashboard recent transactions
- June 23, 2025. Established reliable custom JavaScript/CSS approach for dropdown menus across entire application
- June 23, 2025. Enhanced transaction queries with JOIN for payment methods - now displays PIX correctly in listings
- June 23, 2025. Added automatic PIX assignment as default payment method for transactions when not specified
- June 23, 2025. Fixed API token authentication issue for transaction creation - auto-assigns wallet ID when empty
- June 20, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.