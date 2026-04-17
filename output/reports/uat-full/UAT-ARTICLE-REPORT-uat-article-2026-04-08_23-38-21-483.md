# DraftOrbit Article 专项 UAT 报告

- Run ID: `uat-article-2026-04-08_23-38-21-483`
- API URL: http://127.0.0.1:4000
- APP URL: http://127.0.0.1:3000
- 认证方式: 本地会话 / local session

## Summary

- 当前账号: Self-host Admin (selfhost@draftorbit.local)
- article runId: `a7f3cafc-004a-4edb-b25e-10a9ac5db18a`
- runDetail.format: article
- 质量分: 86.93
- publish.prepare.blockingReason: ARTICLE_PUBLISH_NOT_SUPPORTED
- publish.prepare.nextAction: export_article
- publish.confirm.blocked.code: ARTICLE_PUBLISH_NOT_SUPPORTED
- queue.review.nextAction: export_article
- 结果区是否出现 article 提示框: 是
- 浏览器 console error: 0
- 浏览器 page error: 0

## Assertions

- [x] /app 中可切换到“长文”输出形态
- [x] 真实生成结果出现“复制到 X 文章编辑器”主按钮
- [x] 生成正文包含 X 长文结构（标题 / 导语 / 小节 / 结尾）
- [x] 点击主按钮后出现“长文已复制”反馈
- [x] /app?nextAction=export_article&highlight=<runId> 任务面板显示“复制长文”
- [x] article 任务面板不再出现“确认发布”
- [x] article 任务面板显示手动导出说明
- [x] API prepare 阶段返回 ARTICLE_PUBLISH_NOT_SUPPORTED + export_article
- [x] API confirm 阶段被阻止，不会误走 tweet/thread 发布
- [x] queue.review 对 article 返回 nextAction=export_article

## Steps

- [x] auth.local-session (33ms)
- [x] auth.me (4ms)
- [x] v3.bootstrap (10ms)
- [x] browser.app.open (256ms)
- [x] browser.app.generate-article (66556ms)
- [x] browser.app.copy-article (226ms)
- [x] browser.app.export-panel (272ms)
- [x] v3.article.run-detail (18ms)
- [x] v3.article.publish.prepare (13ms)
- [x] v3.article.publish.confirm.blocked (3ms)
- [x] v3.article.queue.after-run (11ms)
- [x] browser.capture.observations (1ms)

## Evidence Index

- POST-/auth/local/session: artifacts/uat-full/uat-article-2026-04-08_23-38-21-483/responses/001-post-auth-local-session.json
- GET-/auth/me: artifacts/uat-full/uat-article-2026-04-08_23-38-21-483/responses/002-get-auth-me.json
- POST-/v3/session/bootstrap: artifacts/uat-full/uat-article-2026-04-08_23-38-21-483/responses/003-post-v3-session-bootstrap.json
- browser-chat-run: artifacts/uat-full/uat-article-2026-04-08_23-38-21-483/responses/004-browser-chat-run.json
- GET-/v3/chat/runs/a7f3cafc-004a-4edb-b25e-10a9ac5db18a: artifacts/uat-full/uat-article-2026-04-08_23-38-21-483/responses/005-get-v3-chat-runs-a7f3cafc-004a-4edb-b25e-10a9ac5db18a.json
- POST-/v3/publish/prepare: artifacts/uat-full/uat-article-2026-04-08_23-38-21-483/responses/006-post-v3-publish-prepare.json
- POST-/v3/publish/confirm-expected-failure: artifacts/uat-full/uat-article-2026-04-08_23-38-21-483/responses/007-post-v3-publish-confirm-expected-failure.json
- GET-/v3/queue?limit=24: artifacts/uat-full/uat-article-2026-04-08_23-38-21-483/responses/008-get-v3-queue-limit-24.json
- browser-observations: artifacts/uat-full/uat-article-2026-04-08_23-38-21-483/responses/009-browser-observations.json

## Screenshots

- output/playwright/uat-article-2026-04-08_23-38-21-483/article-app.png
- output/playwright/uat-article-2026-04-08_23-38-21-483/article-result.png
- output/playwright/uat-article-2026-04-08_23-38-21-483/article-copy-toast.png
- output/playwright/uat-article-2026-04-08_23-38-21-483/article-export-panel.png

## Notes

- 本次为本地专项验收，目标是验证 article 生成与导出链路，不涉及真实发文。
- 当前正确用户路径是“复制到 X 文章编辑器”，不是直接进入 tweet/thread 发布队列。
