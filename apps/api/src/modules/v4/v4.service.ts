import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { V3Service } from '../v3/v3.service';
import { V4StudioRunDto } from './v4.dto';
import {
  V4_STUDIO_FORMATS,
  V4_STUDIO_SKILL_MATRIX,
  buildV4PreviewFromV3Run,
  normalizeV4StudioRequest,
  resolveV4SourceRequirement
} from './v4-studio.contract';

@Injectable()
export class V4Service {
  constructor(@Inject(V3Service) private readonly v3: V3Service) {}

  getCapabilities() {
    return {
      version: 'v4-creator-studio',
      defaultRouting: {
        primary: 'codex-local',
        oauth: 'Codex local adapter via codex exec',
        ollamaDefault: 'disabled',
        publishMode: 'manual-confirm'
      },
      formats: V4_STUDIO_FORMATS,
      skillMatrix: V4_STUDIO_SKILL_MATRIX,
      exportFormats: ['markdown', 'html', 'bundle'],
      safety: {
        latestFacts: 'source-required-fail-closed',
        xPosting: 'prepare/manual-confirm only',
        payments: 'safe checkout entry only'
      }
    };
  }

  async runStudio(userId: string, input: V4StudioRunDto) {
    const sourceRequirement = resolveV4SourceRequirement(input);
    if (sourceRequirement.blocked) {
      throw new HttpException(
        {
          code: sourceRequirement.code,
          message: sourceRequirement.message,
          details: { recoveryAction: sourceRequirement.recoveryAction, format: input.format }
        },
        HttpStatus.FAILED_DEPENDENCY
      );
    }

    const normalized = normalizeV4StudioRequest(input);
    const start = await this.v3.runChat(userId, normalized.v3);
    return {
      ...start,
      studio: {
        version: 'v4-creator-studio',
        format: normalized.format,
        sourceUrl: normalized.sourceUrl,
        exportRequest: normalized.exportRequest,
        contract: normalized.contract
      },
      publishPreparation: {
        mode: 'manual-confirm',
        label: '准备发布 / 手动确认',
        canAutoPost: false
      },
      usageEvidence: {
        primaryProvider: 'codex-local',
        evidencePolicy: 'Codex OAuth local adapter first; Ollama is opt-in low-memory fallback only.'
      }
    };
  }

  async getStudioRun(userId: string, runId: string) {
    const run = await this.v3.getRun(userId, runId);
    return buildV4PreviewFromV3Run(run);
  }
}
