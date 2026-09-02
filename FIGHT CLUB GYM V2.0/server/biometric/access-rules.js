// Access Control Decision Engine for Fight Club Gym
// Evaluates rules: Device Auth, Enrollment, Duplicate Cooldown, Hours, Subscription Expiry, Grace Period, and Dues

const db = require('../db');
const { match1toN, matchIso1to1 } = require('./fingerprint-matcher');

/**
 * Main Access Decision Evaluator
 *
 * @param {Object} params
 * @param {Object} params.device - Validated biometric device record
 * @param {Object} params.parsedEvent - Normalized event from device adapter
 * @returns {Promise<Object>} Comprehensive decision object
 */
async function evaluateAccess({ device, parsedEvent }) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString();

  // Fail-closed default structure
  let decision = {
    allowed: false,
    accessResult: 'Denied',
    reason: 'Access Denied',
    direction: parsedEvent.direction || 'check_in',
    member: null,
    deviceUserId: parsedEvent.deviceUserId || null,
    deviceId: device.id,
    eventTime: parsedEvent.eventTime || timeStr,
    rawReference: parsedEvent.rawReference || null,
    warning: null,
    ruleDetails: {}
  };

  try {
    // 1. Device Operational Status Check
    if (device.status !== 'Active') {
      decision.reason = `Biometric Device is ${device.status}`;
      return decision;
    }

    // 2. Handle Heartbeat and Tamper events
    if (parsedEvent.eventType === 'heartbeat') {
      decision.allowed = true;
      decision.accessResult = 'Granted';
      decision.reason = 'Device heartbeat verified';
      return decision;
    }

    if (parsedEvent.eventType === 'tamper') {
      decision.allowed = false;
      decision.accessResult = 'Denied';
      decision.reason = 'Device tamper alarm triggered';
      return decision;
    }

    if (parsedEvent.eventType === 'identification_failed') {
      decision.allowed = false;
      decision.accessResult = 'Denied';
      decision.reason = 'Biometric scan failed verification on device';
      return decision;
    }

    // 3. Biometric Minutiae Matching & Intelligent Member Resolution
    let deviceUserId = parsedEvent.deviceUserId;
    let enrollment = null;
    let fallbackEnrollment = null;
    let matchScore = 0;
    let matchedMinutiae = 0;

    // A. 1:N Fingerprint Template Match against SQLite Gallery
    if (parsedEvent.isoTemplate && parsedEvent.isoTemplate.length > 20) {
      const matchRes = await match1toN(parsedEvent.isoTemplate, { threshold: 30, minMatchedPoints: 5 });
      if (matchRes.matched && matchRes.member) {
        matchScore = matchRes.score;
        matchedMinutiae = matchRes.matchedCount;
        deviceUserId = matchRes.device_user_id;
        decision.ruleDetails.biometricMatchScore = matchScore;
        decision.ruleDetails.minutiaeCount = matchedMinutiae;
        decision.ruleDetails.matchType = '1:N ISO Minutiae Match';

        fallbackEnrollment = {
          member_id: matchRes.member.id,
          fullname: matchRes.member.fullname,
          member_code: matchRes.member.member_code,
          mobile: matchRes.member.mobile,
          whatsapp: matchRes.member.whatsapp,
          member_status: matchRes.member.status,
          photo_path: matchRes.member.photo_path,
          enrollment_status: 'Enrolled',
          device_user_id: matchRes.device_user_id
        };
      } else {
        decision.ruleDetails.biometricMatchChecked = true;
        decision.ruleDetails.topCandidateScore = matchRes.score || 0;
      }
    }

    // B. Member Enrollment Mapping Lookup by Device User ID (if provided or matched)
    if (deviceUserId && !fallbackEnrollment) {
      enrollment = await db.get(
        `SELECT be.*, m.fullname, m.member_code, m.mobile, m.whatsapp, m.status as member_status, m.photo_path
         FROM biometric_enrollments be
         JOIN members m ON be.member_id = m.id
         WHERE be.device_id = ? AND be.device_user_id = ?`,
        [device.id, deviceUserId]
      );

      if (!enrollment) {
        fallbackEnrollment = await db.get(
          `SELECT be.*, m.fullname, m.member_code, m.mobile, m.whatsapp, m.status as member_status, m.photo_path
           FROM biometric_enrollments be
           JOIN members m ON be.member_id = m.id
           WHERE be.device_user_id = ? LIMIT 1`,
          [deviceUserId]
        );
      }
    }

    // C. Lookup by Member Code or ID directly
    if (!enrollment && !fallbackEnrollment && deviceUserId) {
      const memberByCode = await db.get(
        `SELECT id as member_id, fullname, member_code, mobile, whatsapp, status as member_status, photo_path
         FROM members
         WHERE member_code = ? OR id = ? OR mobile = ? LIMIT 1`,
        [deviceUserId, parseInt(deviceUserId, 10) || -1, deviceUserId]
      );
      if (memberByCode) {
        fallbackEnrollment = {
          ...memberByCode,
          enrollment_status: 'Enrolled',
          device_user_id: deviceUserId
        };
      }
    }

    if (!enrollment && !fallbackEnrollment) {
      const topScore = decision.ruleDetails.topCandidateScore || 0;
      decision.reason = topScore > 0 
        ? `Fingerprint did not match any enrolled member (Best score: ${topScore}%, required >= 30%). Please place finger flat or enroll again.`
        : 'Unrecognized fingerprint scan. Please enroll member in Biometrics tab first.';
      return decision;
    }

    const memberRecord = enrollment || fallbackEnrollment;
    decision.member = {
      id: memberRecord.member_id,
      fullname: memberRecord.fullname,
      member_code: memberRecord.member_code,
      mobile: memberRecord.mobile,
      whatsapp: memberRecord.whatsapp,
      status: memberRecord.member_status,
      photo_path: memberRecord.photo_path
    };

    if (memberRecord.enrollment_status !== 'Enrolled') {
      decision.reason = `Member biometric enrollment is ${memberRecord.enrollment_status}`;
      return decision;
    }

    // 5. Load Active Access Rules
    let rules = await db.get(`SELECT * FROM access_rules WHERE id = 1 AND enabled = 1`);
    if (!rules) {
      // Safe fallback default rules if record missing
      rules = {
        enabled: 1,
        allowed_member_statuses: '["Active"]',
        deny_if_expired: 1,
        deny_if_payment_due: 1,
        grace_period_days: 0,
        allowed_start_time: '05:00',
        allowed_end_time: '23:00',
        cooldown_seconds: 45
      };
    }

    let allowedStatuses = ['Active'];
    try {
      allowedStatuses = JSON.parse(rules.allowed_member_statuses || '["Active"]');
    } catch {
      allowedStatuses = ['Active'];
    }

    const cooldownSeconds = rules.cooldown_seconds !== undefined ? rules.cooldown_seconds : 45;

    // 6. Anti-Passback & Duplicate Scan Cooldown Check
    if (cooldownSeconds > 0) {
      const recentEvent = await db.get(
        `SELECT * FROM access_events 
         WHERE member_id = ? AND access_result = 'Granted'
         ORDER BY id DESC LIMIT 1`,
        [memberRecord.member_id]
      );

      if (recentEvent && recentEvent.event_time) {
        const lastScanTime = new Date(recentEvent.event_time).getTime();
        const diffSeconds = Math.floor((now.getTime() - lastScanTime) / 1000);
        if (diffSeconds >= 0 && diffSeconds < cooldownSeconds) {
          decision.reason = `Duplicate Scan Cooldown (Scanned ${diffSeconds}s ago, wait ${cooldownSeconds - diffSeconds}s)`;
          decision.ruleDetails.cooldownBlocked = true;
          return decision;
        }
      }
    }

    // 7. Permitted Access Hours Check
    const currentHhMm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const startTime = rules.allowed_start_time || '05:00';
    const endTime = rules.allowed_end_time || '23:00';

    if (!isWithinTimeWindow(currentHhMm, startTime, endTime)) {
      decision.reason = `Outside Permitted Access Hours (${startTime} - ${endTime})`;
      decision.ruleDetails.outsideHours = true;
      return decision;
    }

    // 8. Member Status Validation (Frozen, Expired, Inactive)
    if (!allowedStatuses.includes(memberRecord.member_status)) {
      decision.reason = `Member account is ${memberRecord.member_status}`;
      decision.ruleDetails.statusDenied = true;
      return decision;
    }

    // 9. Subscription Expiry & Grace Period Check
    const latestSub = await db.get(
      `SELECT s.*, mp.name as plan_name 
       FROM subscriptions s
       LEFT JOIN membership_plans mp ON s.plan_id = mp.id
       WHERE s.member_id = ?
       ORDER BY s.id DESC LIMIT 1`,
      [memberRecord.member_id]
    );

    if (latestSub) {
      decision.ruleDetails.planName = latestSub.plan_name;
      decision.ruleDetails.expiryDate = latestSub.expiry_date;

      const expiryDateStr = latestSub.expiry_date;
      if (expiryDateStr) {
        const todayDate = new Date(todayStr);
        const expiryDate = new Date(expiryDateStr);
        const daysDiff = Math.floor((todayDate.getTime() - expiryDate.getTime()) / (1000 * 86400));

        if (daysDiff > 0) {
          // Membership subscription is past expiry date
          const graceDays = rules.grace_period_days || 0;
          if (rules.deny_if_expired) {
            if (daysDiff > graceDays) {
              decision.reason = `Membership expired on ${expiryDateStr} (${daysDiff} days past expiry)`;
              decision.ruleDetails.expired = true;
              return decision;
            } else {
              // Inside grace period!
              decision.warning = `Grace Period Active: ${graceDays - daysDiff + 1} day(s) remaining`;
              decision.ruleDetails.graceActive = true;
            }
          }
        }
      }
    } else if (memberRecord.member_status === 'Expired') {
      decision.reason = 'Membership Expired (No active subscription)';
      decision.ruleDetails.expired = true;
      return decision;
    }

    // 10. Outstanding Payment Dues Check
    if (rules.deny_if_payment_due) {
      const dues = await db.get(
        `SELECT SUM(balance) as total_due 
         FROM payments 
         WHERE member_id = ? AND balance > 0`,
        [memberRecord.member_id]
      );

      const totalDue = dues?.total_due || 0;
      if (totalDue > 0) {
        decision.reason = `Payment Overdue: Outstanding balance of ₹${totalDue}`;
        decision.ruleDetails.paymentDue = totalDue;
        return decision;
      }
    }

    // 11. Automatic Direction Determination (Check-In vs Check-Out)
    let determinedDirection = parsedEvent.direction;
    if (!determinedDirection || determinedDirection === 'auto') {
      const activeCheckIn = await db.get(
        `SELECT id, check_in FROM attendance 
         WHERE member_id = ? AND attendance_date = ? AND check_out IS NULL 
         ORDER BY id DESC LIMIT 1`,
        [memberRecord.member_id, todayStr]
      );

      if (activeCheckIn) {
        determinedDirection = 'check_out';
      } else {
        determinedDirection = 'check_in';
      }
    }

    // 12. Access Granted!
    decision.allowed = true;
    decision.accessResult = 'Granted';
    decision.reason = decision.warning ? `Granted (${decision.warning})` : 'Access Granted: Active Member';
    decision.direction = determinedDirection;

    return decision;
  } catch (error) {
    console.error('Access rule evaluation error (Fail-Closed triggered):', error);
    decision.allowed = false;
    decision.accessResult = 'Denied';
    decision.reason = 'System Safety: Access evaluation failed';
    return decision;
  }
}

/**
 * Check if time string HH:MM is within start and end window
 */
function isWithinTimeWindow(currentHhMm, startHhMm, endHhMm) {
  if (!startHhMm || !endHhMm) return true;
  if (startHhMm === endHhMm) return true;
  if (startHhMm < endHhMm) {
    return currentHhMm >= startHhMm && currentHhMm <= endHhMm;
  }
  // Crosses midnight (e.g. 20:00 to 04:00)
  return currentHhMm >= startHhMm || currentHhMm <= endHhMm;
}

module.exports = {
  evaluateAccess,
  isWithinTimeWindow
};
