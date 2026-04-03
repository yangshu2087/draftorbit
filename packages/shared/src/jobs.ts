export interface PublishJobPayload {
  publishJobId: string;
}

export interface ReplyJobPayload {
  replyJobId: string;
}

export interface LearningJobPayload {
  learningSourceId: string;
  workspaceId: string;
  userId: string;
}

export interface ImageJobPayload {
  mediaAssetId: string;
}

export interface MentionsJobPayload {
  replyJobId: string;
}

export interface MetricsJobPayload {
  workspaceId: string;
}

export interface AutomationJobPayload {
  workflowRunId: string;
}

