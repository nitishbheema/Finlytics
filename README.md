# Finlytics — Modern Personal Finance & Expense Tracker

Finlytics is a modern, responsive, production-ready Personal Finance and Expense Tracker web application built with **React (Vite)**, **Tailwind CSS**, **Node.js & Express**, and **PostgreSQL (Supabase)**.

This project was modernized from a legacy XAMPP/PHP/MySQL application into a modern full-stack web application optimized for deployment on **Vercel** and **Supabase**.

---

## 🌟 Modern Technology Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite | Lightning-fast HMR, component architecture, client-side SPA routing. |
| **Styling** | Tailwind CSS + Custom Design System | Dark/Light theme mode inspired by warm, modern Claude design tokens. |
| **Backend** | Node.js + Express.js | Standardized RESTful API with route modularity. |
| **Serverless Deployment** | Vercel Serverless Functions | Monorepo `/api` serverless handler with SPA direct-route rewrites. |
| **Database** | PostgreSQL (Supabase) | Cloud-hosted relational database with connection pooling and schema migrations. |
| **Authentication** | JWT (JSON Web Tokens) + Bcrypt | Secure stateless authentication with password hashing. |
| **Data Visualizations** | Chart.js & React-Chartjs-2 | Interactive expense distribution pie chart and monthly spending spline trend. |
| **PDF Reporting** | jsPDF + jsPDF-AutoTable | Client/server-side instant PDF export of expense statements. |

---

## ✨ Features Preserved & Upgraded

- **User Authentication**: Secure registration and login with bcrypt password hashing and 7-day JWT authentication.
- **Financial Dashboard**:
  - Real-time summaries: Total Income, Total Expenses, Net Savings, Remaining Budget, and Budget Limits.
  - Interactive budget usage progress bar with dynamic threshold warnings.
  - Month-over-month comparison indicator (`% vs. last month`).
  - Top spending category detection.
  - Algorithmic Financial Health Score (0-100) with dynamic status color.
  - Automated AI Financial Spending Insights.
  - Recent transactions table.
- **Income Management**: Record earnings, salaries, and freelance retainers with inline custom category creation, editing, and deletion.
- **Expense Management**: Log expenditures with category tags, custom amounts, dates, and descriptions. Paginated history with live category filters and description search.
- **Category Budgets**: Configure custom spending thresholds per category with live usage tracking and alert badges (`Good`, `Near limit`, `Exceeded`, `No budget`).
- **Category Management**: Create, rename inline, and delete categories with referential integrity protection against in-use transaction records.
- **Reports & PDF Export**: Instant generation and download of formatted, branded financial reports in PDF format.
- **User Profile & Customization**: Manage name, monthly budget, instant base64 photo avatar upload/preview, and password modification with match validation.
- **Dark & Light Mode**: Bespoke warm dark theme and crisp light theme with instant toggling and persistent local state.

---

## 📁 Project Structure

