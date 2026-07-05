## 变更描述

<!-- 简要描述此 PR 做了什么 -->

Closes #

## 验收命令

<!-- Reviewer 运行以下命令验证 -->
```bash
# 示例：
# curl -s -b /tmp/cookie.txt ... | grep usedKnowledgeBase
```

## 影响文件

<!-- 列出修改的文件 -->

## 回归检查

- [ ] `pnpm build` 通过
- [ ] `/api/health` 返回 200
- [ ] `/api/ai/ask` usedKnowledgeBase 命中
- [ ] 验证命令输出符合预期
- [ ] 不改 schema（如改则需说明原因）

## 注意

- 此 PR 不修改 `data/` 目录下的文件
- 不硬编码 token / API key
- 不在 middleware 白名单中添加不需要暴露的路由