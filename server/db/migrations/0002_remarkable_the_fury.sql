CREATE TABLE "tool_manager_links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tool_manager_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tool_id" text NOT NULL,
	"employee_id" uuid NOT NULL,
	"manager_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_manager_links_tool_employee_manager_unique" UNIQUE("tool_id","employee_id","manager_id"),
	CONSTRAINT "tool_manager_links_no_self_manage" CHECK ("tool_manager_links"."employee_id" <> "tool_manager_links"."manager_id")
);
--> statement-breakpoint
ALTER TABLE "user_tool_roles" DROP CONSTRAINT "user_tool_roles_user_id_tool_id_unique";--> statement-breakpoint
ALTER TABLE "tool_manager_links" ADD CONSTRAINT "tool_manager_links_tool_id_tool_registry_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_manager_links" ADD CONSTRAINT "tool_manager_links_employee_id_profiles_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_manager_links" ADD CONSTRAINT "tool_manager_links_manager_id_profiles_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tool_roles" ADD CONSTRAINT "user_tool_roles_user_id_tool_id_role_key_unique" UNIQUE("user_id","tool_id","role_key");