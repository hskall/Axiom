
-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  paper_cash numeric(18,2) not null default 100000,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- portfolios (holdings)
create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  quantity numeric(18,6) not null default 0,
  avg_cost numeric(18,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, symbol)
);
alter table public.portfolios enable row level security;
create policy "portfolios_all_own" on public.portfolios for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- trades
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  quantity numeric(18,6) not null,
  price numeric(18,4) not null,
  executed_at timestamptz not null default now()
);
alter table public.trades enable row level security;
create policy "trades_all_own" on public.trades for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index trades_user_executed_idx on public.trades(user_id, executed_at desc);

-- budget_plans
create table public.budget_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  category text not null,
  amount numeric(18,2) not null,
  note text,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.budget_plans enable row level security;
create policy "budget_all_own" on public.budget_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- crisis_scenarios (shared)
create table public.crisis_scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null,
  period_label text not null,
  shock_pct numeric(6,3) not null,
  created_at timestamptz not null default now()
);
alter table public.crisis_scenarios enable row level security;
create policy "crisis_select_authed" on public.crisis_scenarios for select to authenticated using (true);

insert into public.crisis_scenarios (slug, name, description, period_label, shock_pct) values
  ('gfc-2008', '2008 Global Financial Crisis', 'Collapse of Lehman Brothers triggered a global credit crisis. The S&P 500 fell roughly 38.5% over the year as banks failed and liquidity dried up.', 'Sep 2008 – Mar 2009', -0.385),
  ('covid-2020', '2020 COVID-19 Crash', 'Pandemic lockdowns triggered the fastest bear market in history. The S&P 500 fell about 34% in just 33 days before staging a sharp recovery.', 'Feb 2020 – Mar 2020', -0.34);

-- algorithms
create table public.algorithms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.algorithms enable row level security;
create policy "algorithms_all_own" on public.algorithms for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger algorithms_updated before update on public.algorithms for each row execute function public.set_updated_at();
create trigger portfolios_updated before update on public.portfolios for each row execute function public.set_updated_at();

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
