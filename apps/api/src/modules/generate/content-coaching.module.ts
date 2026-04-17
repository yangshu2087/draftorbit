import { Module } from '@nestjs/common';
import { ContentBenchmarkService } from './content-benchmark.service';
import { VisualPlanningService } from './visual-planning.service';
import { DerivativeGuidanceService } from './derivative-guidance.service';
import { BaoyuRuntimeService } from './baoyu-runtime.service';
import { SourceCaptureService } from './source-capture.service';
import { VisualCardRenderService } from './visual-card-render.service';

@Module({
  providers: [
    ContentBenchmarkService,
    VisualPlanningService,
    DerivativeGuidanceService,
    VisualCardRenderService,
    BaoyuRuntimeService,
    SourceCaptureService
  ],
  exports: [
    ContentBenchmarkService,
    VisualPlanningService,
    DerivativeGuidanceService,
    VisualCardRenderService,
    BaoyuRuntimeService,
    SourceCaptureService
  ]
})
export class ContentCoachingModule {}
