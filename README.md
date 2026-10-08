# dsh-cpa-reasoning-effort

CPA（EasyCLIProxyAPI）在 DSH 里是自定义提供商 `easy-cliproxyapi`。思考等级选择器只显示模型自己声明的 `reasoningEfforts`，而目录合并按**提供商 id** 而不是模型名，所以 `grok-4.7-build-fast` 不会自动拿到 xAI 的档位。

本插件只处理配置里点名的提供商（默认 `easy-cliproxyapi`）。它用一份原厂商档位快照，按模型 id 的最长前缀补上非空档位，写回 `llm-pi-ai` 的对应模型。对话框里现有的「模型 / 思考档」菜单随后就能选这些档，请求里的 `reasoning.effort` 使用原厂商的协议拼写（如 grok 的 `off` 写作 `none`、gemma 的档位是大写 `MINIMAL` / `HIGH`）。

档位全集为 `off / minimal / low / medium / high / xhigh / max`，按此顺序排列；wire 值为空的档会被丢弃。

## 配置

插件没有设置界面，配置写在 profile 里 id 为 `cpa-reasoning-effort` 的条目上（cordis.patch.yml 提供默认值，无 schema）：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 设为 `false` 完全停用插件 |
| `providers` | string[] | `['easy-cliproxyapi']` | 要补档位的自定义提供商 id 列表；空数组或过滤后为空时回落默认值 |

## 工作机制

插件在激活、配置重载（`app-boot/config-reload`）、LLM 适配器更新（`llm/adapters-updated`）和应用就绪（settle pass）时都会执行补写。暂时没写成功的（llm-pi-ai 还没挂载、edit 失败）会按 1s / 3s / 10s / 30s 退避重试，之后固定 30s 间隔直到写入成功或插件卸载——不限于启动期。所以新模型加进配置后无需重启、无需手动补 `reasoningEfforts`。

写入在 edit 事务内基于**当前最新配置**重新计算，不会覆盖竞态期间你手动做的编辑。

## 匹配规则

已经写了 `reasoningEfforts`（含 `false`）的模型不会被覆盖。带后缀的别名按「最长前缀 + `-` 分隔」匹配到原厂商基座模型（`grok-4.7-build-fast` 匹配 `grok-4.7`，而 `grok-4.7fast` 不匹配），并赋予对应支持的非空档位：
- `grok-4.7-build-fast`：`low` / `medium` / `high` / `xhigh`
- `gemini-3.8-flash-high`：`low` / `medium` / `high`

不认识的模型保持原样。要换别名或增加提供商，改本插件条目（`cpa-reasoning-effort`）的 `providers`，或在该模型上自行声明 `reasoningEfforts`。

## 档位快照

快照（`vendor-efforts.json`，约 60 个模型）来自 pi-ai 的原厂目录，覆盖 xAI（grok 系列）、Google（gemini / gemma 系列）、Anthropic（claude 系列）、OpenAI（gpt / o 系列）、DeepSeek、Moonshot / Kimi（kimi-k3、k3、kimi-for-coding）、MiniMax（muse-spark 系列）、智谱（glm 系列）、Qwen（qwen3.8 系列）等；不含网关改写过的表（OpenRouter / Azure / Copilot 等）。同 id 冲突时按原厂目录顺序先到先得。

更新快照（必须传 pi-ai-catalog 目录参数）：

```bash
node scripts/build-catalog.mjs <pi-ai-catalog 目录>
```

## 开发

```bash
npm test    # node --test test/（匹配、回退、重试、dispose）
```

要求 Node >= 22.19。
