CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"is_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"route" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_roles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tool_roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tool_id" text NOT NULL,
	"role_key" text NOT NULL,
	"role_label" text NOT NULL,
	CONSTRAINT "tool_roles_tool_id_role_key_unique" UNIQUE("tool_id","role_key")
);
--> statement-breakpoint
CREATE TABLE "user_tool_roles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_tool_roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"tool_id" text NOT NULL,
	"role_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_tool_roles_user_id_tool_id_unique" UNIQUE("user_id","tool_id")
);
--> statement-breakpoint
ALTER TABLE "tool_roles" ADD CONSTRAINT "tool_roles_tool_id_tool_registry_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tool_roles" ADD CONSTRAINT "user_tool_roles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tool_roles" ADD CONSTRAINT "user_tool_roles_tool_id_tool_registry_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tool_roles" ADD CONSTRAINT "user_tool_roles_tool_role_fk" FOREIGN KEY ("tool_id","role_key") REFERENCES "public"."tool_roles"("tool_id","role_key") ON DELETE no action ON UPDATE no action;