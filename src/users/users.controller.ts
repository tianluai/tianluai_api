import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/auth.guard';
import { ClerkUserId } from '../auth/clerk-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(ClerkAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Syncs the current Clerk user to MongoDB (creates if not exists) and returns the user.
   * Call this when the app loads so the user exists in the DB even before they create a workspace.
   */
  @Get('me')
  async getMe(@ClerkUserId() clerkId: string) {
    const user = await this.usersService.findOrCreateByClerkId(clerkId, {});
    return {
      id: user._id.toString(),
      clerkId: user.clerkId,
      email: user.email,
      name: user.name,
    };
  }
}
