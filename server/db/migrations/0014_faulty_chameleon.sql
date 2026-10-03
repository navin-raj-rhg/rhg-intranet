CREATE TYPE "public"."pim_attribute_type" AS ENUM('text', 'number', 'yesno', 'list');--> statement-breakpoint
CREATE TYPE "public"."pim_file_kind" AS ENUM('image', 'document');--> statement-breakpoint
CREATE TYPE "public"."pim_packaging_level" AS ENUM('carton', 'outer', 'pallet');--> statement-breakpoint
CREATE TYPE "public"."pim_product_status" AS ENUM('draft', 'active', 'discontinued');--> statement-breakpoint
CREATE TABLE "pim_attribute_values" (
	"product_id" integer NOT NULL,
	"attribute_id" integer NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "pim_attribute_values_product_id_attribute_id_pk" PRIMARY KEY("product_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "pim_attributes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pim_attributes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" "pim_attribute_type" NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pim_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pim_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parent_id" integer,
	"name" text NOT NULL,
	"required_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pim_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pim_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"kind" "pim_file_kind" NOT NULL,
	"r2_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pim_files_main_is_image" CHECK (not "pim_files"."is_main" or "pim_files"."kind" = 'image')
);
--> statement-breakpoint
CREATE TABLE "pim_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pim_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"changed_by" uuid,
	"summary" text NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pim_packaging" (
	"product_id" integer NOT NULL,
	"level" "pim_packaging_level" NOT NULL,
	"length_cm" numeric(10, 2),
	"width_cm" numeric(10, 2),
	"height_cm" numeric(10, 2),
	"weight_kg" numeric(10, 3),
	"qty_inside" integer,
	CONSTRAINT "pim_packaging_product_id_level_pk" PRIMARY KEY("product_id","level"),
	CONSTRAINT "pim_packaging_positive" CHECK (coalesce("pim_packaging"."length_cm", 1) > 0 and coalesce("pim_packaging"."width_cm", 1) > 0 and coalesce("pim_packaging"."height_cm", 1) > 0 and coalesce("pim_packaging"."weight_kg", 1) > 0 and coalesce("pim_packaging"."qty_inside", 1) >= 1)
);
--> statement-breakpoint
CREATE TABLE "pim_product_suppliers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pim_product_suppliers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"supplier_code" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pim_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pim_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_no" text NOT NULL,
	"name" text NOT NULL,
	"status" "pim_product_status" DEFAULT 'draft' NOT NULL,
	"brand" text,
	"category_id" integer,
	"sub_category_id" integer,
	"short_description" text,
	"long_description" text,
	"barcode" text,
	"rrp" numeric(12, 2),
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pim_attribute_values" ADD CONSTRAINT "pim_attribute_values_product_id_pim_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."pim_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_attribute_values" ADD CONSTRAINT "pim_attribute_values_attribute_id_pim_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."pim_attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_attributes" ADD CONSTRAINT "pim_attributes_category_id_pim_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."pim_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_categories" ADD CONSTRAINT "pim_categories_parent_id_pim_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pim_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_files" ADD CONSTRAINT "pim_files_product_id_pim_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."pim_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_files" ADD CONSTRAINT "pim_files_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_history" ADD CONSTRAINT "pim_history_product_id_pim_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."pim_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_history" ADD CONSTRAINT "pim_history_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_packaging" ADD CONSTRAINT "pim_packaging_product_id_pim_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."pim_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_product_suppliers" ADD CONSTRAINT "pim_product_suppliers_product_id_pim_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."pim_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_products" ADD CONSTRAINT "pim_products_category_id_pim_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."pim_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_products" ADD CONSTRAINT "pim_products_sub_category_id_pim_categories_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."pim_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_products" ADD CONSTRAINT "pim_products_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pim_products" ADD CONSTRAINT "pim_products_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pim_attributes_name_ci_unique" ON "pim_attributes" USING btree ("category_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "pim_categories_name_ci_unique" ON "pim_categories" USING btree (coalesce("parent_id", 0),lower("name"));--> statement-breakpoint
CREATE INDEX "pim_files_product_idx" ON "pim_files" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pim_files_one_main" ON "pim_files" USING btree ("product_id") WHERE "pim_files"."is_main";--> statement-breakpoint
CREATE INDEX "pim_history_product_idx" ON "pim_history" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pim_product_suppliers_name_ci_unique" ON "pim_product_suppliers" USING btree ("product_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "pim_product_suppliers_one_primary" ON "pim_product_suppliers" USING btree ("product_id") WHERE "pim_product_suppliers"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "pim_products_product_no_ci_unique" ON "pim_products" USING btree (lower("product_no"));--> statement-breakpoint
CREATE INDEX "pim_products_category_idx" ON "pim_products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "pim_products_status_idx" ON "pim_products" USING btree ("status");