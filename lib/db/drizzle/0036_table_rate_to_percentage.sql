-- Table commission semantics change: table_booking_rate now stores a commission
-- PERCENTAGE (0–100) instead of a flat rupee fee per guest.
--
-- Old: table_booking_rate = "200.00"  -> ₹200 per guest
-- New: table_booking_rate = "10.00"   -> 10% of final table revenue
--
-- Existing stored values (e.g. "200.00") would be misread as 200%, which is
-- incorrect. Reset all vendors to 0 so admins can set appropriate percentages
-- via the Admin -> Commission tab before the next billing cycle.
UPDATE "vendor_commissions" SET "table_booking_rate" = '0.00';
