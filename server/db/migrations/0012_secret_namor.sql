CREATE TYPE "public"."project_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."project_task_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TABLE "project_comments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_comments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"task_id" integer NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"task_id" integer NOT NULL,
	"r2_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project_task_deps" (
	"task_id" integer NOT NULL,
	"depends_on_task_id" integer NOT NULL,
	CONSTRAINT "project_task_deps_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id"),
	CONSTRAINT "project_task_deps_not_self" CHECK ("project_task_deps"."task_id" <> "project_task_deps"."depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"template_task_id" integer,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"status" "project_task_status" DEFAULT 'todo' NOT NULL,
	"lead_time_days" integer DEFAULT 1 NOT NULL,
	"due_date" date,
	"unlocked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_tasks_lead_time_range" CHECK ("project_tasks"."lead_time_days" between 0 and 365),
	CONSTRAINT "project_tasks_done_has_time" CHECK ("project_tasks"."status" <> 'done' or "project_tasks"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "project_template_task_deps" (
	"task_id" integer NOT NULL,
	"depends_on_task_id" integer NOT NULL,
	CONSTRAINT "project_template_task_deps_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id"),
	CONSTRAINT "project_template_task_deps_not_self" CHECK ("project_template_task_deps"."task_id" <> "project_template_task_deps"."depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "project_template_task_types" (
	"task_id" integer NOT NULL,
	"type_id" integer NOT NULL,
	CONSTRAINT "project_template_task_types_task_id_type_id_pk" PRIMARY KEY("task_id","type_id")
);
--> statement-breakpoint
CREATE TABLE "project_template_tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_template_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"description" text,
	"default_assignee_id" uuid,
	"lead_time_days" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_template_tasks_lead_time_range" CHECK ("project_template_tasks"."lead_time_days" between 0 and 365)
);
--> statement-breakpoint
CREATE TABLE "project_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"status" "project_status" DEFAULT 'open' NOT NULL,
	"type_id" integer,
	"type_name" text,
	"start_date" date NOT NULL,
	"target_date" date,
	"products" text,
	"notes" text,
	"owner_id" uuid NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_target_after_start" CHECK ("projects"."target_date" is null or "projects"."target_date" >= "projects"."start_date"),
	CONSTRAINT "projects_closed_has_time" CHECK ("projects"."status" <> 'closed' or "projects"."closed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_deps" ADD CONSTRAINT "project_task_deps_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_deps" ADD CONSTRAINT "project_task_deps_depends_on_task_id_project_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_template_task_id_project_template_tasks_id_fk" FOREIGN KEY ("template_task_id") REFERENCES "public"."project_template_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_completed_by_profiles_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_task_deps" ADD CONSTRAINT "project_template_task_deps_task_id_project_template_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_template_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_task_deps" ADD CONSTRAINT "project_template_task_deps_depends_on_task_id_project_template_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."project_template_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_task_types" ADD CONSTRAINT "project_template_task_types_task_id_project_template_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_template_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_task_types" ADD CONSTRAINT "project_template_task_types_type_id_project_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."project_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_tasks" ADD CONSTRAINT "project_template_tasks_default_assignee_id_profiles_id_fk" FOREIGN KEY ("default_assignee_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_type_id_project_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."project_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_comments_task_idx" ON "project_comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "project_files_task_idx" ON "project_files" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_task_deps_depends_on_idx" ON "project_task_deps" USING btree ("depends_on_task_id");--> statement-breakpoint
CREATE INDEX "project_tasks_project_idx" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_tasks_assignee_idx" ON "project_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_types_name_ci_unique" ON "project_types" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");