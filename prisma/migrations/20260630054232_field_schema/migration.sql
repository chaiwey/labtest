-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('text', 'number', 'date', 'enum');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "confirmationEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UserDefaultField" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FieldType" NOT NULL DEFAULT 'text',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDefaultField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectField" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FieldType" NOT NULL DEFAULT 'text',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "displayOrder" INTEGER NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotValue" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedBy" TEXT,

    CONSTRAINT "SlotValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDefaultField_userId_idx" ON "UserDefaultField"("userId");

-- CreateIndex
CREATE INDEX "ProjectField_projectId_idx" ON "ProjectField"("projectId");

-- CreateIndex
CREATE INDEX "SlotValue_slotId_idx" ON "SlotValue"("slotId");

-- CreateIndex
CREATE INDEX "SlotValue_fieldId_idx" ON "SlotValue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotValue_slotId_fieldId_key" ON "SlotValue"("slotId", "fieldId");

-- AddForeignKey
ALTER TABLE "UserDefaultField" ADD CONSTRAINT "UserDefaultField_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectField" ADD CONSTRAINT "ProjectField_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotValue" ADD CONSTRAINT "SlotValue_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotValue" ADD CONSTRAINT "SlotValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ProjectField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