```
Finlytics/
├── api/
│   └── index.js                 # Vercel Serverless Function entrypoint
├── database/
│   ├── schema.sql               # PostgreSQL DDL table definitions & indexes
│   ├── seed.sql                 # Initial category seed data
│   └── migrate.js               # Automated Node.js migration runner
├── scripts/
│   ├── test-api.js              # Unit tests for crypto & tokens
│   └── test-routes.js           # Integration route tests
├── server/
│   ├── config/
│   │   └── db.js                # PostgreSQL connection pool (Supabase-ready)
│   ├── middleware/
│   │   ├── auth.js              # JWT verification middleware
│   │   └── errorHandler.js      # Global error handling
│   ├── routes/
│   │   ├── auth.js              # Register, Login, Me endpoints
│   │   ├── dashboard.js         # Analytics, summaries, AI insights, charts
│   │   ├── expenses.js          # CRUD, pagination, filter, search, export
│   │   ├── income.js            # CRUD income transactions
│   │   ├── categories.js        # Categories and category budgets
│   │   └── user.js              # Profile updates and password changes
│   ├── app.js                   # Express application assembly (CORS, Helmet)
│   └── server.js                # Standalone HTTP server for local development
├── src/
│   ├── components/
│   │   ├── Layout.jsx           # Main layout with responsive sidebar & topbar
│   │   ├── Sidebar.jsx          # Navigation links & theme switch
│   │   ├── Topbar.jsx           # Notification bell & avatar menu
│   │   └── ProtectedRoute.jsx   # Route guard for authenticated users
│   ├── context/
│   │   ├── AuthContext.jsx      # Global authentication state
│   │   └── ThemeContext.jsx     # Dark / Light mode provider
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Dashboard.jsx
│   │   ├── AddExpense.jsx
│   │   ├── AddIncome.jsx
│   │   ├── CategoryBudgets.jsx
│   │   ├── ManageCategories.jsx
│   │   ├── Profile.jsx
│   │   ├── ChangePassword.jsx
│   │   └── Reports.jsx
│   ├── utils/
│   │   ├── api.js               # Centralized fetch wrapper
│   │   └── pdfExport.js         # jsPDF document generator
│   ├── App.jsx                  # React Router configuration
│   ├── main.jsx                 # React root entrypoint
│   └── index.css                # Tailwind CSS & theme tokens
├── .env.example                 # Environment variables reference
├── .gitignore                   # Safe Git ignore configuration
├── package.json                 # Project scripts and dependencies
├── tailwind.config.js           # Tailwind design tokens
├── vite.config.js               # Vite build configuration with API proxy
└── vercel.json                  # Vercel deployment rewrites
```

---

## 🚀 Local Development Setup

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **PostgreSQL**: A local PostgreSQL database OR a free [Supabase](https://supabase.com) project.

### 2. Clone and Install
```bash
git clone https://github.com/nitishbheema/Finlytics-Deploy.git
cd Finlytics-Deploy
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL / Supabase credentials:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@localhost:5432/finlytics
JWT_SECRET=your-32-character-secret-key-here
ALLOWED_ORIGINS=http://localhost:5173
```

### 4. Run Database Migrations
Create the tables and seed default categories:
```bash
npm run migrate
```

### 5. Run the Application
Start both the Express backend and the Vite frontend concurrently:
```bash
npm run dev
```

- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/api/health`

### 6. Run Automated Tests
```bash
npm test
```

---

## 🗄️ Database Setup with Supabase

1. Create a free account at [Supabase](https://supabase.com).
2. Create a new project named `finlytics`.
3. In the Supabase dashboard, navigate to **Project Settings** → **Database**.
4. Copy the **Connection String** (choose **URI** and use the **Transaction Pooler** or **Direct** connection):
   ```
   postgresql://postgres.[project-ref]:[db-password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
5. Set this string as `DATABASE_URL` in your `.env` or Vercel Environment Variables.
6. Run `npm run migrate` (or paste the contents of `database/schema.sql` and `database/seed.sql` into the Supabase **SQL Editor**).

---

## 🌐 Production Deployment on Vercel

The application is pre-configured with `vercel.json` for serverless deployment:

1. Push your code to GitHub:
   ```bash
   git push origin main
   ```
2. Log in to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import the `Finlytics-Deploy` repository.
4. Set the Framework Preset to **Vite**.
5. In **Environment Variables**, add:
   - `DATABASE_URL`: Your Supabase connection string.
   - `JWT_SECRET`: A secure random 32+ character string.
   - `NODE_ENV`: `production`
6. Click **Deploy**. Vercel will build the frontend into static assets and compile `/api/index.js` into serverless API endpoints.
7. SPA rewrites in `vercel.json` ensure that reloading routes like `/dashboard` or `/expenses` directly never return a 404 error.

---

## 🔒 Security Best Practices Implemented

- **Password Hashing**: Bcrypt with salt rounds for one-way password encryption.
- **SQL Injection Defense**: 100% parameterized SQL queries (`$1, $2, ...`) using `pg`.
- **JWT Protection**: Time-limited signed tokens verified on all protected API endpoints.
- **HTTP Headers**: Security headers enforced using `helmet`.
- **CORS Protection**: Restricted allowed origins with wildcard support for preview deployments.
- **Serverless Safe Storage**: Avatar images encoded in base64 / URLs to avoid ephemeral filesystem loss.
