# 教学教练分析 (Teaching Coach Analysis)

从 Socratopia v2.1.1 的 [chat/route.js](/D:/Users/qhdjxgm/AppData/Local/Programs/Socratopia/resources/server/.next/server/app/api/chat/route.js)（模块 7788）中提取。

**用途**: 每隔若干轮对话，由一个独立的 LLM 调用分析师生对话质量，产出结构化的教学状态评估，注入后续轮次的 system prompt，指导 AI 伙伴的行为。

---

## 分析 Prompt（中文版）

```
你是苏格拉底式教学教练。分析以下师生对话历史（AI学习伙伴 vs 学习者），输出教学状态评估。

评估维度：
1. companionBehavior — 伙伴行为分类（normal / looping / drifting / criticizing_author / vague_answers）
2. learnerEngagement — 学习者投入度（passive / following / curious / deeply_engaged / frustrated）
3. isLearnerDrivingRepetition — 重复是否由学习者主动驱动
4. isTangent — 是否在岔题
5. mainlineTopic — 主线话题（如有岔题）
6. currentFocus — 当前焦点
7. learnerWeakPoint — 学习者薄弱点
8. recentPatterns — 近期规律
9. teachingGoalAlignment — 目标对齐度（aligned / slightly_off / off_track）
10. recommendedAction — 建议行动（advance / deepen / honor_curiosity / challenge / rescue / address_question / return_to_mainline）
11. actionReason — 行动理由
12. responsePlaybook — 回应预案（4 个子字段）
    - ifShortAck: 学习者简短回应时的预案
    - ifQuestion: 学习者提问时的预案
    - ifSubstantive: 学习者实质性回答时的预案
    - ifConfused: 学习者表示困惑时的预案
13. qualityFlags — 质量提醒（字符串数组）
14. contentProgress — 内容推进状态（"first_half" | "second_half"）

输出 JSON 格式：

{
  "companionBehavior": "normal",
  "learnerEngagement": "following",
  "isLearnerDrivingRepetition": false,
  "isTangent": false,
  "mainlineTopic": "微分方程的基本概念",
  "currentFocus": "可分离变量法",
  "learnerWeakPoint": "对 dy/dx 符号含义理解模糊",
  "recentPatterns": "连续 3 轮在同一个例子上打转",
  "teachingGoalAlignment": "aligned",
  "recommendedAction": "deepen",
  "actionReason": "学习者已掌握基本解法，可以引入更复杂的例子",
  "responsePlaybook": {
    "ifShortAck": "追问'为什么你这么认为'，不要接受表面确认",
    "ifQuestion": "先肯定提问，再用反问引导自己发现答案",
    "ifSubstantive": "用具体应用场景挑战理解深度",
    "ifConfused": "回到上一步的基础概念，换一个角度重新解释"
  },
  "qualityFlags": [],
  "contentProgress": "first_half"
}
```

---

## JSON Schema 字段详解

### companionBehavior
| 值 | 含义 | 触发动作 |
|---|---|---|
| `normal` | 教学正常 | 保持当前节奏 |
| `looping` | 绕圈（反复提类似问题）| 强制推进新内容 |
| `drifting` | 飘离（偏向抽象/文学化）| 拉回具体概念/数据/案例 |
| `criticizing_author` | 批评教材作者（违规）| 立即停止，回到教材内容 |
| `vague_answers` | 回答模糊不扎实 | 要求具体化 |

### learnerEngagement
| 值 | 含义 |
|---|---|
| `passive` | 被动（敷衍应付）|
| `following` | 跟随（正常听课）|
| `curious` | 好奇（主动追问）|
| `deeply_engaged` | 深度投入 |
| `frustrated` | 困惑或受挫 |

### recommendedAction
| 值 | 含义 |
|---|---|
| `advance` | 推进新内容 |
| `deepen` | 加深当前话题 |
| `honor_curiosity` | 尊重并满足好奇心 |
| `challenge` | 用具体情境挑战 |
| `rescue` | 识别困境、救场 |
| `address_question` | 先答问题再推进 |
| `return_to_mainline` | 回到主线 |

### contentProgress
| 值 | 含义 |
|---|---|
| `first_half` | 教材前半段 |
| `second_half` | 教材后半段（触发自动内容补充）|

---

## 注入格式

分析结果注入 system prompt 的格式（中文版）：

```
[== 教学教练分析 · 第 N 轮 ==]

◆ 当前状态
伙伴行为：{companionBehavior 中译}
学习者投入：{learnerEngagement 中译}
当前焦点：{currentFocus}
学习者薄弱点：{learnerWeakPoint}
近期规律：{recentPatterns}

{根据行为状态的不同，插入不同的指导建议}

◆ 目标对齐度：{✓ 对齐 / 略偏 / ❌ 偏离}
◆ 本轮建议：{recommendedAction 中译} — {actionReason}

◆ 回应预案（根据学习者下一条消息选择）
如果简短回应：{ifShortAck}
如果学习者提问：{ifQuestion}
如果实质性回答：{ifSubstantive}
如果表示困惑：{ifConfused}

⚠️ 质量提醒：{qualityFlags}

◆ 回复要求（仅供内部遵守，不得输出到回复中）
正文（不含最后的问题）≤ 120 字；以问题结尾，问题单独成行；绝对禁止在回复末尾附加任何核查注释或勾选列表。
```

---

## 容错机制

1. JSON 解析失败 → 尝试正则补救（key 对齐 + 引号修复）
2. 正则也失败 → 等待 500ms 后重试一次
3. 两次都失败 → 本轮不注入教练分析（非致命）
4. 缓存最近 200 个会话的分析结果（LRU 驱逐）

---

## 内容自动补充

当 `contentProgress === "second_half"` 且阅读窗口过半时：
- 触发教材内容自动读取（read_textbook_pages）
- 更新 current_reading.md
- 产生新的阅读窗口范围
- 调用摘要生成（200-300 token 的上下半场摘要）

---

## 对 MVP 的启发

MVP 第一阶段**不需要**教学教练分析。原因：

1. 它需要额外的 LLM 调用（每若干轮一次），增加延迟和 API 费用
2. 它依赖完整的教材上下文才能做出有意义的分析
3. 没有教材和进度的 MVP，分析没有锚点

MVP 可以直接把"回复要求"（≤ 120 字、以提问结尾、不加核查注释）写死在 system prompt 里，不做动态分析。

当 MVP 有了教材支持和多轮对话后，教学教练分析是提升对话质量的第一个值得加的特性。
