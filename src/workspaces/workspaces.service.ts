import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Organization } from './schemas/organization.schema';
import { OrganizationMember } from './schemas/organization-member.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMember>,
    private readonly usersService: UsersService,
  ) {}

  async createWorkspace(
    clerkId: string,
    name: string,
  ): Promise<{ id: string; name: string }> {
    const user = await this.usersService.findOrCreateByClerkId(clerkId, {});

    const organization = await this.orgModel.create({
      name,
      ownerId: user._id,
    });

    await this.memberModel.create({
      organizationId: organization._id,
      userId: user._id,
      role: 'owner',
      status: 'active',
    });

    return {
      id: organization._id.toString(),
      name: organization.name,
    };
  }

  async listMyWorkspaces(clerkId: string): Promise<
    Array<{
      id: string;
      name: string;
      role: string;
    }>
  > {
    const user = await this.usersService.findByClerkId(clerkId);
    if (!user) return [];

    const memberships = await this.memberModel
      .find({ userId: user._id, status: 'active' })
      .populate('organizationId')
      .lean()
      .exec();

    return memberships
      .filter(
        (membership) =>
          membership.organizationId &&
          typeof membership.organizationId === 'object',
      )
      .map((membership) => {
        const organization = membership.organizationId as unknown as {
          _id: Types.ObjectId;
          name: string;
        };
        return {
          id: organization._id.toString(),
          name: organization.name,
          role: membership.role,
        };
      });
  }

  async getWorkspace(
    clerkId: string,
    workspaceId: string,
  ): Promise<{ id: string; name: string } | null> {
    const user = await this.usersService.findByClerkId(clerkId);
    if (!user) return null;

    const member = await this.memberModel
      .findOne({
        organizationId: new Types.ObjectId(workspaceId),
        userId: user._id,
        status: 'active',
      })
      .exec();

    if (!member) return null;

    const organization = await this.orgModel.findById(workspaceId).exec();
    if (!organization) return null;

    return {
      id: organization._id.toString(),
      name: organization.name,
    };
  }

  async deleteWorkspace(clerkId: string, workspaceId: string): Promise<void> {
    if (!Types.ObjectId.isValid(workspaceId)) {
      throw new NotFoundException('Workspace not found.');
    }

    const user = await this.usersService.findByClerkId(clerkId);
    if (!user) {
      throw new NotFoundException('Workspace not found.');
    }

    const ownerMembership = await this.memberModel
      .findOne({
        organizationId: new Types.ObjectId(workspaceId),
        userId: user._id,
        status: 'active',
      })
      .exec();

    if (!ownerMembership) {
      throw new NotFoundException('Workspace not found.');
    }
    if (ownerMembership.role !== 'owner') {
      throw new ForbiddenException(
        'Only workspace owners can delete workspaces.',
      );
    }

    const deletedOrganization = await this.orgModel
      .findByIdAndDelete(workspaceId)
      .exec();
    if (!deletedOrganization) {
      throw new NotFoundException('Workspace not found.');
    }

    await this.memberModel
      .deleteMany({ organizationId: deletedOrganization._id })
      .exec();
  }
}
