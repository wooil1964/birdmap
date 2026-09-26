-- Application-level Turnstile redemption guard (defense-in-depth on top of Siteverify single-use).
-- 2026-09-26 staging: concurrent Siteverify requests for one token repeatedly returned several
-- success responses (race-like behavior). One row per redeemed token, inserted in the same D1 batch
-- as the submission, so a second logical request with the same token rolls back entirely.
-- Stores only SHA-256(token), the request UUID and the time. No token, IP, species, location or payload.
CREATE TABLE captcha_redemptions (
  token_hash TEXT NOT NULL PRIMARY KEY CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  request_id TEXT NOT NULL,
  redeemed_at TEXT NOT NULL
);
CREATE INDEX captcha_redemptions_redeemed_at ON captcha_redemptions(redeemed_at);
