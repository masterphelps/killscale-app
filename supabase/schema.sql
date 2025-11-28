-- ============================================================================
-- ADNEST DATABASE SCHEMA
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================================
-- USERS & ACCOUNTS
-- ============================================================================

-- User profiles (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  plan text default 'free' check (plan in ('free', 'pro', 'agency')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ad accounts (can have multiple per user, based on plan)
create table public.ad_accounts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  meta_account_id text, -- For future API integration
  is_connected boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================================
-- RULES / THRESHOLDS
-- ============================================================================

-- User-defined verdict rules (one set per ad account)
create table public.rules (
  id uuid default uuid_generate_v4() primary key,
  ad_account_id uuid references public.ad_accounts(id) on delete cascade not null unique,
  scale_roas numeric(10,2) default 3.0 not null,
  min_roas numeric(10,2) default 1.5 not null,
  learning_spend numeric(10,2) default 100.0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================================
-- AD DATA (from CSV uploads or future API)
-- ============================================================================

-- Data uploads tracking
create table public.uploads (
  id uuid default uuid_generate_v4() primary key,
  ad_account_id uuid references public.ad_accounts(id) on delete cascade not null,
  filename text,
  row_count integer,
  date_start date,
  date_end date,
  source text default 'csv' check (source in ('csv', 'api')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Raw ad-level data
-- Each row represents one ad's performance for a date range
create table public.ad_data (
  id uuid default uuid_generate_v4() primary key,
  ad_account_id uuid references public.ad_accounts(id) on delete cascade not null,
  upload_id uuid references public.uploads(id) on delete cascade,
  
  -- Date range for this data
  date_start date not null,
  date_end date not null,
  
  -- Hierarchy identifiers
  campaign_name text not null,
  adset_name text not null,
  ad_name text not null,
  
  -- Meta IDs (for future API, nullable for CSV)
  campaign_id text,
  adset_id text,
  ad_id text,
  
  -- Metrics
  impressions bigint default 0,
  clicks bigint default 0,
  spend numeric(12,2) default 0,
  purchases integer default 0,
  revenue numeric(12,2) default 0,
  
  -- Computed fields (calculated on insert/update)
  cpc numeric(10,2) generated always as (
    case when clicks > 0 then spend / clicks else 0 end
  ) stored,
  cpm numeric(10,2) generated always as (
    case when impressions > 0 then (spend / impressions) * 1000 else 0 end
  ) stored,
  ctr numeric(10,4) generated always as (
    case when impressions > 0 then clicks::numeric / impressions else 0 end
  ) stored,
  roas numeric(10,2) generated always as (
    case when spend > 0 then revenue / spend else 0 end
  ) stored,
  cpa numeric(10,2) generated always as (
    case when purchases > 0 then spend / purchases else 0 end
  ) stored,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for fast queries
create index idx_ad_data_account on public.ad_data(ad_account_id);
create index idx_ad_data_dates on public.ad_data(date_start, date_end);
create index idx_ad_data_campaign on public.ad_data(campaign_name);

-- ============================================================================
-- VIEWS FOR ROLLUPS
-- ============================================================================

-- Campaign-level rollups
create or replace view public.campaign_rollups as
select 
  ad_account_id,
  date_start,
  date_end,
  campaign_name,
  sum(impressions) as impressions,
  sum(clicks) as clicks,
  sum(spend) as spend,
  sum(purchases) as purchases,
  sum(revenue) as revenue,
  case when sum(spend) > 0 then sum(revenue) / sum(spend) else 0 end as roas,
  case when sum(purchases) > 0 then sum(spend) / sum(purchases) else 0 end as cpa,
  count(distinct adset_name) as adset_count,
  count(distinct ad_name) as ad_count
from public.ad_data
group by ad_account_id, date_start, date_end, campaign_name;

-- Ad set-level rollups
create or replace view public.adset_rollups as
select 
  ad_account_id,
  date_start,
  date_end,
  campaign_name,
  adset_name,
  sum(impressions) as impressions,
  sum(clicks) as clicks,
  sum(spend) as spend,
  sum(purchases) as purchases,
  sum(revenue) as revenue,
  case when sum(spend) > 0 then sum(revenue) / sum(spend) else 0 end as roas,
  case when sum(purchases) > 0 then sum(spend) / sum(purchases) else 0 end as cpa,
  count(distinct ad_name) as ad_count
from public.ad_data
group by ad_account_id, date_start, date_end, campaign_name, adset_name;

-- Account-level totals
create or replace view public.account_totals as
select 
  ad_account_id,
  date_start,
  date_end,
  sum(impressions) as impressions,
  sum(clicks) as clicks,
  sum(spend) as spend,
  sum(purchases) as purchases,
  sum(revenue) as revenue,
  case when sum(spend) > 0 then sum(revenue) / sum(spend) else 0 end as roas,
  case when sum(purchases) > 0 then sum(spend) / sum(purchases) else 0 end as cpa,
  count(distinct campaign_name) as campaign_count
from public.ad_data
group by ad_account_id, date_start, date_end;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.ad_accounts enable row level security;
alter table public.rules enable row level security;
alter table public.uploads enable row level security;
alter table public.ad_data enable row level security;

-- Profiles: users can only see/edit their own
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Ad accounts: users can only see/edit their own
create policy "Users can view own ad accounts" on public.ad_accounts
  for select using (auth.uid() = user_id);

create policy "Users can insert own ad accounts" on public.ad_accounts
  for insert with check (auth.uid() = user_id);

create policy "Users can update own ad accounts" on public.ad_accounts
  for update using (auth.uid() = user_id);

create policy "Users can delete own ad accounts" on public.ad_accounts
  for delete using (auth.uid() = user_id);

-- Rules: users can only see/edit rules for their accounts
create policy "Users can view own rules" on public.rules
  for select using (
    ad_account_id in (
      select id from public.ad_accounts where user_id = auth.uid()
    )
  );

create policy "Users can insert own rules" on public.rules
  for insert with check (
    ad_account_id in (
      select id from public.ad_accounts where user_id = auth.uid()
    )
  );

create policy "Users can update own rules" on public.rules
  for update using (
    ad_account_id in (
      select id from public.ad_accounts where user_id = auth.uid()
    )
  );

-- Uploads: users can only see/manage their own
create policy "Users can view own uploads" on public.uploads
  for select using (
    ad_account_id in (
      select id from public.ad_accounts where user_id = auth.uid()
    )
  );

create policy "Users can insert own uploads" on public.uploads
  for insert with check (
    ad_account_id in (
      select id from public.ad_accounts where user_id = auth.uid()
    )
  );

create policy "Users can delete own uploads" on public.uploads
  for delete using (
    ad_account_id in (
      select id from public.ad_accounts where user_id = auth.uid()
    )
  );

-- Ad data: users can only see/manage their own
create policy "Users can view own ad data" on public.ad_data
  for select using (
    ad_account_id in (
      select id from public.ad_accounts where user_id = auth.uid()
    )
  );

create policy "Users can insert own ad data" on public.ad_data
  for insert with check (
    ad_account_id in (
      select id from public.ad_accounts where user_id = auth.uid()
    )
  );

create policy "Users can delete own ad data" on public.ad_data
  for delete using (
    ad_account_id in (
      select id from public.ad_accounts where user_id = auth.uid()
    )
  );

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-create default rules when ad account is created
create or replace function public.handle_new_ad_account()
returns trigger as $$
begin
  insert into public.rules (ad_account_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_ad_account_created
  after insert on public.ad_accounts
  for each row execute procedure public.handle_new_ad_account();

-- Update timestamp function
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at();

create trigger update_ad_accounts_updated_at
  before update on public.ad_accounts
  for each row execute procedure public.update_updated_at();

create trigger update_rules_updated_at
  before update on public.rules
  for each row execute procedure public.update_updated_at();

-- ============================================================================
-- SAMPLE DATA (for testing - remove in production)
-- ============================================================================

-- Uncomment to insert test data after creating a user:
/*
insert into public.ad_accounts (user_id, name) 
values ('YOUR_USER_ID', 'My Test Store');

-- Then get the ad_account_id and insert sample ad data
*/
