-- =====================================================================
-- ローカル開発専用: auth.users にメール＋パスワードハッシュを持たせる（LocalAuthProvider 用）
-- supabase/v2/tests/00_local_auth_stub.sql の直後に流す。本番（Supabase Auth）では流さない。
-- =====================================================================
alter table auth.users add column if not exists encrypted_password text;
create unique index if not exists users_email_lower_key on auth.users (lower(email)) where email is not null;
alter table auth.users alter column id set default gen_random_uuid();
