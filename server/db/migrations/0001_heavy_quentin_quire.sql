CREATE TYPE "public"."expense_category" AS ENUM('travel_national', 'travel_international', 'parking', 'staff_wellness_day', 'office_refreshments_amenities', 'medical_claim', 'entertainment');--> statement-breakpoint
CREATE TYPE "public"."expense_claim_status" AS ENUM('submitted', 'approved', 'paid');--> statement-breakpoint
CREATE TABLE "expense_claims" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expense_claims_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employee_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text NOT NULL,
	"expense_date" date NOT NULL,
	"receipt_key" text NOT NULL,
	"status" "expense_claim_status" DEFAULT 'submitted' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"paid_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_payout_batches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expense_payout_batches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_by" uuid NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claim_count" integer NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"pdf_key" text
);
--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_employee_id_profiles_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_paid_batch_id_expense_payout_batches_id_fk" FOREIGN KEY ("paid_batch_id") REFERENCES "public"."expense_payout_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payout_batches" ADD CONSTRAINT "expense_payout_batches_run_by_profiles_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;