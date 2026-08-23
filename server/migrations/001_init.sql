-- WordWar — baseline schema (recovered via pg_dump from the original dev DB
-- on 2026-07-09; original migration files 001–009 were lost to a gitignore rule).
-- The _migrations bookkeeping table is created by src/db/migrate.ts itself.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE TABLE public.ad_rewards (
    transaction_id text NOT NULL,
    user_id uuid NOT NULL,
    reward_kind text NOT NULL,
    reported_amount integer DEFAULT 0 NOT NULL,
    granted boolean DEFAULT false NOT NULL,
    granted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.battle_pass_claims (
    user_id uuid NOT NULL,
    season_number integer NOT NULL,
    tier integer NOT NULL,
    track text NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT battle_pass_claims_track_check CHECK ((track = ANY (ARRAY['free'::text, 'premium'::text])))
);
CREATE TABLE public.battle_pass_rewards (
    season_number integer NOT NULL,
    tier integer NOT NULL,
    track text NOT NULL,
    cosmetic_id text,
    CONSTRAINT battle_pass_rewards_track_check CHECK ((track = ANY (ARRAY['free'::text, 'premium'::text])))
);
CREATE TABLE public.battle_pass_seasons (
    season_number integer NOT NULL,
    name text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    xp_per_tier integer DEFAULT 100 NOT NULL,
    max_tier integer DEFAULT 50 NOT NULL
);
CREATE TABLE public.coin_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount integer NOT NULL,
    source text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.cosmetics (
    id text NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    description text,
    price_cents integer DEFAULT 0 NOT NULL,
    rarity text DEFAULT 'common'::text NOT NULL,
    render_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    available_in_shop boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cosmetics_category_check CHECK ((category = ANY (ARRAY['board_theme'::text, 'victory_anim'::text, 'avatar'::text, 'nameplate'::text, 'profile_border'::text])))
);
CREATE TABLE public.daily_challenge_attempts (
    challenge_date date NOT NULL,
    user_id uuid NOT NULL,
    guesses jsonb NOT NULL,
    solved boolean DEFAULT false NOT NULL,
    guess_count integer DEFAULT 0 NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.daily_challenges (
    challenge_date date NOT NULL,
    word text NOT NULL,
    word_length integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.daily_words (
    day date NOT NULL,
    word text NOT NULL,
    plays integer DEFAULT 0 NOT NULL,
    solves integer DEFAULT 0 NOT NULL,
    avg_solve_ms bigint DEFAULT 0 NOT NULL,
    avg_guesses real DEFAULT 0 NOT NULL
);
CREATE TABLE public.friend_invite_codes (
    code text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.friendships (
    user_id uuid NOT NULL,
    friend_id uuid NOT NULL,
    status text DEFAULT 'accepted'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT friendships_check CHECK ((user_id <> friend_id))
);
CREATE TABLE public.guesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    player_id uuid NOT NULL,
    guess_sequence jsonb DEFAULT '[]'::jsonb NOT NULL
);
CREATE TABLE public.hint_uses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    user_id uuid NOT NULL,
    paid_with text NOT NULL,
    coins_spent integer DEFAULT 0 NOT NULL,
    "position" integer NOT NULL,
    letter text NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hint_uses_paid_with_check CHECK ((paid_with = ANY (ARRAY['free'::text, 'credit'::text, 'coins'::text])))
);
CREATE TABLE public.leaderboard_entries (
    user_id uuid NOT NULL,
    period text NOT NULL,
    bucket text NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    rank_points integer DEFAULT 1000 NOT NULL,
    last_match_at timestamp with time zone DEFAULT now() NOT NULL,
    mode text DEFAULT 'classic'::text NOT NULL
);
CREATE TABLE public.match_replays (
    match_id uuid NOT NULL,
    mode text NOT NULL,
    word text NOT NULL,
    word_length integer NOT NULL,
    p1_user_id uuid NOT NULL,
    p2_user_id uuid NOT NULL,
    p1_username text NOT NULL,
    p2_username text NOT NULL,
    p1_guesses jsonb NOT NULL,
    p2_guesses jsonb NOT NULL,
    winner text,
    outcome text NOT NULL,
    duration_ms integer NOT NULL,
    started_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player1_id uuid NOT NULL,
    player2_id uuid NOT NULL,
    word text NOT NULL,
    word_length integer NOT NULL,
    winner_id uuid,
    outcome text NOT NULL,
    duration_seconds integer NOT NULL,
    p1_rank_delta integer DEFAULT 0 NOT NULL,
    p2_rank_delta integer DEFAULT 0 NOT NULL,
    p1_is_bot boolean DEFAULT false NOT NULL,
    p2_is_bot boolean DEFAULT false NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone DEFAULT now() NOT NULL,
    mode text DEFAULT 'classic'::text NOT NULL
);
CREATE TABLE public.mystery_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    word text NOT NULL,
    word_length integer NOT NULL,
    available boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone
);
CREATE TABLE public.private_match_invites (
    code text NOT NULL,
    host_id uuid NOT NULL,
    word_length integer,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.rank_season_results (
    season_id integer NOT NULL,
    user_id uuid NOT NULL,
    peak_points integer NOT NULL,
    final_points integer NOT NULL,
    final_tier text NOT NULL,
    rewarded boolean DEFAULT false NOT NULL
);
CREATE TABLE public.rank_seasons (
    id integer NOT NULL,
    name text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    soft_reset_delta integer DEFAULT 200 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.rank_seasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.rank_seasons_id_seq OWNED BY public.rank_seasons.id;
CREATE TABLE public.user_cosmetics (
    user_id uuid NOT NULL,
    cosmetic_id text NOT NULL,
    acquired_via text DEFAULT 'purchase'::text NOT NULL,
    acquired_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    auth_provider text NOT NULL,
    auth_subject text NOT NULL,
    email text,
    password_hash text,
    rank_points integer DEFAULT 1000 NOT NULL,
    rank_tier text DEFAULT 'stone'::text NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    win_streak integer DEFAULT 0 NOT NULL,
    best_streak integer DEFAULT 0 NOT NULL,
    equipped_board_theme text,
    equipped_victory_anim text,
    equipped_avatar text,
    equipped_nameplate text,
    equipped_profile_border text,
    battle_pass_xp integer DEFAULT 0 NOT NULL,
    battle_pass_premium boolean DEFAULT false NOT NULL,
    battle_pass_season integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ads_removed boolean DEFAULT false NOT NULL,
    powerup_reveal integer DEFAULT 0 NOT NULL,
    powerup_scramble integer DEFAULT 0 NOT NULL,
    powerup_lock integer DEFAULT 0 NOT NULL,
    last_daily_ad_at timestamp with time zone,
    xp_boost_ads_today integer DEFAULT 0 NOT NULL,
    xp_boost_ads_day date,
    coins integer DEFAULT 0 NOT NULL,
    hint_credits integer DEFAULT 0 NOT NULL,
    play_streak integer DEFAULT 0 NOT NULL,
    play_streak_best integer DEFAULT 0 NOT NULL,
    last_play_date date,
    lifetime_hints_used integer DEFAULT 0 NOT NULL,
    settings jsonb DEFAULT '{"sound": true, "haptics": true, "colorBlindMode": false}'::jsonb NOT NULL,
    last_rank_season_reset_id integer,
    CONSTRAINT users_auth_provider_check CHECK ((auth_provider = ANY (ARRAY['anonymous'::text, 'email'::text, 'google'::text, 'apple'::text])))
);
CREATE TABLE public.word_bank (
    word text NOT NULL,
    length integer NOT NULL,
    difficulty integer DEFAULT 3 NOT NULL,
    CONSTRAINT word_bank_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 5)))
);
ALTER TABLE ONLY public.rank_seasons ALTER COLUMN id SET DEFAULT nextval('public.rank_seasons_id_seq'::regclass);
ALTER TABLE ONLY public.ad_rewards
    ADD CONSTRAINT ad_rewards_pkey PRIMARY KEY (transaction_id);
