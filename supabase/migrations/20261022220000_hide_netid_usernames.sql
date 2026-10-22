-- Usernames defaulted to the email prefix (the UTD NetID), and public.users was
-- readable by anyone holding the anon key, logged in or not. NetID +
-- "@utdallas.edu" is the user's email, which defeated get_contact_email's
-- "only after an approved claim" rule (LostnFound.md §12.9).
--
-- 1. New users get a random handle instead of their NetID.
-- 2. Existing rows that still carry their NetID are replaced.
-- 3. Profiles are readable only by signed-in users.

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- 12 hex chars from the (random, v4) user id: unique in practice at campus
  -- scale and never derived from the email.
  insert into public.users (id, username)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 12)
  );
  return new;
end;
$function$;

UPDATE public.users u
SET username = 'user_' || substr(replace(u.id::text, '-', ''), 1, 12)
FROM auth.users a
WHERE a.id = u.id
  AND (u.username IS NULL OR u.username = split_part(a.email, '@', 1));

DROP POLICY "Public read access to users" ON public.users;

CREATE POLICY "Signed-in users can read profiles" ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix the user-facing signup error, which was missing "Only".
CREATE OR REPLACE FUNCTION public.restrict_signup_by_email_domain (
  event jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  AS $function$
DECLARE
  user_email text;
BEGIN
  user_email := event->'user'->>'email';

  IF user_email !~* '@utdallas\.edu$' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Only utdallas.edu email addresses can sign up.'
      )
    );
  END IF;

  RETURN jsonb_build_object('user', event->'user');
END;
$function$;
