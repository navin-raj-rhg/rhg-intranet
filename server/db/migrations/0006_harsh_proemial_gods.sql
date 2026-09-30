CREATE TYPE "public"."inspection_event_action" AS ENUM('created', 'submitted', 'returned', 'closed');--> statement-breakpoint
CREATE TYPE "public"."inspection_location_type" AS ENUM('supplier', 'dc');--> statement-breakpoint
CREATE TYPE "public"."inspection_overall" AS ENUM('pass', 'pass_with_conditions', 'fail');--> statement-breakpoint
CREATE TYPE "public"."inspection_point_result" AS ENUM('compliant', 'non_conformance', 'na');--> statement-breakpoint
CREATE TYPE "public"."inspection_severity" AS ENUM('minor', 'major');--> statement-breakpoint
CREATE TYPE "public"."inspection_status" AS ENUM('draft', 'in_review', 'closed');--> statement-breakpoint
CREATE TABLE "inspection_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inspection_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"report_id" integer NOT NULL,
	"action" "inspection_event_action" NOT NULL,
	"actor_id" uuid NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_locations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inspection_locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "inspection_location_type" NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_photos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inspection_photos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"report_point_id" integer NOT NULL,
	"r2_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_report_points" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inspection_report_points_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"report_id" integer NOT NULL,
	"section_name" text NOT NULL,
	"section_order" integer NOT NULL,
	"point_text" text NOT NULL,
	"point_order" integer NOT NULL,
	"result" "inspection_point_result",
	"severity" "inspection_severity",
	"comment" text,
	CONSTRAINT "inspection_report_points_severity_only_nc" CHECK ("inspection_report_points"."severity" is null or "inspection_report_points"."result" = 'non_conformance')
);
--> statement-breakpoint
CREATE TABLE "inspection_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inspection_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"status" "inspection_status" DEFAULT 'draft' NOT NULL,
	"location_id" integer,
	"location_type" "inspection_location_type" NOT NULL,
	"location_name" text NOT NULL,
	"template_id" integer,
	"template_name" text NOT NULL,
	"product_no" text,
	"reference" text,
	"inspection_date" date NOT NULL,
	"notes" text,
	"overall" "inspection_overall",
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_reports_closed_has_overall" CHECK ("inspection_reports"."status" <> 'closed' or "inspection_reports"."overall" is not null)
);
--> statement-breakpoint
CREATE TABLE "inspection_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inspection_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"sections" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspection_events" ADD CONSTRAINT "inspection_events_report_id_inspection_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."inspection_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_events" ADD CONSTRAINT "inspection_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_report_point_id_inspection_report_points_id_fk" FOREIGN KEY ("report_point_id") REFERENCES "public"."inspection_report_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_report_points" ADD CONSTRAINT "inspection_report_points_report_id_inspection_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."inspection_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_location_id_inspection_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inspection_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_template_id_inspection_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspection_events_report_idx" ON "inspection_events" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inspection_locations_type_name_ci_unique" ON "inspection_locations" USING btree ("type",lower("name"));--> statement-breakpoint
CREATE INDEX "inspection_photos_point_idx" ON "inspection_photos" USING btree ("report_point_id");--> statement-breakpoint
CREATE INDEX "inspection_report_points_report_idx" ON "inspection_report_points" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "inspection_reports_created_at_idx" ON "inspection_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inspection_reports_status_idx" ON "inspection_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "inspection_templates_name_ci_unique" ON "inspection_templates" USING btree (lower("name"));