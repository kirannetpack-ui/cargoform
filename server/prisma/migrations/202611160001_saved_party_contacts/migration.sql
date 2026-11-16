CREATE TYPE "SavedPartyKind" AS ENUM ('EXPORTER', 'CONSIGNEE');

CREATE TABLE "SavedParty" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" "SavedPartyKind" NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedParty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedParty_organisationId_kind_nameKey_key"
ON "SavedParty"("organisationId", "kind", "nameKey");

CREATE INDEX "SavedParty_organisationId_kind_name_idx"
ON "SavedParty"("organisationId", "kind", "name");

ALTER TABLE "SavedParty"
ADD CONSTRAINT "SavedParty_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
