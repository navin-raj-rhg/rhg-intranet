CREATE TYPE "public"."leave_application_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_date_restriction" AS ENUM('none', 'birth_month', 'join_month');--> statement-breakpoint
CREATE TABLE "leave_applications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leave_applications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employee_id" uuid NOT NULL,
	"leave_type_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_half_day" boolean DEFAULT false NOT NULL,
	"end_half_day" boolean DEFAULT false NOT NULL,
	"days" numeric(5, 1) NOT NULL,
	"reason" text,
	"attachment_key" text,
	"status" "leave_application_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_applications_dates_ordered" CHECK ("leave_applications"."end_date" >= "leave_applications"."start_date"),
	CONSTRAINT "leave_applications_days_positive" CHECK ("leave_applications"."days" > 0),
	CONSTRAINT "leave_applications_single_day_half" CHECK ("leave_applications"."start_date" <> "leave_applications"."end_date" or "leave_applications"."end_half_day" = false)
);
--> statement-breakpoint
CREATE TABLE "leave_balance_adjustments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leave_balance_adjustments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employee_id" uuid NOT NULL,
	"leave_type_id" integer NOT NULL,
	"cycle_start_year" integer NOT NULL,
	"days" numeric(5, 1) NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_balance_adjustments_days_nonzero" CHECK ("leave_balance_adjustments"."days" <> 0)
);
--> statement-breakpoint
CREATE TABLE "leave_type_entitlements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leave_type_entitlements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"leave_type_id" integer NOT NULL,
	"min_years_service" integer DEFAULT 0 NOT NULL,
	"days" numeric(5, 1) NOT NULL,
	CONSTRAINT "leave_type_entitlements_type_years_unique" UNIQUE("leave_type_id","min_years_service"),
	CONSTRAINT "leave_type_entitlements_years_nonneg" CHECK ("leave_type_entitlements"."min_years_service" >= 0),
	CONSTRAINT "leave_type_entitlements_days_nonneg" CHECK ("leave_type_entitlements"."days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leave_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"cycle_start_month" integer DEFAULT 1 NOT NULL,
	"has_balance" boolean DEFAULT true NOT NULL,
	"date_restriction" "leave_date_restriction" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_key_unique" UNIQUE("key"),
	CONSTRAINT "leave_types_cycle_start_month_range" CHECK ("leave_types"."cycle_start_month" between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "join_date" date;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_employee_id_profiles_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "leave_balance_adjustments_employee_id_profiles_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "leave_balance_adjustments_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "leave_balance_adjustments_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_type_entitlements" ADD CONSTRAINT "leave_type_entitlements_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;