import { PrismaClient, Role } from "@prisma/client";
import argon2 from "argon2";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), "../../.env"));

const prisma = new PrismaClient();

const defaultUsers = [
  {
    email: "admin@scrum.local",
    name: "Platform Admin",
    role: Role.platform_admin,
    password: "admin1234"
  },
  {
    email: "owner@scrum.local",
    name: "Product Owner",
    role: Role.product_owner,
    password: "owner1234"
  },
  {
    email: "scrum@scrum.local",
    name: "Scrum Master",
    role: Role.scrum_master,
    password: "scrum1234"
  },
  {
    email: "member@scrum.local",
    name: "Team Member",
    role: Role.team_member,
    password: "member1234"
  }
];

async function main() {
  const userIdsByEmail = new Map();
  for (const user of defaultUsers) {
    const passwordHash = await argon2.hash(user.password);
    const upserted = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        passwordHash
      },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash
      }
    });
    userIdsByEmail.set(user.email, upserted.id);
  }

  const defaultTeam = await prisma.team.upsert({
    where: { name: "Core Team" },
    update: {
      description: "Default operational team"
    },
    create: {
      name: "Core Team",
      description: "Default operational team"
    }
  });

  const defaultMembers = ["scrum@scrum.local", "member@scrum.local"];
  for (const email of defaultMembers) {
    const userId = userIdsByEmail.get(email);
    if (!userId) {
      continue;
    }

    await prisma.teamMember.upsert({
      where: {
        teamId_userId: {
          teamId: defaultTeam.id,
          userId
        }
      },
      update: {},
      create: {
        teamId: defaultTeam.id,
        userId
      }
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
