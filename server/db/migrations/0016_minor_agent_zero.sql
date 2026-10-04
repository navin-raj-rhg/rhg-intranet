CREATE TABLE "dashboard_goal_rows" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dashboard_goal_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"goal" text NOT NULL,
	"period" text NOT NULL,
	"target" numeric(16, 2) NOT NULL,
	"actual" numeric(16, 2) NOT NULL,
	"unit" text
);
--> statement-breakpoint
CREATE TABLE "dashboard_sales_rows" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dashboard_sales_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"customer" text,
	"category" text,
	"state" text,
	"amount" numeric(14, 2) NOT NULL,
	"quantity" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "dashboard_uploads" (
	"kind" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"row_count" integer NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_uploads" ADD CONSTRAINT "dashboard_uploads_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_goal_rows_goal_period" ON "dashboard_goal_rows" USING btree (lower("goal"),"period");--> statement-breakpoint
CREATE INDEX "dashboard_sales_rows_date_idx" ON "dashboard_sales_rows" USING btree ("date");