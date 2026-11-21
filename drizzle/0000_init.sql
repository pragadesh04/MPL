CREATE TYPE "public"."acquired_via" AS ENUM('AUCTION', 'AUTO_ALLOCATED', 'RANDOM_SQUAD', 'ADMIN_PICK');--> statement-breakpoint
CREATE TYPE "public"."join_request_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."join_source" AS ENUM('ADDED_BY_ORGANISER', 'ORGANISER_KEY', 'PLAYER_ID_REQUEST');--> statement-breakpoint
CREATE TYPE "public"."leader_approval" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."leader_invite_status" AS ENUM('NOT_OPENED', 'OPENED', 'ACCOUNT_LINKED', 'TEAM_READY');--> statement-breakpoint
CREATE TYPE "public"."match_stage" AS ENUM('GROUP', 'KNOCKOUT', 'THIRD_PLACE');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('SCHEDULED', 'LIVE', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('OWNER', 'CO_ADMIN', 'AUCTIONEER');--> statement-breakpoint
CREATE TYPE "public"."participant_kind" AS ENUM('LEADER', 'PLAYER');--> statement-breakpoint
CREATE TYPE "public"."player_invite_status" AS ENUM('NOT_OPENED', 'OPENED', 'ACCOUNT_LINKED');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('PENDING_APPROVAL', 'REJECTED', 'POOL', 'ON_BLOCK', 'SOLD', 'UNSOLD', 'ALLOCATED');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('DRAFT', 'READY', 'AUCTION_LIVE', 'AUCTION_PAUSED', 'ALLOCATION', 'GROUP_DRAW', 'GROUP_STAGE', 'KNOCKOUT', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."webhook_kind" AS ENUM('DISCORD', 'GENERIC');--> statement-breakpoint
CREATE TABLE "auction_state" (
	"tournament_id" uuid PRIMARY KEY NOT NULL,
	"current_player_id" uuid,
	"current_bid" integer,
	"current_team_id" uuid,
	"ends_at" timestamp with time zone,
	"next_at" timestamp with time zone,
	"round" integer DEFAULT 1 NOT NULL,
	"paused_remaining_ms" integer,
	"controller_user_id" uuid,
	"last_result" jsonb,
	"version" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tournament_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"round" integer NOT NULL,
	"entered_by" uuid,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bids_amount_ck" CHECK ("bids"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "group_teams" (
	"group_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL,
	"pot" integer,
	CONSTRAINT "group_teams_group_id_team_id_pk" PRIMARY KEY("group_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"role" "participant_kind" NOT NULL,
	"purse" integer,
	"base_price" integer,
	"status" "join_request_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "join_requests_amount_ck" CHECK (("join_requests"."role" = 'LEADER' AND "join_requests"."purse" IS NOT NULL AND "join_requests"."purse" >= 0)
        OR ("join_requests"."role" = 'PLAYER' AND "join_requests"."base_price" IS NOT NULL AND "join_requests"."base_price" >= 0))
);
--> statement-breakpoint
CREATE TABLE "leaders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"ign" text,
	"phone" text,
	"photo_url" text,
	"source" "join_source" NOT NULL,
	"approval" "leader_approval" DEFAULT 'PENDING' NOT NULL,
	"reject_reason" text,
	"purse_total" integer DEFAULT 0 NOT NULL,
	"purse_remaining" integer DEFAULT 0 NOT NULL,
	"link_version" integer DEFAULT 1 NOT NULL,
	"invite_status" "leader_invite_status" DEFAULT 'NOT_OPENED' NOT NULL,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaders_purse_ck" CHECK ("leaders"."purse_remaining" BETWEEN 0 AND "leaders"."purse_total")
);
--> statement-breakpoint
CREATE TABLE "match_games" (
	"match_id" uuid NOT NULL,
	"game_no" integer NOT NULL,
	"map" text,
	"kills_a" integer NOT NULL,
	"kills_b" integer NOT NULL,
	"winner_team_id" uuid,
	CONSTRAINT "match_games_match_id_game_no_pk" PRIMARY KEY("match_id","game_no"),
	CONSTRAINT "match_games_kills_ck" CHECK ("match_games"."kills_a" >= 0 AND "match_games"."kills_b" >= 0),
	CONSTRAINT "match_games_no_tie_ck" CHECK ("match_games"."kills_a" <> "match_games"."kills_b")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"match_number" integer,
	"stage" "match_stage" NOT NULL,
	"group_id" uuid,
	"matchday" integer,
	"round" integer,
	"slot" integer,
	"team_a_id" uuid,
	"team_b_id" uuid,
	"source_a" jsonb,
	"source_b" jsonb,
	"best_of" integer DEFAULT 1 NOT NULL,
	"winner_team_id" uuid,
	"next_match_id" uuid,
	"next_slot" text,
	"is_bye" boolean DEFAULT false NOT NULL,
	"status" "match_status" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_next_slot_ck" CHECK ("matches"."next_slot" IS NULL OR "matches"."next_slot" IN ('A', 'B')),
	CONSTRAINT "matches_bye_number_ck" CHECK (NOT "matches"."is_bye" OR "matches"."match_number" IS NULL),
	CONSTRAINT "matches_best_of_ck" CHECK ("matches"."best_of" IN (1, 3, 5, 7)),
	CONSTRAINT "matches_group_stage_ck" CHECK (("matches"."stage" = 'GROUP') = ("matches"."group_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"tournament_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_tournament_id_user_id_pk" PRIMARY KEY("tournament_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organiser_blocks" (
	"player_user_id" uuid NOT NULL,
	"organiser_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organiser_blocks_player_user_id_organiser_user_id_pk" PRIMARY KEY("player_user_id","organiser_user_id")
);
--> statement-breakpoint
CREATE TABLE "organiser_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"email_or_username" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "organiser_invites_role_ck" CHECK ("organiser_invites"."role" <> 'OWNER')
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"mvp" boolean DEFAULT false NOT NULL,
	CONSTRAINT "player_stats_match_id_player_id_pk" PRIMARY KEY("match_id","player_id"),
	CONSTRAINT "player_stats_ck" CHECK ("player_stats"."kills" >= 0 AND "player_stats"."deaths" >= 0)
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"ign" text,
	"phone" text,
	"photo_url" text,
	"source" "join_source" NOT NULL,
	"link_version" integer DEFAULT 1 NOT NULL,
	"invite_status" "player_invite_status" DEFAULT 'NOT_OPENED' NOT NULL,
	"last_activity_at" timestamp with time zone,
	"base_price" integer DEFAULT 0 NOT NULL,
	"status" "player_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"reject_reason" text,
	"team_id" uuid,
	"sold_price" integer,
	"acquired_via" "acquired_via",
	"auction_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_base_price_ck" CHECK ("players"."base_price" >= 0),
	CONSTRAINT "players_sold_price_ck" CHECK ("players"."sold_price" IS NULL OR "players"."sold_price" >= 0),
	CONSTRAINT "players_squad_ck" CHECK (("players"."status" IN ('SOLD', 'ALLOCATED')) = ("players"."team_id" IS NOT NULL)),
	CONSTRAINT "players_squad_fields_ck" CHECK ("players"."team_id" IS NULL OR ("players"."sold_price" IS NOT NULL AND "players"."acquired_via" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "processed_commands" (
	"command_id" text PRIMARY KEY NOT NULL,
	"tournament_id" uuid NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"leader_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"color" text NOT NULL,
	"secondary_color" text,
	"logo_url" text,
	"emoji" text,
	"motto" text,
	"seed" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_color_ck" CHECK ("teams"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "teams_secondary_color_ck" CHECK ("teams"."secondary_color" IS NULL OR "teams"."secondary_color" ~ '^#[0-9a-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"status" "tournament_status" DEFAULT 'DRAFT' NOT NULL,
	"settings" jsonb NOT NULL,
	"live_code" text NOT NULL,
	"live_screen_enabled" boolean DEFAULT true NOT NULL,
	"registration_open" boolean DEFAULT true NOT NULL,
	"max_registrations" integer,
	"announcement" text,
	"roster_version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "tournaments_max_registrations_ck" CHECK ("tournaments"."max_registrations" IS NULL OR "tournaments"."max_registrations" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"ign" text,
	"phone" text,
	"photo_url" text,
	"is_organiser" boolean DEFAULT false NOT NULL,
	"email" text,
	"player_code" text NOT NULL,
	"organiser_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_organiser_fields_ck" CHECK (NOT "users"."is_organiser" OR ("users"."email" IS NOT NULL AND "users"."organiser_key" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"kind" "webhook_kind" NOT NULL,
	"url_encrypted" text NOT NULL,
	"signing_secret_encrypted" text,
	"events" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auction_state" ADD CONSTRAINT "auction_state_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_state" ADD CONSTRAINT "auction_state_current_player_id_players_id_fk" FOREIGN KEY ("current_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_state" ADD CONSTRAINT "auction_state_current_team_id_teams_id_fk" FOREIGN KEY ("current_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_state" ADD CONSTRAINT "auction_state_controller_user_id_users_id_fk" FOREIGN KEY ("controller_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_teams" ADD CONSTRAINT "group_teams_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_teams" ADD CONSTRAINT "group_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_teams" ADD CONSTRAINT "group_teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaders" ADD CONSTRAINT "leaders_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaders" ADD CONSTRAINT "leaders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_a_id_teams_id_fk" FOREIGN KEY ("team_a_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_b_id_teams_id_fk" FOREIGN KEY ("team_b_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_next_match_id_matches_id_fk" FOREIGN KEY ("next_match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organiser_blocks" ADD CONSTRAINT "organiser_blocks_player_user_id_users_id_fk" FOREIGN KEY ("player_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organiser_blocks" ADD CONSTRAINT "organiser_blocks_organiser_user_id_users_id_fk" FOREIGN KEY ("organiser_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organiser_invites" ADD CONSTRAINT "organiser_invites_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organiser_invites" ADD CONSTRAINT "organiser_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organiser_invites" ADD CONSTRAINT "organiser_invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_commands" ADD CONSTRAINT "processed_commands_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_leader_id_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."leaders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_tournament_created_idx" ON "audit_log" USING btree ("tournament_id","created_at");--> statement-breakpoint
CREATE INDEX "bids_tournament_player_idx" ON "bids" USING btree ("tournament_id","player_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_teams_tournament_team_uq" ON "group_teams" USING btree ("tournament_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_tournament_name_uq" ON "groups" USING btree ("tournament_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "join_requests_one_pending_uq" ON "join_requests" USING btree ("tournament_id","to_user_id") WHERE "join_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "join_requests_to_user_idx" ON "join_requests" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE INDEX "join_requests_from_user_created_idx" ON "join_requests" USING btree ("from_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leaders_tournament_user_uq" ON "leaders" USING btree ("tournament_id","user_id");--> statement-breakpoint
CREATE INDEX "leaders_tournament_idx" ON "leaders" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_tournament_number_uq" ON "matches" USING btree ("tournament_id","match_number");--> statement-breakpoint
CREATE INDEX "matches_tournament_stage_idx" ON "matches" USING btree ("tournament_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_owner_uq" ON "memberships" USING btree ("tournament_id") WHERE "memberships"."role" = 'OWNER';--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organiser_invites_token_hash_uq" ON "organiser_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "organiser_invites_tournament_idx" ON "organiser_invites" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_hash_uq" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "players_tournament_user_uq" ON "players" USING btree ("tournament_id","user_id");--> statement-breakpoint
CREATE INDEX "players_tournament_status_idx" ON "players" USING btree ("tournament_id","status");--> statement-breakpoint
CREATE INDEX "players_team_idx" ON "players" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_leader_uq" ON "teams" USING btree ("leader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_tournament_name_uq" ON "teams" USING btree ("tournament_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "teams_tournament_short_name_uq" ON "teams" USING btree ("tournament_id",upper("short_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "teams_tournament_color_uq" ON "teams" USING btree ("tournament_id","color");--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_one_active_per_owner_uq" ON "tournaments" USING btree ("owner_id") WHERE "tournaments"."status" NOT IN ('COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_live_code_uq" ON "tournaments" USING btree ("live_code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uq" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_player_code_uq" ON "users" USING btree ("player_code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_organiser_key_uq" ON "users" USING btree ("organiser_key");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_created_idx" ON "webhook_deliveries" USING btree ("webhook_id","created_at");--> statement-breakpoint
CREATE INDEX "webhooks_tournament_idx" ON "webhooks" USING btree ("tournament_id");