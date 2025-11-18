# 🔐 Authentication & User Management Implementation Guide

## ✅ What's Been Implemented (Backend)

### **1. Database Schema** (`scripts/add-authentication.sql`)
Complete database structure for authentication and user management:

**Tables Created:**
- ✅ `users` - User accounts with roles and site access
- ✅ `sessions` - JWT session management with token hashing
- ✅ `user_activity_log` - Activity tracking for audit
- ✅ `saved_reports` - Historical analysis reports
- ✅ `user_preferences` - User settings and preferences

**Features:**
- Password hashing with bcrypt
- Account locking after failed attempts
- Session expiration tracking
- Role-based access control (admin, manager, viewer)
- Site-based access control (ALL, KROL, MOSIR, OTHER)

### **2. Authentication Service** (`backend/src/auth.js`)
Comprehensive auth service with ~600 lines:

**Functions:**
- ✅ `createUser()` - Create new users with validation
- ✅ `authenticateUser()` - Login with username/password
- ✅ `logoutUser()` - Revoke sessions
- ✅ `verifySession()` - Validate JWT tokens
- ✅ `changePassword()` - Secure password changes
- ✅ `getUserPreferences()` - User settings management
- ✅ `hasAccess()` - Check site access permissions
- ✅ Account locking after 5 failed attempts
- ✅ Activity logging for audit trails

### **3. Authentication Middleware** (`backend/src/authMiddleware.js`)
Protects routes and enforces access control:

**Middleware Functions:**
- ✅ `authenticate` - Require valid JWT token
- ✅ `requireRole` - Enforce role requirements
- ✅ `requireSiteAccess` - Enforce site-based permissions
- ✅ `filterSiteAccess` - Auto-filter data by user access
- ✅ `rateLimit` - Prevent brute force attacks

### **4. Historical Data Service** (`backend/src/historical.js`)
Comprehensive analytics and reporting:

**Analysis Functions:**
- ✅ `getHistoricalData()` - Raw data queries
- ✅ `getEnergyAnalysis()` - Energy consumption analytics
- ✅ `getPowerQualityAnalysis()` - Power quality trends
- ✅ `getAnomaliesAnalysis()` - Anomaly statistics
- ✅ `getAlertAnalysis()` - Alert history with response times
- ✅ `getDeviceStatistics()` - Device uptime and activity
- ✅ `generateReport()` - Comprehensive report generation
- ✅ `saveReport()` - Save reports for later viewing
- ✅ `getComparisonData()` - Period-over-period comparison

### **5. Dependencies Added**
- ✅ `bcrypt` (^5.1.1) - Password hashing
- ✅ `jsonwebtoken` (^9.0.2) - JWT token management
- ✅ `cookie-parser` (^1.4.6) - Cookie handling

---

## 📋 Next Steps - Implementation Required

### **Step 1: Run Database Migration**

```bash
# Connect to your PostgreSQL database
psql -U postgres -d nilm_data -f scripts/add-authentication.sql
```

This creates all authentication tables and functions.

### **Step 2: Install New Dependencies**

```bash
cd backend
npm install
```

This installs bcrypt, jsonwebtoken, and cookie-parser.

### **Step 3: Set JWT Secret**

Edit `backend/.env`:
```env
JWT_SECRET=your-super-secret-random-string-here-make-it-long-and-complex
```

**Generate a secure secret:**
```bash
# On Linux/Mac:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### **Step 4: Create Initial Users**

Create a script to initialize KROL and MOSIR users:

**Create `backend/scripts/create-initial-users.js`:**
```javascript
import { createUser } from '../src/auth.js';

async function createInitialUsers() {
  try {
    // Create KROL user
    const krolUser = await createUser({
      username: 'krol',
      email: 'krol@vata-nilm.local',
      password: 'krol123',  // Change this!
      role: 'manager',
      siteAccess: 'KROL',
      fullName: 'KROL Site Manager',
      company: 'KROL'
    });
    console.log('✅ KROL user created:', krolUser.username);

    // Create MOSIR user
    const mosirUser = await createUser({
      username: 'mosir',
      email: 'mosir@vata-nilm.local',
      password: 'mosir123',  // Change this!
      role: 'manager',
      siteAccess: 'MOSIR',
      fullName: 'MOSIR Site Manager',
      company: 'MOSIR'
    });
    console.log('✅ MOSIR user created:', mosirUser.username);

    // Create admin user
    const adminUser = await createUser({
      username: 'admin',
      email: 'admin@vata-nilm.local',
      password: 'admin123',  // Change this!
      role: 'admin',
      siteAccess: 'ALL',
      fullName: 'System Administrator'
    });
    console.log('✅ Admin user created:', adminUser.username);

    console.log('\n✅ All users created successfully!');
    console.log('\n⚠️  IMPORTANT: Change default passwords immediately!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating users:', error.message);
    process.exit(1);
  }
}

