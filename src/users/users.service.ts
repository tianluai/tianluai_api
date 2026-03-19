import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async findOrCreateByClerkId(
    clerkId: string,
    data: { email?: string; name?: string },
  ): Promise<User> {
    const user = await this.userModel.findOne({ clerkId }).exec();
    if (user) return user;
    return this.userModel.create({
      clerkId,
      email: data.email,
      name: data.name,
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async findByClerkId(clerkId: string): Promise<User | null> {
    return this.userModel.findOne({ clerkId }).exec();
  }
}