ALTER TABLE ONLY public.battle_pass_claims
    ADD CONSTRAINT battle_pass_claims_pkey PRIMARY KEY (user_id, season_number, tier, track);
ALTER TABLE ONLY public.battle_pass_rewards
    ADD CONSTRAINT battle_pass_rewards_pkey PRIMARY KEY (season_number, tier, track);
ALTER TABLE ONLY public.battle_pass_seasons
    ADD CONSTRAINT battle_pass_seasons_pkey PRIMARY KEY (season_number);
ALTER TABLE ONLY public.coin_grants
    ADD CONSTRAINT coin_grants_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cosmetics
    ADD CONSTRAINT cosmetics_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.daily_challenge_attempts
    ADD CONSTRAINT daily_challenge_attempts_pkey PRIMARY KEY (challenge_date, user_id);
ALTER TABLE ONLY public.daily_challenges
    ADD CONSTRAINT daily_challenges_pkey PRIMARY KEY (challenge_date);
ALTER TABLE ONLY public.daily_words
    ADD CONSTRAINT daily_words_pkey PRIMARY KEY (day);
ALTER TABLE ONLY public.friend_invite_codes
    ADD CONSTRAINT friend_invite_codes_pkey PRIMARY KEY (code);
ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (user_id, friend_id);
ALTER TABLE ONLY public.guesses
    ADD CONSTRAINT guesses_match_id_player_id_key UNIQUE (match_id, player_id);
ALTER TABLE ONLY public.guesses
    ADD CONSTRAINT guesses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.hint_uses
    ADD CONSTRAINT hint_uses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.leaderboard_entries
    ADD CONSTRAINT leaderboard_entries_pkey PRIMARY KEY (period, bucket, mode, user_id);
ALTER TABLE ONLY public.match_replays
    ADD CONSTRAINT match_replays_pkey PRIMARY KEY (match_id);
ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.mystery_submissions
    ADD CONSTRAINT mystery_submissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.private_match_invites
    ADD CONSTRAINT private_match_invites_pkey PRIMARY KEY (code);
