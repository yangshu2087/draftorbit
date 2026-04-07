import {
  GenerationType,
  LearningSourceType,
  PublishChannel,
  PublishJobStatus,
  ReplyJobStatus,
  ReplyRiskLevel,
  XAccountStatus
} from '@draftorbit/db';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsNumber,
  MinLength,
  IsInt,
  Min,
  Max,
  ValidateNested
} from 'class-validator';

export class V2BriefDto {
  @IsString()
  @MinLength(1)
  objective!: string;

  @IsString()
  @MinLength(1)
  audience!: string;

  @IsString()
  @MinLength(1)
  tone!: string;

  @IsString()
  @MinLength(1)
  postType!: string;

  @IsString()
  @MinLength(1)
  cta!: string;

  @IsString()
  @MinLength(1)
  topicPreset!: string;
}

export class V2AdvancedDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  customPrompt?: string;
}

export class CreateChatSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
}

export class ChatMessageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  sessionId?: string;

  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsEnum(GenerationType)
  type?: GenerationType;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  useStyle?: boolean;

  @IsOptional()
  @IsString()
  xAccountId?: string;
}

export class GenerateRunDto {
  @IsOptional()
  @IsIn(['brief', 'advanced'])
  mode?: 'brief' | 'advanced';

  @IsOptional()
  @IsString()
  @MinLength(1)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  intent?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => V2BriefDto)
  @IsObject()
  brief?: V2BriefDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => V2AdvancedDto)
  @IsObject()
  advanced?: V2AdvancedDto;

  @IsOptional()
  @IsEnum(GenerationType)
  type?: GenerationType;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  useStyle?: boolean;
}

export class ConnectObsidianDto {
  @IsString()
  @MinLength(1)
  vaultPath!: string;

  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsBoolean()
  autoLearn?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includePatterns?: string[];
}

export class ConnectLocalFilesDto {
  @IsArray()
  @IsString({ each: true })
  paths!: string[];

  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsBoolean()
  autoLearn?: boolean;
}

export class ImportKnowledgeUrlsDto {
  @IsArray()
  @IsUrl(undefined, { each: true })
  urls!: string[];

  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsBoolean()
  autoLearn?: boolean;
}

export class RebuildStyleProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  profileId?: string;
}

export class QueuePublishDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  generationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  draftId?: string;

  @IsOptional()
  @IsEnum(PublishChannel)
  channel?: PublishChannel;

  @IsOptional()
  @IsString()
  @MinLength(1)
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  xAccountId?: string;
}

export class ListPublishJobsV2Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsEnum(PublishJobStatus)
  status?: PublishJobStatus;
}

export class ListReplyJobsV2Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsEnum(ReplyJobStatus)
  status?: ReplyJobStatus;
}

export class SyncReplyMentionsV2Dto {
  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsString()
  sourcePostId?: string;
}

export class AddReplyCandidateV2Dto {
  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsEnum(ReplyRiskLevel)
  riskLevel?: ReplyRiskLevel;

  @IsOptional()
  @Type(() => Number)
  riskScore?: number;
}

export class SendReplyV2Dto {
  @IsOptional()
  @IsString()
  candidateId?: string;
}

export class ListXAccountsV2Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsEnum(XAccountStatus)
  status?: XAccountStatus;
}

export class UpdateXAccountStatusV2Dto {
  @IsEnum(XAccountStatus)
  status!: XAccountStatus;
}

export class BindXAccountManualV2Dto {
  @IsString()
  @MinLength(1)
  twitterUserId!: string;

  @IsString()
  @MinLength(1)
  handle!: string;

  @IsOptional()
  @IsEnum(XAccountStatus)
  status?: XAccountStatus;
}

export class CheckoutV2Dto {
  @IsIn(['STARTER', 'PRO', 'PREMIUM'])
  plan!: 'STARTER' | 'PRO' | 'PREMIUM';

  @IsIn(['MONTHLY', 'YEARLY'])
  cycle!: 'MONTHLY' | 'YEARLY';
}

export class CancelSubscriptionV2Dto {
  @IsIn(['AT_PERIOD_END', 'IMMEDIATE'])
  mode!: 'AT_PERIOD_END' | 'IMMEDIATE';
}

export class RefundV2Dto {
  @IsIn(['PARTIAL', 'FULL'])
  mode!: 'PARTIAL' | 'FULL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amountUsd?: number;

  @IsOptional()
  @IsIn(['requested_by_customer', 'duplicate', 'fraudulent'])
  reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent';
}

export const KNOWLEDGE_CONNECTOR_MAP = {
  obsidian: LearningSourceType.IMPORT_CSV,
  local_file: LearningSourceType.IMPORT_CSV,
  url: LearningSourceType.URL
} as const;
