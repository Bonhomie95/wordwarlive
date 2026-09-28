CREATE TABLE synthetic_config_versions (
 id BIGSERIAL PRIMARY KEY, effective_day DATE NOT NULL, settings JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), actor_id UUID, reason TEXT NOT NULL
);
CREATE TABLE synthetic_days (
 day DATE PRIMARY KEY, version_id BIGINT REFERENCES synthetic_config_versions(id),
 algorithm_version INTEGER NOT NULL DEFAULT 3, payload JSONB NOT NULL,
 real_players INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE synthetic_control (id INTEGER PRIMARY KEY CHECK(id=1), paused BOOLEAN NOT NULL DEFAULT false);
INSERT INTO synthetic_control VALUES (1,false);
CREATE TABLE product_events (
 id BIGSERIAL PRIMARY KEY, user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 event TEXT NOT NULL, offer TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_events_time ON product_events(created_at, event);
CREATE TABLE match_checkpoints (
 id UUID PRIMARY KEY, node_id TEXT NOT NULL, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO synthetic_config_versions(effective_day,settings,reason) VALUES
 ((now() AT TIME ZONE 'UTC')::date+1,'{"population":2500,"dailyMin":30,"dailyMax":60,"rankedMin":60,"rankedMax":240,"dailyCap":9,"difficulty":"medium","realPlayerTarget":500}', 'Initial live operations defaults');
