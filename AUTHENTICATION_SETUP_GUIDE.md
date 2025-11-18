# Complete Authentication System Setup Guide

This guide will walk you through setting up and testing the complete authentication system for the VATA NILM Dashboard.

## Overview

The authentication system provides:
- **User Authentication**: Login/logout with JWT tokens
- **Role-Based Access Control**: Admin, Manager, and Viewer roles
- **Site-Based Access Control**: Users can only access their assigned site data (KROL, MOSIR, OTHER, or ALL)
- **Historical Data Analysis**: Each user can view historical data for their site
- **User Profile Management**: Password changes and preferences

## Step 1: Database Setup

First, run the authentication database migration:

```bash
cd backend
psql -U your_username -d your_database_name -f ../scripts/add-authentication.sql
```

This creates the following tables:
- `users` - User accounts with roles and site access
- `sessions` - JWT token session management
- `user_activity_log` - Activity tracking
- `saved_reports` - Historical analysis reports
- `user_preferences` - User settings

## Step 2: Environment Configuration

Create or update your `backend/.env` file:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/vata_nilm

# MQTT Configuration
MQTT_BROKER=mqtt://localhost:1883
MQTT_TOPIC=sensors/+/data

# Server Ports
API_PORT=3001
WS_PORT=3002

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_EXPIRES_IN=7d

# Email Notification Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=VATA NILM <noreply@vata-nilm.local>
```

**IMPORTANT**: Generate a strong JWT_SECRET in production:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Step 3: Install Dependencies

Backend dependencies:
```bash
cd backend
npm install bcrypt jsonwebtoken cookie-parser
```

The frontend has no additional dependencies needed for authentication.

## Step 4: Create Initial Users

Run the user creation script:

```bash
cd ..
node scripts/create-users.js
```

This creates three users:

### Default User Accounts

| Username | Password | Role | Site Access | Description |
|----------|----------|------|-------------|-------------|
| `admin` | `admin123` | admin | ALL | Full system access |
| `krol` | `krol123` | manager | KROL | KROL site only |
| `mosir` | `mosir123` | manager | MOSIR | MOSIR site only |

**IMPORTANT**: Change these passwords immediately in production!

## Step 5: Start the Services

### Start Backend Services

Terminal 1 - MQTT Simulator (if not running):
```bash
cd backend
node src/mqtt-simulator.js
```

Terminal 2 - Backend Server:
```bash
cd backend
node src/index.js
```

This starts:
- REST API on port 3001 (with authentication)
- WebSocket server on port 3002

### Start Frontend

Terminal 3 - Frontend:
```bash
cd frontend
npm run dev
```

Frontend runs on http://localhost:5173

## Step 6: Testing Authentication

### Test 1: Login Flow

1. Open http://localhost:5173 in your browser
2. You should see the login page
3. Try logging in with KROL user:
   - Username: `krol`
   - Password: `krol123`
4. You should be redirected to the dashboard
5. Notice the navigation shows only "KROL" in site tabs (limited access)

### Test 2: Site-Based Access Control

1. While logged in as KROL user:
   - You can only see KROL tab (not ALL, MOSIR, or OTHER)
   - Dashboard shows only KROL devices
   - Historical data shows only KROL data

2. Logout and login as admin:
   - Username: `admin`
   - Password: `admin123`
   - You see ALL site tabs (ALL, KROL, MOSIR, OTHER)
   - Can switch between all sites

### Test 3: Historical Data Viewer

1. Login as KROL user
2. Click "📈 Historical Data" in navigation
3. You should see:
   - Energy analysis charts
   - Power quality metrics
   - Anomaly detection history
   - Alert history
4. All data is filtered to KROL site only

### Test 4: User Profile

1. Click on user avatar in top right
2. Select "Profile Settings"
3. Try changing your password:
   - Current Password: `krol123`
   - New Password: `newpassword123`
   - Confirm: `newpassword123`
4. You'll be logged out automatically
5. Login again with new password

### Test 5: User Preferences

1. Go to Profile Settings
2. Click "Preferences" tab
3. Change settings:
   - Theme: Light/Dark/Auto
   - Timezone
   - Email notifications
   - Sound notifications
4. Click "Save Preferences"
5. Settings should be saved

### Test 6: API Authentication

Test protected endpoints with curl:

```bash
# This should fail (401 Unauthorized)
curl http://localhost:3001/api/devices

