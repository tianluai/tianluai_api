import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class OrganizationMember extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Organization' })
  organizationId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ default: 'member', enum: ['owner', 'admin', 'member'] })
  role: string;

  @Prop({ default: 'active', enum: ['active', 'pending'] })
  status: string;
}

export const OrganizationMemberSchema =
  SchemaFactory.createForClass(OrganizationMember);

// Unique membership per user per org
OrganizationMemberSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true },
);
