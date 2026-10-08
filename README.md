# dsh-cpa-reasoning-effort

CPA（EasyCLIProxyAPI）在 DSH 里是自定义提供商 `easy-cliproxyapi`。思考等级选择器只显示模型自己声明的 `reasoningEfforts`，而目录合并按**提供商 id** 而不是模型名，所以 `grok-4.7-build-fast` 不会自动拿到 xAI 的档位。

本插件只处理配置里点名的提供商（默认 `easy-cliproxyapi`）。它用一份原厂商档位快照，按模型 id 的最长前缀补上非空档位，写回 `llm-pi-ai` 的对应模型。对话框里现有的「模型 / 思考档」菜单随后就能选这些档，请求里的 `reasoning.effort` 使用原厂商的协议拼写。

插件在激活、配置重载、LLM 适配器更新和应用就绪时都会执行补写；启动期没写成功的（llm-pi-ai 还没挂载、编辑输给引导竞态）会按 1s / 3s / 10s / 30s 退避重试，所以新模型加进配置后无需重启、无需手动补 `reasoningEfforts`。

已经写了 `reasoningEfforts`（含 `false`）的模型不会被覆盖。带后缀的别名（如 `grok-4.7-build-fast`、`gemini-3.8-flash-high`）会自动按最长前缀匹配到原厂商基座模型（如 `grok-4.7`、`gemini-3.8-flash`），并赋予对应支持的非空档位：
- `grok-4.7-build-fast`：`low` / `medium` / `high` / `xhigh`
- `gemini-3.8-flash-high`：`low` / `medium` / `high`

不认识的模型保持原样。要换别名或增加提供商，改本插件条目的 `providers`，或在该模型上自行声明 `reasoningEfforts`。

档位快照来自 pi-ai 的原厂目录（xAI、Google、Anthropic、OpenAI、DeepSeek 等），不含网关改写过的表。更新快照：

```bash
node scripts/build-catalog.mjs <pi-ai-catalog 目录>
```
