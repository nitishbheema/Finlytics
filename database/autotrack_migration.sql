-- Finlytics AutoTrack (Android Notification Access, no SMS permission)
-- Applied to project fvihctcbrpwthgvhtzrb on 2026-11-08.

CREATE TABLE IF NOT EXISTS public.autotrack_devices (
  device_id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  device_name VARCHAR(80) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_autotrack_devices_user_active
  ON public.autotrack_devices(user_id, created_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.autotrack_pairing_codes (
  pairing_id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_autotrack_pairing_user_created
  ON public.autotrack_pairing_codes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.autotrack_events (
  event_id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.autotrack_devices(device_id) ON DELETE CASCADE,
  source_app VARCHAR(120) NOT NULL,
  fingerprint CHAR(64) NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('debit','credit')),
  transaction_date DATE NOT NULL,
  merchant VARCHAR(180) NOT NULL DEFAULT 'UPI transaction',
  reference VARCHAR(150),
  status VARCHAR(12) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','duplicate')),
  imported_into VARCHAR(10) CHECK (imported_into IN ('expense','income')),
  record_id INTEGER,
  review_note VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_autotrack_user_fingerprint UNIQUE (user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_autotrack_events_user_status_date
  ON public.autotrack_events(user_id, status, transaction_date DESC);

ALTER TABLE public.autotrack_events ADD COLUMN IF NOT EXISTS review_note VARCHAR(240);
ALTER TABLE public.autotrack_events DROP CONSTRAINT IF EXISTS autotrack_events_status_check;
ALTER TABLE public.autotrack_events ADD CONSTRAINT autotrack_events_status_check
  CHECK (status IN ('pending','approved','rejected','duplicate'));

CREATE TABLE IF NOT EXISTS public.autotrack_settings (
  user_id INTEGER PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  auto_import_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  require_reference BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.transaction_import_fingerprints
  DROP CONSTRAINT IF EXISTS transaction_import_fingerprints_source_check;
ALTER TABLE public.transaction_import_fingerprints
  ADD CONSTRAINT transaction_import_fingerprints_source_check
  CHECK (source IN ('csv','android_sms','android_notification','account_aggregator','email'));

ALTER TABLE public.autotrack_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autotrack_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autotrack_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autotrack_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.autotrack_devices FROM anon, authenticated;
REVOKE ALL ON TABLE public.autotrack_pairing_codes FROM anon, authenticated;
REVOKE ALL ON TABLE public.autotrack_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.autotrack_settings FROM anon, authenticated;
