-- Counters for /api/track. Keys: 'day/YYYY-MM-DD' (conversions per day) and
-- 'visitor/YYYY-MM-DD/<hash>' (per-visitor daily cap, deleted once the day is over).
CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);

-- One random salt per UTC day for hashing visitor IPs. Older salts are deleted,
-- so past visitor hashes cannot be linked back to an IP.
CREATE TABLE IF NOT EXISTS salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);
