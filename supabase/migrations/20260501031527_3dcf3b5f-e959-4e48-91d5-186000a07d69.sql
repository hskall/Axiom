-- 1. App role enum + user_roles table (secure, separate from profiles)
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Live crisis events table (admin-broadcast)
CREATE TABLE public.crisis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES public.crisis_scenarios(id) ON DELETE CASCADE,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE public.crisis_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authed users can read crisis events"
  ON public.crisis_events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can create crisis events"
  ON public.crisis_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update crisis events"
  ON public.crisis_events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete crisis events"
  ON public.crisis_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.crisis_events;
ALTER TABLE public.crisis_events REPLICA IDENTITY FULL;

-- 3. Working orders for Limit / Stop-Loss
CREATE TABLE public.working_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  order_type text NOT NULL CHECK (order_type IN ('limit','stop')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  trigger_price numeric NOT NULL CHECK (trigger_price > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  filled_at timestamptz,
  fill_price numeric
);

ALTER TABLE public.working_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own working orders"
  ON public.working_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert their own working orders"
  ON public.working_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own working orders"
  ON public.working_orders FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete their own working orders"
  ON public.working_orders FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_working_orders_user_open ON public.working_orders(user_id, status);