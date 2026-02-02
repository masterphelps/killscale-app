-- Onboarding profile fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Existing users skip onboarding
UPDATE profiles SET onboarding_completed = true
WHERE onboarding_completed IS NULL OR onboarding_completed = false;

-- Best-effort split full_name for existing users
UPDATE profiles SET
  first_name = COALESCE(first_name, split_part(full_name, ' ', 1)),
  last_name = COALESCE(last_name, CASE
    WHEN position(' ' in full_name) > 0
    THEN substring(full_name from position(' ' in full_name) + 1)
    ELSE NULL END)
WHERE first_name IS NULL AND full_name IS NOT NULL;