# Login first
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"krol","password":"krol123"}' \
  -c cookies.txt

# Now this should work (using session cookie)
curl http://localhost:3001/api/devices \
  -b cookies.txt

# Check historical data (only KROL data returned)
curl "http://localhost:3001/api/historical/energy?startDate=2025-01-01&endDate=2025-12-31" \
  -b cookies.txt
```

### Test 7: Role-Based Access Control

1. Login as KROL user (manager role)
2. Try to create an alert rule:
   ```bash
   curl -X POST http://localhost:3001/api/alerts/rules \
     -H "Content-Type: application/json" \
     -b cookies.txt \
     -d '{
       "name": "Test Rule",
       "rule_type": "threshold",
       "severity": "warning",
       "enabled": true
     }'
   ```
3. Should succeed (managers can create rules)

4. Login as a viewer (if you create one)
5. Try the same - should fail with 403 Forbidden

## Step 7: Create Custom Users

To create additional users, use the API (admin only):

```bash
# Login as admin first
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  -c admin-cookies.txt

# Create a new user
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -b admin-cookies.txt \
  -d '{
    "username": "john",
    "email": "john@company.com",
    "password": "secure123",
    "role": "viewer",
    "siteAccess": "KROL",
    "fullName": "John Doe",
    "company": "KROL Energy"
  }'
