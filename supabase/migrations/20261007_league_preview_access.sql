-- People (besides admins) who may see a league while it is still hidden.
-- Grants no admin powers; only the unpublished /league page.
alter table public.leagues add column if not exists preview_user_ids uuid[] not null default '{}';
