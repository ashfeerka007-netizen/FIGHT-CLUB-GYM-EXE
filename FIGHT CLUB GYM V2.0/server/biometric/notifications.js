// Biometric WhatsApp Notification Dispatcher & Throttling Controller
// Fight Club Gym Management System

const db = require('../db');
const whatsappService = require('../whatsapp/service');

// In-memory throttling cache: memberId_templateKey -> lastSentTimestamp
const notificationThrottleMap = new Map();

/**
 * Dispatch automated WhatsApp notification for biometric access events
 *
 * @param {Object} params
 * @param {Object} params.decision - Access decision object
 * @param {Object} params.device - Biometric device record
 * @returns {Promise<{ sent: boolean, reason?: string, result?: any }>}
 */
async function dispatchAccessNotification({ decision, device }) {
  try {
    // 1. Fetch biometric notification settings
    const notifSettings = await db.get(`SELECT * FROM access_notification_settings WHERE id = 1`);
    if (!notifSettings || !notifSettings.enabled) {
      return { sent: false, reason: 'Biometric notifications are disabled in settings' };
    }

    // 2. Fetch gym settings for phone & branding
    const gymSettings = await db.get(`SELECT * FROM settings WHERE id = 1`) || {};

    const member = decision.member;
    const now = new Date();
    const eventTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const eventDateStr = now.toISOString().split('T')[0];

    let templateKey = null;
    let shouldSend = false;

    if (decision.allowed) {
      if (decision.direction === 'check_in' && notifSettings.notify_on_checkin) {
        templateKey = notifSettings.template_checkin || 'biometric_checkin';
        shouldSend = true;
      } else if (decision.direction === 'check_out' && notifSettings.notify_on_checkout) {
        templateKey = notifSettings.template_checkout || 'biometric_checkout';
        shouldSend = true;
      }
    } else {
      // Access Denied
      if (notifSettings.notify_on_denied) {
        if (decision.ruleDetails.expired) {
          templateKey = notifSettings.template_denied_expired || 'biometric_denied_expired';
          shouldSend = true;
        } else if (decision.ruleDetails.paymentDue) {
          templateKey = notifSettings.template_denied_overdue || 'biometric_denied_overdue';
          shouldSend = true;
        } else if (decision.ruleDetails.statusDenied) {
          templateKey = notifSettings.template_denied_inactive || 'biometric_denied_inactive';
          shouldSend = true;
        } else if (!member) {
          // Unknown device user scan
          templateKey = notifSettings.template_unknown_user || 'biometric_unknown_user';
          // Send to admin or return if no recipient mobile
          shouldSend = false;
        }
      }
    }

    if (!shouldSend || !templateKey || !member || !member.mobile) {
      return { sent: false, reason: 'Notification condition not met or missing member mobile' };
    }

    // 3. Per-Member Notification Cooldown Throttle
    const cooldownMinutes = notifSettings.cooldown_minutes !== undefined ? notifSettings.cooldown_minutes : 15;
    if (cooldownMinutes > 0) {
      const throttleKey = `${member.id}_${templateKey}`;
      const lastSent = notificationThrottleMap.get(throttleKey);
      if (lastSent) {
        const elapsedMinutes = (now.getTime() - lastSent) / (1000 * 60);
        if (elapsedMinutes < cooldownMinutes) {
          return {
            sent: false,
            reason: `Notification throttled (Sent ${Math.round(elapsedMinutes)}m ago, cooldown is ${cooldownMinutes}m)`
          };
        }
      }
      notificationThrottleMap.set(throttleKey, now.getTime());
    }

    // 4. Build Template Dynamic Placeholders
    const placeholderData = {
      MemberName: member.fullname || 'Fighter',
      MembershipID: member.member_code || 'FC-MEM',
      EventTime: eventTimeStr,
      EventDate: eventDateStr,
      DeviceName: device.name || 'Main Turnstile',
      Direction: decision.direction === 'check_out' ? 'Check-Out' : 'Check-In',
      ExpiryDate: decision.ruleDetails.expiryDate || 'N/A',
      Amount: decision.ruleDetails.paymentDue || 0,
      Status: member.status || 'Active',
      Reason: decision.reason || 'Biometric Verification',
      GymName: gymSettings.gym_name || 'Fight Club Gym',
      ContactNumber: gymSettings.phone || '+1 (555) 019-9911'
    };

    // 5. Send via WhatsApp service
    const sendResult = await whatsappService.sendMessage({
      memberId: member.id,
      memberName: member.fullname,
      mobile: member.whatsapp || member.mobile,
      templateKey,
      data: placeholderData,
      sentBy: 'biometric_access'
    });

    return {
      sent: sendResult.success,
      result: sendResult
    };
  } catch (error) {
    console.error('Biometric notification dispatch error:', error);
    return { sent: false, reason: error.message };
  }
}

module.exports = {
  dispatchAccessNotification,
  notificationThrottleMap
};
