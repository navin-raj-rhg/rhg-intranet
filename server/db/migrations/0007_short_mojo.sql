CREATE TABLE "inspection_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inspection_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_no" text NOT NULL,
	"description" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_report_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inspection_report_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"report_id" integer NOT NULL,
	"product_no" text NOT NULL,
	"description" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspection_products" ADD CONSTRAINT "inspection_products_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_report_products" ADD CONSTRAINT "inspection_report_products_report_id_inspection_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."inspection_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inspection_products_no_ci_unique" ON "inspection_products" USING btree (lower("product_no"));--> statement-breakpoint
CREATE INDEX "inspection_report_products_report_idx" ON "inspection_report_products" USING btree ("report_id");--> statement-breakpoint
-- Carry over the single product number each existing report had (no description was recorded).
INSERT INTO "inspection_report_products" ("report_id", "product_no", "sort_order")
SELECT "id", btrim("product_no"), 0 FROM "inspection_reports" WHERE "product_no" IS NOT NULL AND btrim("product_no") <> '';
