-- Drop department FK and the column
ALTER TABLE "QRCode" DROP CONSTRAINT IF EXISTS "QRCode_departmentId_fkey";
ALTER TABLE "QRCode" DROP COLUMN "departmentId";

-- Drop token unique index and the column
DROP INDEX IF EXISTS "QRCode_token_key";
ALTER TABLE "QRCode" DROP COLUMN "token";
