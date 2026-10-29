SET local check_function_bodies = off;

CREATE EXTENSION "vector" SCHEMA "extensions";

CREATE TABLE "public"."claims" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "post_id"     uuid                     NOT NULL,
  "claimant_id" uuid                     NOT NULL,
  "status"      text                     NOT NULL DEFAULT 'pending'::text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "claims_pkey" PRIMARY KEY (id),
  CONSTRAINT "claims_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))
);

ALTER TABLE "public"."claims"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."posts" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "type"        text                     NOT NULL,
  "category"    text,
  "description" text,
  "resolved"    boolean                  NOT NULL DEFAULT false,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "user_id"     uuid                     NOT NULL,
  "embedding"   extensions.vector(512),
  CONSTRAINT "Posts_pkey" PRIMARY KEY (id),
  CONSTRAINT "posts_type_check" CHECK ((type = ANY (ARRAY['lost'::text, 'found'::text])))
);

ALTER TABLE "public"."posts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."users" (
  "id"         uuid                     NOT NULL,
  "username"   text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "Users_Username_key" UNIQUE (username),
  CONSTRAINT "Users_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."users"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_contact_email (
  claim_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
  result text;
BEGIN
  SELECT
    CASE
      WHEN c.claimant_id = auth.uid() THEN owner_auth.email
      WHEN p.user_id = auth.uid() THEN claimant_auth.email
      ELSE NULL
    END
  INTO result
  FROM public.claims c
  JOIN public.posts p ON p.id = c.post_id
  JOIN auth.users owner_auth ON owner_auth.id = p.user_id
  JOIN auth.users claimant_auth ON claimant_auth.id = c.claimant_id
  WHERE c.id = claim_id AND c.status = 'approved';

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.users (id, username)
  values (
    new.id,
    split_part(new.email, '@', 1)
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.has_active_lost_post (
  uid uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.posts
    WHERE user_id = uid
    AND type = 'lost'
    AND resolved = false
  );
$function$;

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
        'message', 'utdallas.edu email addresses are allowed to sign up.'
      )
    );
  END IF;

  RETURN jsonb_build_object('user', event->'user');
END;
$function$;

ALTER TABLE "public"."claims"
  ADD CONSTRAINT "claims_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id);

ALTER TABLE "public"."users"
  ADD CONSTRAINT "Users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."claims"
  ADD CONSTRAINT "claims_claimant_id_fkey" FOREIGN KEY (claimant_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."posts"
  ADD CONSTRAINT "Posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

CREATE INDEX idx_posts_user_type_resolved ON public.posts USING btree (user_id, TYPE, resolved);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "Claim visible to claimant or post owner" ON "public"."claims"
  FOR SELECT
  TO "authenticated"
  USING (((claimant_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = claims.post_id) AND (posts.user_id = auth.uid()))))));

CREATE POLICY "Claimant can withdraw a pending claim" ON "public"."claims"
  FOR UPDATE
  TO "authenticated"
  USING (((claimant_id = auth.uid()) AND (status = 'pending'::text)))
  WITH CHECK (((claimant_id = auth.uid()) AND (status = 'withdrawn'::text)));

CREATE POLICY "Post owner can approve or reject claims" ON "public"."claims"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = claims.post_id) AND (posts.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = claims.post_id) AND (posts.user_id = auth.uid())))));

CREATE POLICY "Users can create their own claims" ON "public"."claims"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((claimant_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = claims.post_id) AND (p.resolved = false) AND (p.user_id <> auth.uid()) AND ((p.type = 'lost'::text) OR public.has_active_lost_post(auth.uid())))))));

CREATE POLICY "Authenticated users can create their own posts" ON "public"."posts"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((user_id = auth.uid()) AND (type = ANY (ARRAY['lost'::text, 'found'::text])) AND (resolved = false)));

CREATE POLICY "Lost posts open, found posts gated on having an active lost pos" ON "public"."posts"
  FOR SELECT
  TO "authenticated"
  USING (((TYPE = 'lost'::text) OR (user_id = auth.uid()) OR ((TYPE = 'found'::text) AND public.has_active_lost_post(auth.uid()))));

CREATE POLICY "Users can delete their own posts" ON "public"."posts"
  FOR DELETE
  TO "authenticated"
  USING ((user_id = auth.uid()));

CREATE POLICY "Users can update their own posts" ON "public"."posts"
  FOR UPDATE
  TO "authenticated"
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Public read access to users" ON "public"."users"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Users can update own username" ON "public"."users"
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));

COMMENT ON EXTENSION "vector" IS 'vector data type and ivfflat and hnsw access methods';

REVOKE ALL ON FUNCTION "public"."get_contact_email"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_contact_email"(uuid) TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."has_active_lost_post"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."restrict_signup_by_email_domain"(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."restrict_signup_by_email_domain"(jsonb) TO "postgres", "service_role", "supabase_auth_admin";

REVOKE ALL ON SCHEMA "public" FROM "supabase_auth_admin";

GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."claims" TO "anon";

REVOKE ALL ("claimant_id") ON TABLE "public"."claims" FROM "authenticated";

GRANT INSERT ("claimant_id") ON TABLE "public"."claims" TO "authenticated";

REVOKE ALL ("post_id") ON TABLE "public"."claims" FROM "authenticated";

GRANT INSERT ("post_id") ON TABLE "public"."claims" TO "authenticated";

REVOKE ALL ("status") ON TABLE "public"."claims" FROM "authenticated";

GRANT UPDATE ("status") ON TABLE "public"."claims" TO "authenticated";

REVOKE ALL ON TABLE "public"."claims" FROM "authenticated";

GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."claims" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."claims" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."posts" TO "anon";

REVOKE ALL ("category") ON TABLE "public"."posts" FROM "authenticated";

GRANT INSERT ("category"), UPDATE ("category") ON TABLE "public"."posts" TO "authenticated";

REVOKE ALL ("description") ON TABLE "public"."posts" FROM "authenticated";

GRANT INSERT ("description"), UPDATE ("description") ON TABLE "public"."posts" TO "authenticated";

REVOKE ALL ("embedding") ON TABLE "public"."posts" FROM "authenticated";

GRANT INSERT ("embedding") ON TABLE "public"."posts" TO "authenticated";

REVOKE ALL ("resolved") ON TABLE "public"."posts" FROM "authenticated";

GRANT UPDATE ("resolved") ON TABLE "public"."posts" TO "authenticated";

REVOKE ALL ("type") ON TABLE "public"."posts" FROM "authenticated";

GRANT INSERT ("type"), UPDATE ("type") ON TABLE "public"."posts" TO "authenticated";

REVOKE ALL ("user_id") ON TABLE "public"."posts" FROM "authenticated";

GRANT INSERT ("user_id") ON TABLE "public"."posts" TO "authenticated";

REVOKE ALL ON TABLE "public"."posts" FROM "authenticated";

GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."posts" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."posts" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "anon";

REVOKE ALL ("username") ON TABLE "public"."users" FROM "authenticated";

GRANT UPDATE ("username") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ON TABLE "public"."users" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."users" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "postgres", "service_role";

