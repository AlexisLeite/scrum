import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTeamDto, UpdateTeamDto } from "./teams.dto";

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.team.findMany({ include: { members: true }, orderBy: { name: "asc" } });
  }

  create(dto: CreateTeamDto) {
    return this.prisma.team.create({ data: dto });
  }

  update(id: string, dto: UpdateTeamDto) {
    return this.prisma.team.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.team.delete({ where: { id } });
    return { ok: true };
  }

  addMember(teamId: string, userId: string) {
    return this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: {},
      create: { teamId, userId }
    });
  }

  async removeMember(teamId: string, userId: string) {
    await this.prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
    return { ok: true };
  }
}