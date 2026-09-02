// Authentication & Role-Based Access Control (RBAC) Middleware
// Fight Club Gym Management System

const db = require('../db');

/**
 * Extract authenticated user from request header or session
 */
async function authenticateUser(req, res, next) {
  try {
    // Check Authorization header or custom session header
    const authHeader = req.headers['authorization'] || req.headers['x-user-id'];
    let userId = null;

    if (authHeader) {
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        // Bearer token format: simple base64 session token e.g. base64(userId:timestamp) or direct userId
        const token = authHeader.replace('Bearer ', '').trim();
        try {
          const decoded = Buffer.from(token, 'base64').toString('utf8');
          if (decoded.includes(':')) {
            userId = parseInt(decoded.split(':')[0], 10);
          } else {
            userId = parseInt(token, 10);
          }
        } catch {
          userId = parseInt(token, 10);
        }
      } else {
        userId = parseInt(authHeader, 10);
      }
    }

    // Default fallback to admin for local desktop single-user mode if no auth header
    if (!userId) {
      // In local desktop app mode, check if request is from localhost
      const ip = req.ip || req.connection.remoteAddress || '';
      const isLocalhost = ip.includes('127.0.0.1') || ip.includes('::1') || ip === 'localhost';
      if (isLocalhost && !req.path.startsWith('/api/device-events')) {
        userId = 1; // Default to Super Admin for local UI interaction
      }
    }

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    const user = await db.get(
      `SELECT u.id, u.username, u.fullname, u.role_id, u.status, r.name as role_name, r.permissions 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ? AND u.status = 'Active'`,
      [userId]
    );

    if (!user) {
      return res.status(401).json({ error: 'User account invalid or inactive.' });
    }

    let parsedPermissions = [];
    try {
      parsedPermissions = JSON.parse(user.permissions || '[]');
    } catch {
      parsedPermissions = [];
    }

    req.user = {
      ...user,
      permissions: parsedPermissions
    };

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authentication internal error: ' + error.message });
  }
}

/**
 * Middleware requiring specific role(s)
 * Example: requireRole(['Super Admin', 'Admin'])
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Super Admin has universal access
    if (req.user.role_name === 'Super Admin' || (req.user.permissions && req.user.permissions.includes('all'))) {
      return next();
    }

    if (allowedRoles.includes(req.user.role_name)) {
      return next();
    }

    return res.status(403).json({
      error: `Access Denied. Required role: ${allowedRoles.join(' or ')} (Your role: ${req.user.role_name})`
    });
  };
}

/**
 * Middleware requiring specific permission key
 */
function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role_name === 'Super Admin' || (req.user.permissions && req.user.permissions.includes('all'))) {
      return next();
    }

    if (req.user.permissions && req.user.permissions.includes(permissionKey)) {
      return next();
    }

    return res.status(403).json({
      error: `Access Denied. Missing required permission: ${permissionKey}`
    });
  };
}

module.exports = {
  authenticateUser,
  requireRole,
  requirePermission
};
