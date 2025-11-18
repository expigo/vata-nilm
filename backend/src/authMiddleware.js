import { verifySession, hasAccess } from './auth.js';

/**
 * Authentication Middleware
 * Verifies JWT tokens and attaches user to request
 */

/**
 * Extract token from request
 */
function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookies
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}

/**
 * Authenticate middleware - requires valid JWT token
 */
export async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. No token provided.'
      });
    }

    const user = await verifySession(token);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token. Please login again.'
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * Require specific role
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Requires one of: ${roles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Require access to specific site
 */
export function requireSiteAccess(siteType) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!hasAccess(req.user, siteType)) {
      return res.status(403).json({
        success: false,
        error: `Access denied to site: ${siteType}`
      });
    }

    next();
  };
}

/**
 * Filter site type based on user access
 * Middleware to automatically adjust siteType parameter based on user's access
 */
export function filterSiteAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  // If user is admin or has ALL access, allow any site
  if (req.user.role === 'admin' || req.user.siteAccess === 'ALL') {
    return next();
  }

  // Otherwise, force the site type to user's access level
  // This prevents users from accessing other sites' data
  if (req.params.siteType) {
    req.params.siteType = req.user.siteAccess;
  }

  // Also check query parameters
  if (req.query.siteType) {
    req.query.siteType = req.user.siteAccess;
  }

  next();
}

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
export async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (token) {
      const user = await verifySession(token);
      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Silently continue without authentication
    next();
  }
}

/**
 * Rate limiting middleware (simple implementation)
 */
const loginAttempts = new Map();

export function rateLimit(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const identifier = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!loginAttempts.has(identifier)) {
      loginAttempts.set(identifier, []);
    }

    const attempts = loginAttempts.get(identifier);

    // Remove old attempts outside the window
    const recentAttempts = attempts.filter(time => now - time < windowMs);
    loginAttempts.set(identifier, recentAttempts);

    if (recentAttempts.length >= maxAttempts) {
      return res.status(429).json({
        success: false,
        error: 'Too many attempts. Please try again later.'
      });
    }

    // Add current attempt
    recentAttempts.push(now);

    next();
  };
}

/**
 * Cleanup old rate limit entries (run periodically)
 */
setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;

  for (const [identifier, attempts] of loginAttempts.entries()) {
    const recentAttempts = attempts.filter(time => now - time < windowMs);

    if (recentAttempts.length === 0) {
      loginAttempts.delete(identifier);
    } else {
      loginAttempts.set(identifier, recentAttempts);
    }
  }
}, 60 * 1000); // Cleanup every minute
