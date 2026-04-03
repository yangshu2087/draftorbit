import { Inject, Injectable } from '@nestjs/common';
import { ProvidersService } from '../providers/providers.service';

@Injectable()
export class NaturalizationService {
  constructor(@Inject(ProvidersService) private readonly providers: ProvidersService) {}

  private applyRuleBasedRewrite(text: string): string {
    return text
      .replace(/总而言之/g, '简单说')
      .replace(/综上所述/g, '换句话说')
      .replace(/作为一个AI模型[^，。]*[，。]?/g, '')
      .replace(/我们可以看到/g, '你会发现')
      .trim();
  }

  async preview(
    userId: string,
    input: { text: string; tone?: string; strictness?: 'low' | 'medium' | 'high' }
  ) {
    const strictness = input.strictness ?? 'medium';
    const ruleBase = this.applyRuleBasedRewrite(input.text);

    const prompt = [
      '你是中文内容编辑，请对以下文本做“去 AI 味”自然化处理。',
      `目标语气：${input.tone ?? '自然、有观点、不过度营销'}`,
      `严格程度：${strictness}`,
      '要求：保持观点不变，避免空洞套话，适合发在 X。',
      `原文：\n${ruleBase}`
    ].join('\n');

    try {
      const routed = await this.providers.routeText(userId, {
        prompt,
        taskType: 'naturalization',
        temperature: strictness === 'high' ? 0.4 : strictness === 'low' ? 0.8 : 0.65
      });

      return {
        original: input.text,
        normalized: ruleBase,
        rewritten: routed.content,
        provider: {
          type: routed.providerType,
          model: routed.model,
          fallbackUsed: routed.fallbackUsed
        }
      };
    } catch {
      return {
        original: input.text,
        normalized: ruleBase,
        rewritten: ruleBase,
        provider: {
          type: 'RULE_ONLY',
          model: 'rule-based',
          fallbackUsed: true
        }
      };
    }
  }
}
