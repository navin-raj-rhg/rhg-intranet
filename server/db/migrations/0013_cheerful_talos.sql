CREATE TABLE "project_sections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_sections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "section_name" text;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "section_order" integer DEFAULT 1000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_template_tasks" ADD COLUMN "section_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "project_sections_name_ci_unique" ON "project_sections" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "project_template_tasks" ADD CONSTRAINT "project_template_tasks_section_id_project_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."project_sections"("id") ON DELETE set null ON UPDATE no action;