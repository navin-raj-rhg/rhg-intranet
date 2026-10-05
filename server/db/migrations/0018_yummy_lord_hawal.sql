CREATE TABLE "leave_holiday_years_synced" (
	"year" integer PRIMARY KEY NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
