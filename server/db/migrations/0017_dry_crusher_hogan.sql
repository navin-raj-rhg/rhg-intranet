CREATE TABLE "user_favourite_tools" (
	"user_id" uuid NOT NULL,
	"tool_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_favourite_tools_user_id_tool_id_pk" PRIMARY KEY("user_id","tool_id")
);
--> statement-breakpoint
ALTER TABLE "user_favourite_tools" ADD CONSTRAINT "user_favourite_tools_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favourite_tools" ADD CONSTRAINT "user_favourite_tools_tool_id_tool_registry_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_registry"("id") ON DELETE cascade ON UPDATE no action;