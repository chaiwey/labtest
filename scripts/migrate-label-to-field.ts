// One-off migration: turn the built-in slot.label into a real "Label"
// ProjectField (displayOrder 0), and copy every slot's label into a SlotValue
// on it. Also prepends a "Label" default for users whose UserDefaultField
// template lacks one, so their new projects still get Label first.
//
// Idempotent: a project/user that already has a (non-archived) "Label" field is
// skipped. Run once:  npx tsx scripts/migrate-label-to-field.ts
//
// The slot.label column is left in place (dormant) — not dropped — so this is
// reversible if needed.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const isLabel = (name: string) => name.trim().toLowerCase() === "label";

async function migrateProjects() {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, fields: { where: { archived: false }, select: { name: true } } },
  });
  let migrated = 0;
  let valuesCopied = 0;
  for (const p of projects) {
    if (p.fields.some((f) => isLabel(f.name))) continue; // already has a Label field
    await prisma.$transaction(async (tx) => {
      // Make room at displayOrder 0.
      await tx.projectField.updateMany({
        where: { projectId: p.id, archived: false },
        data: { displayOrder: { increment: 1 } },
      });
      const label = await tx.projectField.create({
        data: { projectId: p.id, name: "Label", type: "text", displayOrder: 0 },
      });
      const slots = await tx.slot.findMany({
        where: { rack: { projectId: p.id } },
        select: { id: true, label: true },
      });
      const values = slots
        .filter((s) => s.label && s.label.trim())
        .map((s) => ({ slotId: s.id, fieldId: label.id, value: s.label }));
      if (values.length) {
        await tx.slotValue.createMany({ data: values, skipDuplicates: true });
        valuesCopied += values.length;
      }
    });
    migrated++;
    console.log(`  project "${p.name}" → Label field + ${p.id}`);
  }
  console.log(`projects migrated: ${migrated}, slot labels copied: ${valuesCopied}`);
}

async function migrateUserDefaults() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      defaultFields: { select: { name: true } },
    },
  });
  let updated = 0;
  for (const u of users) {
    if (u.defaultFields.length === 0) continue; // no template → project.create seeds Label
    if (u.defaultFields.some((f) => isLabel(f.name))) continue;
    await prisma.$transaction(async (tx) => {
      await tx.userDefaultField.updateMany({
        where: { userId: u.id },
        data: { displayOrder: { increment: 1 } },
      });
      await tx.userDefaultField.create({
        data: { userId: u.id, name: "Label", type: "text", displayOrder: 0 },
      });
    });
    updated++;
  }
  console.log(`user default templates updated: ${updated}`);
}

async function main() {
  await migrateProjects();
  await migrateUserDefaults();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
