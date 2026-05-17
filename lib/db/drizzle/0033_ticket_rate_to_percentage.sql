-- Ticket commission semantics change: ticket_rate now stores a commission
-- PERCENTAGE (0–100) instead of a flat rupee fee per ticket.
--
-- Old: ticket_rate = "50.00"  → ₹50 per ticket
-- New: ticket_rate = "10.00"  → 10% of ticket revenue
--
-- Existing stored values (e.g. "50.00") would be misread as 50%, which is
-- incorrect. Reset all vendors to 0 so admins can set appropriate percentages
-- via the Admin → Commission tab before the next billing cycle.
UPDATE "vendor_commissions" SET "ticket_rate" = '0.00';
