// WhatsApp Reminder Scheduler — Runs every 15 minutes
// Checks membership expiry & fee due dates against configurable reminder schedule

const db = require('../db');
const { sendMessage } = require('./service');

async function runScheduler() {
  try {
    const settings = await db.get('SELECT * FROM whatsapp_settings WHERE id = 1');
    if (!settings || !settings.enabled) return;

    const today = new Date().toISOString().split('T')[0];
    const reminders = await db.all('SELECT * FROM whatsapp_reminders WHERE is_active = 1');
    const gymSettings = await db.get('SELECT * FROM settings WHERE id = 1');

    for (const reminder of reminders) {
      const targetDate = addDays(today, -reminder.days_offset);

      if (reminder.type === 'expiry') {
        // Members whose subscription expires on targetDate
        const members = await db.all(
          `SELECT m.id, m.fullname, m.mobile, mp.name as plan_name, mp.price,
                  s.expiry_date, s.start_date
           FROM subscriptions s
           JOIN members m ON s.member_id = m.id
           JOIN membership_plans mp ON s.plan_id = mp.id
           WHERE s.expiry_date = ? AND s.status IN ('Active', 'Expired')
             AND m.mobile IS NOT NULL AND m.mobile != ''`,
          [targetDate]
        );

        for (const member of members) {
          const alreadySent = await db.get(
            `SELECT id FROM whatsapp_logs
             WHERE member_id = ? AND template_key = ? AND DATE(sent_at) = ?`,
            [member.id, reminder.template_key, today]
          );
          if (alreadySent) continue;

          await sendMessage({
            memberId: member.id,
            memberName: member.fullname,
            mobile: member.mobile,
            templateKey: reminder.template_key,
            data: {
              MemberName: member.fullname,
              MembershipPlan: member.plan_name,
              ExpiryDate: member.expiry_date,
              Amount: member.price ? member.price.toFixed(2) : '0',
              ContactNumber: gymSettings?.phone || '',
            },
            sentBy: 'scheduler',
          });
        }

      } else if (reminder.type === 'fee_due') {
        // Payments with balance > 0 due on targetDate
        const payments = await db.all(
          `SELECT p.*, m.fullname, m.mobile, mp.name as plan_name
           FROM payments p
           JOIN members m ON p.member_id = m.id
           LEFT JOIN subscriptions s ON s.member_id = m.id AND s.status = 'Active'
           LEFT JOIN membership_plans mp ON s.plan_id = mp.id
           WHERE p.balance > 0 AND DATE(p.payment_date) = ?
             AND m.mobile IS NOT NULL AND m.mobile != ''`,
          [targetDate]
        );

        for (const payment of payments) {
          const alreadySent = await db.get(
            `SELECT id FROM whatsapp_logs
             WHERE member_id = ? AND template_key = ? AND DATE(sent_at) = ?`,
            [payment.member_id, reminder.template_key, today]
          );
          if (alreadySent) continue;

          await sendMessage({
            memberId: payment.member_id,
            memberName: payment.fullname,
            mobile: payment.mobile,
            templateKey: reminder.template_key,
            data: {
              MemberName: payment.fullname,
              MembershipPlan: payment.plan_name || 'N/A',
              Amount: payment.balance ? payment.balance.toFixed(2) : '0',
              DueDate: payment.payment_date,
              ContactNumber: gymSettings?.phone || '',
            },
            sentBy: 'scheduler',
          });
        }
      }
    }

    // Birthday wishes
    const todayMMDD = today.slice(5); // MM-DD
    const birthdayMembers = await db.all(
      `SELECT * FROM members
       WHERE mobile IS NOT NULL AND mobile != ''
         AND substr(dob, 6) = ?`,
      [todayMMDD]
    );
    for (const member of birthdayMembers) {
      const alreadySent = await db.get(
        `SELECT id FROM whatsapp_logs
         WHERE member_id = ? AND template_key = 'birthday_wish' AND DATE(sent_at) = ?`,
        [member.id, today]
      );
      if (!alreadySent) {
        await sendMessage({
          memberId: member.id, memberName: member.fullname, mobile: member.mobile,
          templateKey: 'birthday_wish',
          data: { MemberName: member.fullname },
          sentBy: 'scheduler',
        });
      }
    }

    console.log(`[WhatsApp Scheduler] Run completed at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[WhatsApp Scheduler] Error:', err.message);
  }
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function start() {
  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  runScheduler(); // run immediately on boot
  setInterval(runScheduler, INTERVAL_MS);
  console.log('[WhatsApp Scheduler] Started — checking every 15 minutes.');
}

module.exports = { start, runScheduler };
