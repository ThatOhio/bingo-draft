-- Simplify UserRole: remove PARTICIPANT and CAPTAIN, replace with USER.
-- Map existing PARTICIPANT and CAPTAIN to USER; ADMIN stays ADMIN.

-- Create new enum with USER and ADMIN only
CREATE TYPE "UserRole_new" AS ENUM ('USER', 'ADMIN');

-- Drop default, migrate column to new type, restore default
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE
    WHEN "role"::text IN ('PARTICIPANT', 'CAPTAIN') THEN 'USER'::"UserRole_new"
    WHEN "role"::text = 'ADMIN' THEN 'ADMIN'::"UserRole_new"
    ELSE 'USER'::"UserRole_new"
  END
);
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole_new";

-- Replace old enum with new one
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
