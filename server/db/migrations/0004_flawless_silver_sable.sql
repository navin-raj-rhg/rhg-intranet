CREATE TYPE "public"."cost_container_size" AS ENUM('c20', 'c40hc');--> statement-breakpoint
CREATE TYPE "public"."cost_currency" AS ENUM('USD', 'CNY');--> statement-breakpoint
CREATE TYPE "public"."cost_port_kind" AS ENUM('origin', 'destination');--> statement-breakpoint
CREATE TABLE "cost_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cost_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_categories_name_not_blank" CHECK (btrim("cost_categories"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "cost_factor_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"usd_to_aud" numeric(12, 6) DEFAULT '0' NOT NULL,
	"cny_to_aud" numeric(12, 6) DEFAULT '0' NOT NULL,
	"container_cbm_20" numeric(6, 2) DEFAULT '28' NOT NULL,
	"container_cbm_40hc" numeric(6, 2) DEFAULT '68' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_factor_settings_single_row" CHECK ("cost_factor_settings"."id" = 1),
	CONSTRAINT "cost_factor_settings_rates_nonneg" CHECK ("cost_factor_settings"."usd_to_aud" >= 0 and "cost_factor_settings"."cny_to_aud" >= 0),
	CONSTRAINT "cost_factor_settings_cbm_positive" CHECK ("cost_factor_settings"."container_cbm_20" > 0 and "cost_factor_settings"."container_cbm_40hc" > 0)
);
--> statement-breakpoint
CREATE TABLE "cost_freight_rates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cost_freight_rates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"origin_port_id" integer NOT NULL,
	"destination_port_id" integer NOT NULL,
	"usd_20" numeric(12, 2) DEFAULT '0' NOT NULL,
	"usd_40hc" numeric(12, 2) DEFAULT '0' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_freight_rates_route_unique" UNIQUE("origin_port_id","destination_port_id"),
	CONSTRAINT "cost_freight_rates_nonneg" CHECK ("cost_freight_rates"."usd_20" >= 0 and "cost_freight_rates"."usd_40hc" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cost_local_costs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cost_local_costs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"destination_port_id" integer NOT NULL,
	"fee_type_id" integer NOT NULL,
	"aud_20" numeric(12, 2) DEFAULT '0' NOT NULL,
	"aud_40hc" numeric(12, 2) DEFAULT '0' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_local_costs_port_fee_unique" UNIQUE("destination_port_id","fee_type_id"),
	CONSTRAINT "cost_local_costs_nonneg" CHECK ("cost_local_costs"."aud_20" >= 0 and "cost_local_costs"."aud_40hc" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cost_local_fee_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cost_local_fee_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cost_local_fee_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "cost_model_rows" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cost_model_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"model_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"product_no" text,
	"description" text,
	"carton_length_cm" numeric(8, 2),
	"carton_width_cm" numeric(8, 2),
	"carton_height_cm" numeric(8, 2),
	"carton_qty" integer,
	"outer_length_cm" numeric(8, 2),
	"outer_width_cm" numeric(8, 2),
	"outer_height_cm" numeric(8, 2),
	"outer_qty" integer,
	"pallet_length_cm" numeric(8, 2),
	"pallet_width_cm" numeric(8, 2),
	"pallet_height_cm" numeric(8, 2),
	"pallet_qty" integer,
	"fob_currency" "cost_currency" DEFAULT 'USD' NOT NULL,
	"fob_price" numeric(14, 4),
	"tooling_cost" numeric(14, 2),
	"duty_percent" numeric(6, 3),
	"buyer_buy_price" numeric(14, 4),
	"rrp_inc_gst" numeric(14, 4),
	"results" jsonb NOT NULL,
	CONSTRAINT "cost_model_rows_duty_range" CHECK ("cost_model_rows"."duty_percent" is null or ("cost_model_rows"."duty_percent" >= 0 and "cost_model_rows"."duty_percent" <= 100))
);
--> statement-breakpoint
CREATE TABLE "cost_models" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cost_models_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"supplier_name" text NOT NULL,
	"category_id" integer NOT NULL,
	"sub_category_id" integer,
	"origin_port_id" integer NOT NULL,
	"container_basis" "cost_container_size" DEFAULT 'c40hc' NOT NULL,
	"factors_snapshot" jsonb NOT NULL,
	"notes" text,
	"duplicated_from_id" integer,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_models_supplier_not_blank" CHECK (btrim("cost_models"."supplier_name") <> '')
);
--> statement-breakpoint
CREATE TABLE "cost_ports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cost_ports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "cost_port_kind" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cost_ports_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cost_sub_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cost_sub_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_sub_categories_name_not_blank" CHECK (btrim("cost_sub_categories"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "cost_categories" ADD CONSTRAINT "cost_categories_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_factor_settings" ADD CONSTRAINT "cost_factor_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_freight_rates" ADD CONSTRAINT "cost_freight_rates_origin_port_id_cost_ports_id_fk" FOREIGN KEY ("origin_port_id") REFERENCES "public"."cost_ports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_freight_rates" ADD CONSTRAINT "cost_freight_rates_destination_port_id_cost_ports_id_fk" FOREIGN KEY ("destination_port_id") REFERENCES "public"."cost_ports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_freight_rates" ADD CONSTRAINT "cost_freight_rates_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_local_costs" ADD CONSTRAINT "cost_local_costs_destination_port_id_cost_ports_id_fk" FOREIGN KEY ("destination_port_id") REFERENCES "public"."cost_ports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_local_costs" ADD CONSTRAINT "cost_local_costs_fee_type_id_cost_local_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."cost_local_fee_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_local_costs" ADD CONSTRAINT "cost_local_costs_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_model_rows" ADD CONSTRAINT "cost_model_rows_model_id_cost_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."cost_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_models" ADD CONSTRAINT "cost_models_category_id_cost_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cost_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_models" ADD CONSTRAINT "cost_models_sub_category_id_cost_sub_categories_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."cost_sub_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_models" ADD CONSTRAINT "cost_models_origin_port_id_cost_ports_id_fk" FOREIGN KEY ("origin_port_id") REFERENCES "public"."cost_ports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_models" ADD CONSTRAINT "cost_models_duplicated_from_id_cost_models_id_fk" FOREIGN KEY ("duplicated_from_id") REFERENCES "public"."cost_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_models" ADD CONSTRAINT "cost_models_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_sub_categories" ADD CONSTRAINT "cost_sub_categories_category_id_cost_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cost_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_sub_categories" ADD CONSTRAINT "cost_sub_categories_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_categories_name_ci_unique" ON "cost_categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "cost_model_rows_model_idx" ON "cost_model_rows" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "cost_models_created_at_idx" ON "cost_models" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_sub_categories_name_ci_unique" ON "cost_sub_categories" USING btree ("category_id",lower("name"));