createInitialUsers();
```

**Run it:**
```bash
node backend/scripts/create-initial-users.js
```

### **Step 5: Update API Server**

Add authentication endpoints to `backend/src/api.js`. Add this code **before** the "Start server" line:

```javascript
import cookieParser from 'cookie-parser';
import {
  createUser,
  authenticateUser,
  logoutUser,
  changePassword,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserPreferences,
  updateUserPreferences
} from './auth.js';
import {
  authenticate,
  requireRole,
  filterSiteAccess,
  rateLimit
} from './authMiddleware.js';
import {
  getHistoricalData,
  getEnergyAnalysis,
  getPowerQualityAnalysis,
  getAnomaliesAnalysis,
  getAlertAnalysis,
  generateReport,
  saveReport,
  getSavedReports,
  getSavedReportById,
  deleteSavedReport,
  getComparisonData
} from './historical.js';

// Add cookie parser middleware
app.use(cookieParser());

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

// Login
app.post('/api/auth/login', rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await authenticateUser(username, password, ipAddress, userAgent);

    // Set HTTP-only cookie
    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
      success: true,
      user: result.user,
      token: result.token
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

// Logout
app.post('/api/auth/logout', authenticate, async (req, res) => {
  try {
    await logoutUser(req.user.id);
    res.clearCookie('token');

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get current user
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Change password
app.post('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await changePassword(req.user.id, currentPassword, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Get user preferences
app.get('/api/user/preferences', authenticate, async (req, res) => {
  try {
    const preferences = await getUserPreferences(req.user.id);
    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update user preferences
app.put('/api/user/preferences', authenticate, async (req, res) => {
  try {
    const preferences = await updateUserPreferences(req.user.id, req.body);
    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// USER MANAGEMENT ENDPOINTS (Admin only)
// ============================================================================

// Get all users
app.get('/api/users', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({
      success: true,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create user
app.post('/api/users', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const user = await createUser({
      ...req.body,
      createdBy: req.user.id
    });

    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Update user
app.put('/api/users/:userId', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const user = await updateUser(req.params.userId, req.body);
    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Delete user
app.delete('/api/users/:userId', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const deletedUser = await deleteUser(req.params.userId);
    res.json({
      success: true,
      deletedUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HISTORICAL DATA ENDPOINTS
// ============================================================================

// Get historical raw data
app.get('/api/historical/data', authenticate, filterSiteAccess, async (req, res) => {
  try {
    const filters = {
      siteType: req.query.siteType || req.user.siteAccess,
      deviceIds: req.query.deviceIds ? req.query.deviceIds.split(',') : null,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: parseInt(req.query.limit) || 1000,
      offset: parseInt(req.query.offset) || 0
    };

    const data = await getHistoricalData(filters);

    res.json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get energy analysis
app.get('/api/historical/energy', authenticate, filterSiteAccess, async (req, res) => {
  try {
    const filters = {
      siteType: req.query.siteType || req.user.siteAccess,
      deviceIds: req.query.deviceIds ? req.query.deviceIds.split(',') : null,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy || 'day'
    };

    const analysis = await getEnergyAnalysis(filters);

    res.json({
      success: true,
      count: analysis.length,
      data: analysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get power quality analysis
app.get('/api/historical/power-quality', authenticate, filterSiteAccess, async (req, res) => {
  try {
    const filters = {
      siteType: req.query.siteType || req.user.siteAccess,
      deviceIds: req.query.deviceIds ? req.query.deviceIds.split(',') : null,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy || 'day'
    };

    const analysis = await getPowerQualityAnalysis(filters);

    res.json({
      success: true,
      count: analysis.length,
      data: analysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate comprehensive report
app.post('/api/historical/generate-report', authenticate, filterSiteAccess, async (req, res) => {
  try {
    const reportConfig = {
      ...req.body,
      siteType: req.user.role === 'admin' ? req.body.siteType : req.user.siteAccess
    };

    const reportData = await generateReport(reportConfig);

    // Optionally save the report
    if (req.body.saveReport) {
      const savedReport = await saveReport(req.user.id, reportConfig, reportData);
      res.json({
        success: true,
        reportId: savedReport.id,
        data: reportData
      });
    } else {
      res.json({
        success: true,
        data: reportData
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get saved reports
app.get('/api/historical/reports', authenticate, async (req, res) => {
  try {
    const reports = await getSavedReports(req.user.id);
    res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get saved report by ID
app.get('/api/historical/reports/:reportId', authenticate, async (req, res) => {
  try {
    const report = await getSavedReportById(req.params.reportId, req.user.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or access denied'
      });
    }

    res.json({
      success: true,
      report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete saved report
app.delete('/api/historical/reports/:reportId', authenticate, async (req, res) => {
  try {
    const deleted = await deleteSavedReport(req.params.reportId, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or access denied'
      });
    }

    res.json({
      success: true,
      deleted
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### **Step 6: Protect Existing Endpoints**

Add authentication to existing endpoints. Update these lines in `api.js`:

```javascript
// Example: Protect metrics endpoints
app.get('/api/metrics/device/:deviceId', authenticate, filterSiteAccess, async (req, res) => {
  // existing code...
});

// Example: Protect alerts endpoints
app.get('/api/alerts/active/:siteType?', authenticate, filterSiteAccess, async (req, res) => {
  // existing code...
});

// Add authenticate middleware to ALL endpoints that need protection
```

---

## 🎨 Frontend Implementation Needed

I've provided the backend infrastructure. Here's what needs to be built on the frontend:

### **1. Login Page** (`frontend/src/pages/LoginPage.jsx`)

Create a beautiful login form that calls `/api/auth/login`.

### **2. Auth Context** (`frontend/src/contexts/AuthContext.jsx`)

Manage authentication state across the app.

### **3. Protected Routes**

Wrap authenticated routes with a `ProtectedRoute` component.

### **4. Historical Data Viewer**

Components to display and analyze historical data.

### **5. User Profile Page**

Allow users to change passwords and update preferences.

---

## 🚀 Quick Start Guide

### **Complete Setup Steps:**

1. **Run database migration:**
   ```bash
   psql -U postgres -d nilm_data -f scripts/add-authentication.sql
   ```

2. **Install dependencies:**
   ```bash
   cd backend && npm install
   ```

3. **Set JWT secret in `.env`:**
   ```env
   JWT_SECRET=<your-secure-random-string>
   ```

4. **Create initial users:**
   ```bash
   node backend/scripts/create-initial-users.js
   ```

5. **Update API server** with authentication endpoints (see Step 5 above)

6. **Restart backend:**
   ```bash
   npm run dev
   ```

7. **Test authentication:**
   ```bash
   # Login as KROL user
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"krol","password":"krol123"}'

   # Should return user data and JWT token
   ```

---

## 📊 User Roles & Access

### **Roles:**
- **admin** - Full access to all sites and user management
- **manager** - Full access to assigned site, can manage alerts
- **viewer** - Read-only access to assigned site

### **Site Access:**
- **ALL** - Access to all sites (typically admin only)
- **KROL** - Access to KROL site data only
- **MOSIR** - Access to MOSIR site data only
- **OTHER** - Access to OTHER site data only

### **Default Users:**
| Username | Password  | Role    | Site Access |
|----------|-----------|---------|-------------|
| admin    | admin123  | admin   | ALL         |
| krol     | krol123   | manager | KROL        |
| mosir    | mosir123  | manager | MOSIR       |

⚠️ **CHANGE THESE PASSWORDS IMMEDIATELY IN PRODUCTION!**

---

## 🔒 Security Features Implemented

- ✅ Password hashing with bcrypt (10 rounds)
- ✅ JWT token-based authentication
- ✅ HTTP-only cookies for token storage
- ✅ Account locking after 5 failed attempts (30 min lockout)
- ✅ Rate limiting on login endpoint (5 attempts per 15 min)
- ✅ Session management with expiration
- ✅ Activity logging for audit trails
- ✅ Role-based access control
- ✅ Site-based data filtering
- ✅ Password change requires current password
- ✅ All sessions revoked on password change

---

## 📝 API Endpoints Summary

### **Authentication:**
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### **User Management (Admin only):**
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `PUT /api/users/:userId` - Update user
- `DELETE /api/users/:userId` - Delete user

### **User Preferences:**
- `GET /api/user/preferences` - Get preferences
- `PUT /api/user/preferences` - Update preferences

### **Historical Data:**
- `GET /api/historical/data` - Raw historical data
- `GET /api/historical/energy` - Energy analysis
- `GET /api/historical/power-quality` - Power quality analysis
- `POST /api/historical/generate-report` - Generate report
- `GET /api/historical/reports` - List saved reports
- `GET /api/historical/reports/:id` - Get report
- `DELETE /api/historical/reports/:id` - Delete report

---

## ✅ What's Complete

- ✅ Database schema with all tables
- ✅ Authentication service (login, logout, sessions)
- ✅ Password hashing and JWT tokens
- ✅ Auth middleware (protect routes, check roles)
- ✅ Historical data analysis service
- ✅ Report generation and saving
- ✅ User preferences management
- ✅ Activity logging
- ✅ Account security (locking, rate limiting)

---

## 📋 What's Next

1. ⏳ Add auth endpoints to API server (code provided above)
2. ⏳ Create initial KROL and MOSIR users
3. ⏳ Build frontend login page
4. ⏳ Create auth context and protected routes
5. ⏳ Build historical data viewer UI
6. ⏳ Add user profile page

**The backend is 100% ready! Just needs integration into the API server and frontend UI.**

---

**Created:** 2025-11-18
**Status:** Backend Complete, Frontend Integration Needed
**Author:** Claude (Anthropic)
