import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { randomUUID } from 'crypto';

@Schema({ timestamps: true })
export class Organization extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  ownerId: Types.ObjectId;

  @Prop({
    required: true,
    unique: true,
    index: true,
    default: () => randomUUID(),
  })
  inviteCode: string;

  @Prop({ default: 'free' })
  plan: string;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