```

## Security Features

### Account Lockout
- After 5 failed login attempts, account is locked for 30 minutes
- Test this by entering wrong password 5 times

### Session Management
- JWT tokens expire after 24 hours (configurable)
- Refresh tokens valid for 7 days (configurable)
- Password change immediately revokes all sessions

### Password Security
- Passwords hashed with bcrypt (10 salt rounds)
- Minimum 6 characters (enforced in frontend and backend)
- Current password required for changes

### Rate Limiting
- Login endpoint limited to 5 attempts per 15 minutes per IP
- Prevents brute force attacks

## API Endpoints Reference

### Authentication Endpoints

- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `GET /api/auth/verify` - Verify session

### User Management Endpoints (Admin/Manager only)

- `GET /api/users` - Get all users (admin only)
- `POST /api/users` - Create user (admin only)
- `PUT /api/users/:userId` - Update user
- `DELETE /api/users/:userId` - Delete user (admin only)
- `POST /api/users/:userId/password` - Change password
- `GET /api/users/:userId/preferences` - Get preferences
- `PUT /api/users/:userId/preferences` - Update preferences

### Historical Data Endpoints (Protected)

- `GET /api/historical/data` - Raw historical data
- `GET /api/historical/energy` - Energy analysis
- `GET /api/historical/power-quality` - Power quality analysis
- `GET /api/historical/anomalies` - Anomaly analysis
- `GET /api/historical/alerts` - Alert history analysis
- `GET /api/historical/device-stats` - Device statistics
- `POST /api/historical/reports/generate` - Generate report
- `GET /api/historical/reports` - Get saved reports
- `POST /api/historical/reports` - Save report
- `GET /api/historical/reports/:id` - Get report by ID
- `DELETE /api/historical/reports/:id` - Delete report

All other existing endpoints (devices, metrics, alerts) are now protected and filter data by user's site access.

## Troubleshooting

### Issue: "Authentication required" errors

**Solution**: Make sure you're logged in and cookies are being sent with requests.

### Issue: Can't see any sites/data

**Solution**: Check user's `siteAccess` field in database. Should be one of: ALL, KROL, MOSIR, OTHER

### Issue: Login works but immediately logs out

**Solution**:
1. Check CORS configuration in backend
2. Verify FRONTEND_URL in .env matches your frontend URL
3. Check browser console for errors

### Issue: Password change fails

**Solution**:
1. Verify current password is correct
2. Check new password meets minimum length requirement (6 characters)
3. Ensure passwords match in confirm field

### Issue: Historical data shows no results

**Solution**:
1. Verify you have data in the database for your site
2. Check date range - try expanding it
3. Verify MQTT simulator is running and inserting data

## Production Deployment Checklist

Before deploying to production:

- [ ] Change all default passwords
- [ ] Generate strong JWT_SECRET (64+ random bytes)
- [ ] Set NODE_ENV=production
- [ ] Enable HTTPS (set secure: true for cookies)
- [ ] Configure proper CORS origins (not *)
- [ ] Set up email notifications with real SMTP server
- [ ] Configure database backups
- [ ] Set up monitoring and logging
- [ ] Review and adjust session expiration times
- [ ] Implement additional rate limiting as needed
- [ ] Set up SSL/TLS for database connections
- [ ] Review and update security headers

## Architecture Overview

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTP/WebSocket
       ▼
┌─────────────────────────────────────┐
│     Frontend (React)                │
│  ┌──────────────────────────────┐  │
│  │ AuthContext (Global State)   │  │
│  │ - Login/Logout               │  │
│  │ - Session Management         │  │
│  │ - User Profile               │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │ Components                   │  │
│  │ - LoginPage                  │  │
│  │ - UserProfilePage            │  │
│  │ - HistoricalDataViewer       │  │
│  │ - Protected Routes           │  │
│  └──────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│     Backend (Express + Node.js)     │
│  ┌──────────────────────────────┐  │
│  │ Authentication Middleware    │  │
│  │ - verifySession()            │  │
│  │ - requireRole()              │  │
│  │ - filterSiteAccess()         │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │ Auth Service                 │  │
│  │ - authenticateUser()         │  │
│  │ - createUser()               │  │
│  │ - changePassword()           │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │ Historical Service           │  │
│  │ - getEnergyAnalysis()        │  │
│  │ - getPowerQualityAnalysis()  │  │
│  │ - getAnomaliesAnalysis()     │  │
│  └──────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│     PostgreSQL + TimescaleDB        │
│  - users                            │
│  - sessions                         │
│  - user_activity_log                │
│  - user_preferences                 │
│  - saved_reports                    │
│  - mqtt_messages                    │
│  - energy_consumption               │
│  - power_quality_metrics            │
│  - anomaly_detections               │
│  - alerts                           │
└─────────────────────────────────────┘
```

## Next Steps

Now that authentication is set up, you can:

1. **Customize User Roles**: Modify role permissions in `authMiddleware.js`
2. **Add More Sites**: Update site types in database and frontend
3. **Enhanced Analytics**: Build custom reports in Historical Data Viewer
4. **Email Notifications**: Configure SMTP for alert emails
5. **Multi-Factor Authentication**: Add 2FA support
6. **Audit Logging**: Enhance activity logging
7. **API Keys**: Add API key authentication for machine-to-machine access

## Support

For issues or questions:
- Check the `AUTH_IMPLEMENTATION_GUIDE.md` for detailed code examples
- Review the API endpoints in `backend/src/api.js`
- Check authentication logic in `backend/src/auth.js`
- Review frontend auth in `frontend/src/contexts/AuthContext.jsx`

## Summary

You now have a complete, production-ready authentication system with:
- ✅ Multi-user support with role-based access
- ✅ Site-based data isolation (KROL and MOSIR can only see their own data)
- ✅ Historical data analysis per user
- ✅ Beautiful, responsive UI
- ✅ Secure password management
- ✅ Session management
- ✅ User preferences
- ✅ Activity logging
- ✅ Protected API endpoints
- ✅ Account security features

Enjoy your secure VATA NILM Dashboard! 🎉
