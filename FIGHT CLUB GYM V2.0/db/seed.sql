-- Seeding Data for Fight Club Gym Membership Management System

-- Insert Roles
INSERT INTO roles (id, name, permissions) VALUES
(1, 'Super Admin', '["all"]'),
(2, 'Admin', '["dashboard", "members", "memberships", "subscriptions", "payments", "reminders", "expenses", "reports", "attendance", "trainers", "staff", "settings", "backups"]'),
(3, 'Receptionist', '["dashboard", "members", "subscriptions", "payments", "reminders", "attendance"]'),
(4, 'Trainer', '["dashboard", "attendance", "trainers"]'),
(5, 'Read-only Staff', '["dashboard", "members", "attendance"]');

-- Insert Users (Password hashes are SHA-256 for simplicity/reliability)
-- Password for admin is 'admin123' -> SHA-256 = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
-- Password for receptionist is 'recept123' -> SHA-256 = '5545528042d61b4d32d7a713da5d0917f13af2d71cf2ffe5f8e3c6b11b78ffd0'
INSERT INTO users (id, username, password_hash, fullname, role_id, status) VALUES
(1, 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Tyler Durden (Super)', 1, 'Active'),
(2, 'jack', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Jack Narrator', 2, 'Active'),
(3, 'chloe', '5545528042d61b4d32d7a713da5d0917f13af2d71cf2ffe5f8e3c6b11b78ffd0', 'Chloe Receptionist', 3, 'Active');

-- Insert Trainers
INSERT INTO trainers (id, fullname, photo_path, specialization, salary, status, performance_notes) VALUES
(1, 'Tyler Durden', '', 'Boxing & Street Fighting', 75000, 'Active', 'Excellent motivator. Focuses on mental strength and raw endurance.'),
(2, 'Robert Paulson', '', 'Heavyweight Powerlifting', 35000, 'Active', 'Strong work ethic. Popular among powerlifters.'),
(3, 'Marla Singer', '', 'Yoga & Agility Training', 40000, 'Active', 'Specializes in flexibility and rehabilitation workouts.');

-- Insert Staff
INSERT INTO staff (id, fullname, role, permissions, salary, status) VALUES
(1, 'Chloe Receptionist', 'Receptionist', '[]', 22000, 'Active'),
(2, 'Angel Face', 'Manager', '[]', 45000, 'Active'),
(3, 'Richard Cleaner', 'Cleaner', '[]', 15000, 'Active');

-- Insert Membership Plans
INSERT INTO membership_plans (id, name, category, duration_months, price, discount, tax, final_amount, features, status) VALUES
(1, 'Admission Plan (₹1500 Admission + 1 Month ₹1000)', 'Gym', 1, 2500, 0, 0, 2500, '["One-time ₹1500 Admission Fee Included", "1 Month Gym Subscription Included (₹1000)", "Registration and ID Card", "Locker activation"]', 'Active'),
(2, 'Monthly Package', 'Gym', 1, 1000, 0, 0, 1000, '["Access to gym floor", "Cardio machines", "Free lockers"]', 'Active'),
(3, '3 Month Package', 'Gym', 3, 4200, 0, 0, 4200, '["Access to gym floor", "Cardio machines", "Free lockers", "General trainer assistance"]', 'Active'),
(4, '6 Month Package', 'Gym', 6, 6300, 0, 0, 6300, '["Access to gym floor", "Cardio machines", "Free lockers", "General trainer assistance"]', 'Active'),
(5, '1 Year Package', 'Gym', 12, 8500, 0, 0, 8500, '["Access to gym floor", "Cardio machines", "Free lockers", "General trainer assistance", "Diet plan advice"]', 'Active'),
(6, 'Couple Package', 'Gym', 12, 14000, 0, 0, 14000, '["Membership for 2 people", "Access to gym floor", "Cardio machines", "Free lockers", "General trainer assistance"]', 'Active'),
(7, 'Family Package (4 Members)', 'Gym', 12, 20000, 0, 0, 20000, '["Membership for 4 family members", "Access to gym floor", "Cardio machines", "Free lockers", "General trainer assistance"]', 'Active'),
(8, 'Life Time Package', 'Gym', 60, 25000, 0, 0, 25000, '["Lifetime access to gym floor", "All fitness equipment access", "Free lockers", "Personal trainer guidance", "VIP Lounge access"]', 'Active');

-- Insert Members
-- We use dates relative to current date (let's assume current year is 2026 as per local time)
INSERT INTO members (id, member_code, fullname, photo_path, gender, dob, mobile, whatsapp, email, address, emergency_contact, blood_group, joining_date, trainer_id, medical_notes, status, notes) VALUES
(1, 'FC-1001', 'David Fincher', '', 'Male', '1982-05-12', '9876543210', '9876543210', 'fincher@cinema.com', 'Hollywood Blvd, LA', 'Brad Pitt (+1 999 888)', 'O+', '2026-01-10', 1, 'Minor knee issue', 'Active', 'Wants to focus on stamina and shadow boxing.'),
(2, 'FC-1002', 'Edward Norton', '', 'Male', '1989-08-18', '9988776655', '9988776655', 'narrator@paperstreet.com', '512 Paper Street, Delaware', 'Marla Singer (+1 555 1212)', 'A-', '2026-02-15', 1, 'Insomnia symptoms', 'Active', 'Prefers late night workouts.'),
(3, 'FC-1003', 'Brad Pitt', '', 'Male', '1983-12-18', '9876543211', '9876543211', 'soap@paperstreet.com', '512 Paper Street, Delaware', 'Edward Norton (+1 555 1212)', 'B+', '2026-02-15', 2, 'No medical issues', 'Active', 'Lead trainer/member. Extremely fit.'),
(4, 'FC-1004', 'Helena Carter', '', 'Female', '1986-05-26', '9112233445', '9112233445', 'marla@groupthem.com', 'Hotel Regent, Room 808', 'Tyler Durden (+1 555 019)', 'AB-', '2026-03-01', 3, 'Asthma', 'Active', 'Yoga and light cardio only.'),
(5, 'FC-1005', 'Cornelius Narrator', '', 'Male', '1991-04-04', '9555666777', '9555666777', 'cornelius@support.org', 'Flat 4B, Rental Plaza', 'Chloe (+1 555 012)', 'O-', '2026-04-10', NULL, 'None', 'Frozen', 'Membership frozen due to business travel. Resume requested in July.'),
(6, 'FC-1006', 'Jared Leto', '', 'Male', '1995-12-26', '9333444555', '9333444555', 'angelface@fightclub.com', 'Delaware Suburbs', 'Tyler (+1 555 019)', 'A+', '2026-05-01', 1, 'None', 'Expired', 'Membership expired on 2026-06-01. Plan renewal pending.');

-- Insert Subscriptions
-- Subscription for FC-1001 (Active)
INSERT INTO subscriptions (id, member_id, plan_id, start_date, expiry_date, status) VALUES
(1, 1, 5, '2026-01-10', '2027-01-09', 'Active'),
-- Subscription for FC-1002 (Active)
(2, 2, 5, '2026-02-15', '2027-02-14', 'Active'),
-- Subscription for FC-1003 (Active)
(3, 3, 5, '2026-02-15', '2027-02-14', 'Active'),
-- Subscription for FC-1004 (Active)
(4, 4, 2, '2026-07-01', '2026-08-01', 'Active'),
-- Subscription for FC-1005 (Frozen)
(5, 5, 2, '2026-04-10', '2026-05-09', 'Frozen'),
-- Subscription for FC-1006 (Expired)
(6, 6, 2, '2026-05-01', '2026-06-01', 'Expired');

-- Insert Payments
INSERT INTO payments (id, invoice_number, payment_date, member_id, subscription_id, amount, discount, tax, paid_amount, balance, payment_method, remarks) VALUES
('1', 'INV-2026-001', '2026-01-10', 1, 1, 12000, 1800, 1836, 12036, 0, 'Bank Transfer', 'Paid annual elite plan in full.'),
('2', 'INV-2026-002', '2026-02-15', 2, 2, 28000, 5600, 4032, 26432, 0, 'Card', 'Paid annual boxing master plan.'),
('3', 'INV-2026-003', '2026-02-15', 3, 3, 28000, 5600, 4032, 26432, 0, 'Card', 'Paid annual boxing master plan.'),
('4', 'INV-2026-004', '2026-07-01', 4, 4, 2000, 0, 360, 2360, 0, 'UPI', 'Paid yoga monthly calm.'),
('5', 'INV-2026-005', '2026-04-10', 5, 5, 1500, 0, 270, 1770, 0, 'Cash', 'Paid gym monthly basic.'),
('6', 'INV-2026-006', '2026-05-01', 6, 6, 3000, 0, 540, 3540, 0, 'UPI', 'Paid boxing monthly training.');

-- Insert Expenses
INSERT INTO expenses (id, expense_date, category, amount, vendor, payment_method, bill_path, remarks) VALUES
(1, '2026-07-01', 'Rent', 35000, 'Delaware Real Estate Co.', 'Bank Transfer', '', 'July Gym Basement Rent'),
(2, '2026-07-05', 'Electricity', 8400, 'State Power Corp', 'UPI', '', 'June Electricity Bill'),
(3, '2026-07-06', 'Trainer Salary', 35000, 'Robert Paulson', 'Bank Transfer', '', 'June Salary'),
(4, '2026-07-06', 'Trainer Salary', 40000, 'Marla Singer', 'Bank Transfer', '', 'June Salary'),
(5, '2026-07-07', 'Equipment Purchase', 18500, 'Fight Equipments Inc.', 'Card', '', 'New punch bags and speed balls'),
(6, '2026-07-10', 'Cleaning', 2500, 'SuperClean Products', 'Cash', '', 'Detergents, soaps, and cleaning liquids');

-- Insert Attendance Logs
-- Add attendance for active members over the past few days (July 14, 15, 16)
INSERT INTO attendance (member_id, check_in, check_out, attendance_date) VALUES
(1, '2026-07-14T08:05:00', '2026-07-14T09:30:00', '2026-07-14'),
(2, '2026-07-14T21:10:00', '2026-07-14T23:15:00', '2026-07-14'),
(3, '2026-07-14T21:05:00', '2026-07-14T23:30:00', '2026-07-14'),
(4, '2026-07-14T17:15:00', '2026-07-14T18:30:00', '2026-07-14'),

(1, '2026-07-15T08:12:00', '2026-07-15T10:00:00', '2026-07-15'),
(2, '2026-07-15T21:00:00', '2026-07-15T23:05:00', '2026-07-15'),
(3, '2026-07-15T21:02:00', '2026-07-15T23:45:00', '2026-07-15'),

(1, '2026-07-16T07:55:00', '2026-07-16T09:15:00', '2026-07-16'),
(2, '2026-07-16T21:05:00', NULL, '2026-07-16'), -- Currently checked in (no checkout yet)
(3, '2026-07-16T21:00:00', NULL, '2026-07-16'); -- Currently checked in

-- Insert Activity Logs
INSERT INTO activity_logs (user_id, username, action, details) VALUES
(1, 'admin', 'System Initialized', 'Database loaded and seeded with initial Fight Club data.'),
(1, 'admin', 'Plan Created', 'Added Gym Annual Elite plan'),
(2, 'jack', 'Member Registered', 'Registered member David Fincher (FC-1001)'),
(3, 'chloe', 'Payment Recorded', 'Invoice INV-2026-004 generated for Helena Carter');