ALTER TABLE ONLY public.rank_season_results
    ADD CONSTRAINT rank_season_results_pkey PRIMARY KEY (season_id, user_id);
ALTER TABLE ONLY public.rank_seasons
    ADD CONSTRAINT rank_seasons_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_cosmetics
    ADD CONSTRAINT user_cosmetics_pkey PRIMARY KEY (user_id, cosmetic_id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_auth_provider_auth_subject_key UNIQUE (auth_provider, auth_subject);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE ONLY public.word_bank
    ADD CONSTRAINT word_bank_pkey PRIMARY KEY (word);
CREATE INDEX idx_ad_rewards_user_kind ON public.ad_rewards USING btree (user_id, reward_kind, created_at DESC);
CREATE INDEX idx_coin_grants_user ON public.coin_grants USING btree (user_id, created_at DESC);
CREATE INDEX idx_daily_attempts_solved ON public.daily_challenge_attempts USING btree (challenge_date, solved, guess_count, duration_ms);
CREATE INDEX idx_friend_codes_user ON public.friend_invite_codes USING btree (user_id);
CREATE INDEX idx_friendships_status ON public.friendships USING btree (status);
CREATE INDEX idx_hint_uses_user ON public.hint_uses USING btree (user_id, used_at DESC);
CREATE INDEX idx_lb_period_mode_wins ON public.leaderboard_entries USING btree (period, bucket, mode, wins DESC, rank_points DESC);
CREATE INDEX idx_leaderboard_score ON public.leaderboard_entries USING btree (period, bucket, wins DESC, rank_points DESC);
CREATE INDEX idx_matches_player1 ON public.matches USING btree (player1_id, started_at DESC);
CREATE INDEX idx_matches_player2 ON public.matches USING btree (player2_id, started_at DESC);
CREATE INDEX idx_matches_word ON public.matches USING btree (word);
CREATE INDEX idx_mystery_avail ON public.mystery_submissions USING btree (available, word_length, created_at) WHERE (available = true);
CREATE INDEX idx_mystery_user_avail ON public.mystery_submissions USING btree (user_id, available);
CREATE INDEX idx_replays_user ON public.match_replays USING btree (p1_user_id, created_at DESC);
CREATE INDEX idx_replays_user2 ON public.match_replays USING btree (p2_user_id, created_at DESC);
CREATE INDEX idx_users_rank_points ON public.users USING btree (rank_points DESC);
CREATE INDEX idx_word_bank_length_diff ON public.word_bank USING btree (length, difficulty);
ALTER TABLE ONLY public.ad_rewards
    ADD CONSTRAINT ad_rewards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.battle_pass_claims
    ADD CONSTRAINT battle_pass_claims_season_number_fkey FOREIGN KEY (season_number) REFERENCES public.battle_pass_seasons(season_number) ON DELETE CASCADE;
ALTER TABLE ONLY public.battle_pass_claims
    ADD CONSTRAINT battle_pass_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.battle_pass_rewards
    ADD CONSTRAINT battle_pass_rewards_cosmetic_id_fkey FOREIGN KEY (cosmetic_id) REFERENCES public.cosmetics(id);
ALTER TABLE ONLY public.battle_pass_rewards
    ADD CONSTRAINT battle_pass_rewards_season_number_fkey FOREIGN KEY (season_number) REFERENCES public.battle_pass_seasons(season_number) ON DELETE CASCADE;
ALTER TABLE ONLY public.coin_grants
    ADD CONSTRAINT coin_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.daily_challenge_attempts
    ADD CONSTRAINT daily_challenge_attempts_challenge_date_fkey FOREIGN KEY (challenge_date) REFERENCES public.daily_challenges(challenge_date) ON DELETE CASCADE;
ALTER TABLE ONLY public.daily_challenge_attempts
    ADD CONSTRAINT daily_challenge_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.friend_invite_codes
    ADD CONSTRAINT friend_invite_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.guesses
    ADD CONSTRAINT guesses_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.guesses
    ADD CONSTRAINT guesses_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.hint_uses
    ADD CONSTRAINT hint_uses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.leaderboard_entries
    ADD CONSTRAINT leaderboard_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.match_replays
    ADD CONSTRAINT match_replays_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_player1_id_fkey FOREIGN KEY (player1_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_player2_id_fkey FOREIGN KEY (player2_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.mystery_submissions
    ADD CONSTRAINT mystery_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.private_match_invites
    ADD CONSTRAINT private_match_invites_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.rank_season_results
    ADD CONSTRAINT rank_season_results_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.rank_seasons(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.rank_season_results
    ADD CONSTRAINT rank_season_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_cosmetics
    ADD CONSTRAINT user_cosmetics_cosmetic_id_fkey FOREIGN KEY (cosmetic_id) REFERENCES public.cosmetics(id);
ALTER TABLE ONLY public.user_cosmetics
    ADD CONSTRAINT user_cosmetics_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_last_rank_season_reset_id_fkey FOREIGN KEY (last_rank_season_reset_id) REFERENCES public.rank_seasons(id);
