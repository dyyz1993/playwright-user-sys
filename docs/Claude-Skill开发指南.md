# Claude Code Skill 开发指南

> 版本: 1.0.0
> 更新日期: 2025-12-28
> 适用于: Claude Code CLI, Claude.ai, Claude API

## 目录

1. [概述](#1-概述)
2. [Skill 文件结构](#2-skill-文件结构)
3. [YAML Frontmatter 详解](#3-yaml-frontmatter-详解)
4. [内容写作原则](#4-内容写作原则)
5. [技巧和最佳实践](#5-技巧和最佳实践)
6. [实战示例](#6-实战示例)
7. [调试和验证](#7-调试和验证)
8. [迁移指南](#8-迁移指南)
9. [检查清单](#9-检查清单)
10. [参考资源](#10-参考资源)

---

## 1. 概述

### 什么是 Claude Code Skill

**Claude Code Skill** 是一种模块化的、自包含的指令包，用于扩展 Claude 的能力，使其能够在特定领域或任务中表现出色。每个 Skill 由以下组成：

- **SKILL.md**: 包含元数据和指令的主文件
- **scripts/**: 可执行代码（Python/Bash 等）
- **references/**: 文档和参考资料
- **assets/**: 模板、图标、字体等资源文件

### Skill vs 传统工具的区别

| 特性 | Skill | 传统脚本/工具 |
|------|-------|--------------|
| **触发方式** | 自然语言触发 | 命令行调用 |
| **灵活性** | 高度灵活，可适应上下文 | 固定执行逻辑 |
| **上下文管理** | 渐进式加载，按需使用 | 全部加载或无 |
| **可维护性** | 自文档化，易于更新 | 需要额外文档 |
| **AI 集成** | 原生集成，AI 可理解和修改 | 需要包装器 |
| **Token 效率** | 极高（~100 tokens 触发） | N/A |

### 什么时候应该创建 Skill

#### ✅ 适合创建 Skill 的场景

1. **重复性任务模式**
   - 需要多次执行的相同工作流程
   - 例如: 创建用户、部署应用、生成报告

2. **领域专业知识**
   - 公司特定的业务逻辑、API、工作流程
   - 例如: 数据库 schema、API 文档、品牌规范

3. **复杂的多步骤流程**
   - 需要精确顺序的操作
   - 例如: 文档审阅流程、CI/CD 部署

4. **工具集成**
   - 与特定文件格式或 API 的交互
   - 例如: PDF 处理、Excel 生成

5. **团队标准化**
   - 需要团队一致遵守的规范
   - 例如: 代码风格、测试流程

#### ❌ 不适合创建 Skill 的场景

1. **一次性任务** - 直接在对话中完成即可
2. **简单操作** - 不值得封装的简单命令
3. **高度变化的任务** - 每次都完全不同的流程
4. **已有完美工具** - 现有工具已经很好用

### Skill 的适用场景

#### 开发工具类
- 代码生成和重构
- API 集成
- 数据库操作
- 测试框架配置

#### 文档类
- 技术文档生成
- API 文档维护
- 用户手册编写
- README 生成

#### 测试类
- 集成测试指南
- E2E 测试自动化
- 性能测试配置
- 测试数据分析

#### 部署类
- CI/CD 配置
- 容器化部署
- 云服务部署
- 环境配置

#### 设计类
- UI 组件生成
- 样式规范应用
- 品牌资源管理
- 图标和字体处理

---

## 2. Skill 文件结构

### 标准目录结构

```
skill-name/
├── SKILL.md              # 必需：主指令文件
├── LICENSE.txt           # 可选：许可证文件
├── scripts/              # 可选：可执行脚本
│   ├── setup.sh
│   ├── process.py
│   └── helper.js
├── references/           # 可选：参考资料
│   ├── api-docs.md
│   ├── schemas.md
│   └── workflows.md
└── assets/               # 可选：资源文件
    ├── templates/
    ├── fonts/
    └── logos/
```

### SKILL.md 的作用

**SKILL.md** 是 Skill 的核心文件，包含两部分：

1. **YAML Frontmatter**（必需）
   - `name`: Skill 的唯一标识符
   - `description`: 描述 Skill 功能和何时使用
   - `allowed-tools`: 可选，允许使用的工具列表
   - `license`: 可选，许可证信息

2. **Markdown 内容**（必需）
   - Quick Start
   - 使用指南
   - 示例
   - 最佳实践

**示例**：
```markdown
---
name: webapp-testing
description: Toolkit for testing local web applications using Playwright. Use when debugging UI, capturing screenshots, or viewing browser logs.
license: Apache 2.0
---

# Web Application Testing

## Quick Start

Write native Python Playwright scripts...

## Workflow

[详细的操作流程]
```

### references/ 目录的使用

**用途**: 存储详细的参考资料，按需加载到上下文中。

**何时使用**：
- API 文档
- 数据库 Schema
- 工作流程详细说明
- 领域专业知识

**最佳实践**：
```markdown
# 在 SKILL.md 中引用

## Reference Documentation

Load these resources as needed:

- **API Reference**: See [references/api.md](references/api.md) for complete API documentation
- **Database Schema**: See [references/schema.md](references/schema.md) for table structures
- **Workflows**: See [references/workflows.md](references/workflows.md) for detailed processes
```

**文件组织**：
```
references/
├── quick-start.md       # 快速入门
├── api.md              # API 文档
├── patterns.md         # 常见模式
└── troubleshooting.md  # 故障排查
```

### scripts/ 目录的使用

**用途**: 存储可执行的代码脚本，可直接运行而不需要加载到上下文。

**何时使用**：
- 需要确定性执行的任务
- 重复被重写的代码
- 需要高性能的操作

**最佳实践**：
```bash
# 脚本应该有 --help 参数
python scripts/transform.py --help

# 在 SKILL.md 中引导用户
## Helper Scripts

- `scripts/transform.py` - Transform data with custom rules
- `scripts/validate.py` - Validate data against schema

**Always run scripts with --help first** to see usage.
```

**脚本要求**：
- ✅ 必须有 `--help` 参数
- ✅ 必须经过测试
- ✅ 错误处理清晰
- ❌ 不要在 SKILL.md 中重复脚本内容

### assets/ 目录的使用

**用途**: 存储不会加载到上下文，但会在输出中使用的文件。

**何时使用**：
- 模板文件（HTML、React、PPTX 等）
- 图标和 Logo
- 字体文件
- 示例文件

**示例结构**：
```
assets/
├── templates/
│   ├── react-app/
│   │   ├── package.json
│   │   ├── src/
│   │   └── public/
│   └── pptx-template.pptx
├── fonts/
│   ├── Inter.ttf
│   └── Roboto.ttf
└── logos/
    └── company-logo.png
```

---

## 3. YAML Frontmatter 详解

### 必需字段

#### name

**格式**: 小写，用连字符分隔单词

```yaml
# ✅ 好的命名
name: webapp-testing
name: docx-editor
name: mcp-builder

# ❌ 不好的命名
name: WebAppTesting      # 不要使用驼峰命名
name: web_app_testing    # 不要使用下划线
name: test               # 太通用，不具有描述性
```

**命名建议**：
- 使用动词或名词短语
- 清晰表明功能
- 避免过于通用
- 长度控制在 2-4 个单词

#### description

**格式**: 完整的句子，描述功能和触发场景

```yaml
# ✅ 好的描述
description: Guide for creating high-quality MCP servers that enable LLMs to interact with external services. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK).

# ❌ 不好的描述
description: MCP builder  # 太简短
description: This skill helps you build MCP servers and it supports Python and TypeScript and has many features...  # 太冗长
description: A tool for building  # 不清晰
```

**描述应包含**：
1. **功能说明**: Skill 做什么
2. **触发场景**: 何时使用
3. **适用范围**: 支持的框架/语言/场景
4. **关键特性**: 主要功能点

**最佳实践**：
- 以动词开头: "Guide for...", "Toolkit for...", "Comprehensive..."
- 明确触发场景: "Use when...", "Use for..."
- 保持在 200 字符以内（约 2-3 句话）
- 避免技术细节（放在 body 中）

### 可选字段

#### allowed-tools

**作用**: 指定 Skill 可以使用的工具，无需用户批准。

```yaml
---
name: data-processor
description: Process and transform data files
allowed-tools:
  - Read
  - Write
  - Bash
  - WebSearch
---
```

**何时使用**：
- Skill 需要特定工具才能工作
- 希望避免频繁的用户批准
- 工具使用是可预测的

**工具列表**：
- `Read` - 读取文件
- `Write` - 写入文件
- `Edit` - 编辑文件
- `Bash` - 执行命令
- `WebSearch` - 网页搜索
- `Grep` - 搜索内容
- `Glob` - 文件模式匹配

#### model

**作用**: 指定推荐的模型。

```yaml
---
name: complex-analyzer
description: Complex data analysis requiring advanced reasoning
model: claude-opus-4-5-20251101
---
```

**何时使用**：
- Skill 需要特定的模型能力
- 某些功能只在特定模型上可用

#### license

**作用**: 声明许可证。

```yaml
---
name: my-skill
description: My custom skill
license: Apache 2.0
# 或
license: MIT
# 或
license: Proprietary. See LICENSE.txt for details.
---
```

### 字段的格式和限制

#### 格式规则

1. **YAML 语法**
   ```yaml
   # ✅ 正确
   ---
   name: my-skill
   description: A clear description
   ---

   # ❌ 错误 - 缺少分隔符
   name: my-skill
   description: A clear description
   ```

2. **字符串引用**
   ```yaml
   # ✅ 正确 - 不需要引号
   name: my-skill
   description: A description with "quotes"

   # ❌ 不必要
   name: "my-skill"
   ```

3. **多行字符串**
   ```yaml
   # ✅ 使用折叠样式
   description: >
     This is a long description that spans
     multiple lines but is treated as one.
   ```

#### 字段限制

| 字段 | 类型 | 必需 | 最大长度 | 限制 |
|------|------|------|----------|------|
| name | string | ✅ | 50 字符 | 小写、连字符 |
| description | string | ✅ | 500 字符 | 完整句子 |
| allowed-tools | array | ❌ | 无限制 | 有效工具名 |
| model | string | ❌ | 100 字符 | 有效模型名 |
| license | string | ❌ | 200 字符 | 标准许可证 |

### 最佳实践示例

#### 示例 1: 简单 Skill

```yaml
---
name: quick-test
description: Quick testing helper for simple API tests. Use when you need to create basic test cases for REST APIs.
---
```

#### 示例 2: 复杂 Skill

```yaml
---
name: enterprise-deployment
description: Comprehensive deployment automation for enterprise applications. Supports Docker, Kubernetes, and traditional VM deployments with monitoring, logging, and rollback capabilities. Use when deploying production workloads that require high availability and compliance.
allowed-tools:
  - Bash
  - Read
  - Write
license: Proprietary. See LICENSE.txt for terms.
---
```

#### 示例 3: 领域特定 Skill

```yaml
---
name: medical-records
description: HIPAA-compliant medical records processing and analysis. Handles patient data, generates reports, and ensures regulatory compliance. Use for healthcare applications requiring privacy safeguards.
model: claude-opus-4-5-20251101
---
```

---

## 4. 内容写作原则

### 简洁至上原则

**核心理念**: Context window is a public good.

**实践方法**：

1. **假设 Claude 很聪明**
   - 不要解释基础知识
   - 专注于特定领域的专业知识
   - 提供模式而非详细教程

2. **挑战每一句话**
   ```
   问自己: "Claude 真的需要这个解释吗？"
   问自己: "这段话值得消耗这些 tokens 吗？"
   ```

3. **优先示例而非解释**
   ```markdown
   # ❌ 冗长解释
   To create a button, you need to use the `<button>` element. This element is part of HTML and allows users to click on it. You should add text inside the button to label it.

   # ✅ 简洁示例
   ## Create Button
   ```html
   <button>Click me</button>
   ```
   ```

**示例对比**：

| 场景 | 冗长版本 (❌) | 简洁版本 (✅) |
|------|--------------|--------------|
| 安装依赖 | "First, you need to install the package using npm, which is the package manager for Node.js..." | `npm install package-name` |
| 运行脚本 | "To execute the script, you should run the following command in your terminal..." | `./scripts/run.sh` |
| 配置文件 | "Configuration is done through a YAML file where you can specify various options..." | See `config.yaml` for options |

### 渐进式信息披露

**三层加载系统**：

```
Level 1: Metadata (name + description)
  ├─ ~100 words
  ├─ 总是加载
  └─ 用于触发判断

Level 2: SKILL.md body
  ├─ <5,000 words (~800 lines)
  ├─ 触发后加载
  └─ 核心指令

Level 3: Bundled resources
  ├─ Unlimited
  ├─ 按需加载
  └─ 详细文档
```

**实施策略**：

#### 策略 1: 高级指南 + 参考文献

```markdown
# PDF Processing

## Quick Start
Extract text with pdfplumber:
```python
import pdfplumber
pdf = pdfplumber.open("file.pdf")
text = pdf.pages[0].extract_text()
```

## Advanced Features
- **Form filling**: See [FORMS.md](references/FORMS.md) for complete guide
- **API reference**: See [REFERENCE.md](references/REFERENCE.md) for all methods
- **Examples**: See [EXAMPLES.md](references/EXAMPLES.md) for common patterns
```

**优点**：
- SKILL.md 保持精简
- 详细信息按需加载
- 清晰的导航结构

#### 策略 2: 领域分离

对于支持多个领域的 Skill：

```
bigquery-skill/
├── SKILL.md                # 概述和导航
└── references/
    ├── finance.md          # 财务指标
    ├── sales.md            # 销售数据
    ├── product.md          # 产品分析
    └── marketing.md        # 营销活动
```

**SKILL.md**:
```markdown
# BigQuery Analytics

Select the domain you need:
- Finance: See [references/finance.md](references/finance.md)
- Sales: See [references/sales.md](references/sales.md)
- Product: See [references/product.md](references/product.md)
- Marketing: See [references/marketing.md](references/marketing.md)
```

#### 策略 3: 条件细节

```markdown
# DOCX Processing

## Creating documents
Use docx-js for new documents. See [DOCX-JS.md](references/DOCX-JS.md).

## Editing documents
For simple edits, modify the XML directly.

**For tracked changes**: See [REDLINING.md](references/REDLINING.md)
**For OOXML details**: See [OOXML.md](references/OOXML.md)
```

**重要指南**：
- ✅ 保持引用层级扁平（从 SKILL.md 直接链接）
- ✅ 为长文件添加目录（>100 行）
- ❌ 避免深层嵌套引用

### 适当的自由度

根据任务的脆弱性和可变性选择自由度：

#### 高自由度（文本指令）

**适用场景**：
- 多种方法都有效
- 决策依赖上下文
- 启发式方法

**示例**：
```markdown
## Analyze Performance

Identify bottlenecks by:
1. Review query execution plans
2. Check index usage
3. Analyze slow query logs

Choose optimization strategy based on findings.
```

#### 中等自由度（伪代码或参数化脚本）

**适用场景**：
- 存在首选模式
- 一定变化可接受
- 配置影响行为

**示例**：
```python
# Template for API integration
def integrate_api(endpoint, auth_method, timeout=30):
    # 1. Setup authentication
    # 2. Configure timeout and retries
    # 3. Handle errors gracefully
    pass
```

#### 低自由度（特定脚本，少参数）

**适用场景**：
- 操作脆弱且易出错
- 一致性至关重要
- 必须遵循特定序列

**示例**：
```bash
# Critical deployment - must follow exact order
./scripts/deploy.sh \
  --environment production \
  --version 1.2.3 \
  --skip-backup false
```

**路径隐喻**：
- 高自由度 = 开阔田野（多条路径）
- 中等自由度 = 标记路径（推荐路线）
- 低自由度 = 独木桥（严格护栏）

### 避免的反模式

#### ❌ 反模式 1: 重复信息

```markdown
# 在 SKILL.md 中
## API Reference
See [api.md](references/api.md) for complete API docs.

The API includes methods for:
- Creating users
- Updating users
- Deleting users

# 然后在 api.md 中重复
# API Reference

## Creating Users
To create a user...

## Updating Users
To update a user...

## Deleting Users
To delete a user...
```

**✅ 正确做法**：
```markdown
# SKILL.md
## API Reference
See [references/api.md](references/api.md) for complete API documentation.

# references/api.md
# API Reference

## Methods
- create_user()
- update_user()
- delete_user()
[详细文档]
```

#### ❌ 反模式 2: 过度解释

```markdown
## Install Dependencies

First, open your terminal. The terminal is a command-line interface
that allows you to interact with your computer. To open it, you can
press Ctrl+Alt+T on Linux or Cmd+Space on Mac and type "Terminal".

Once the terminal is open, navigate to your project directory using
the `cd` command. The `cd` command stands for "change directory"...
```

**✅ 正确做法**：
```markdown
## Install Dependencies

```bash
npm install
```
```

#### ❌ 反模式 3: 缺少上下文

```markdown
# 没有任何上下文
## Process Data

```python
process(data)
```
```

**✅ 正确做法**：
```markdown
## Process Data

Transform raw input into structured output:

```python
from skill.processor import process

result = process(data)  # Returns formatted dict
```

**Input**: Raw CSV data
**Output**: Structured JSON with validated fields
```

#### ❌ 反模式 4: 深层嵌套

```markdown
# SKILL.md
See [ADVANCED.md](references/ADVANCED.md)

# references/ADVANCED.md
For patterns, see [patterns/integration.md](patterns/integration.md)

# references/patterns/integration.md
For details, see [complete-guide.md](complete-guide.md)
```

**✅ 正确做法**：
```markdown
# SKILL.md
## Advanced Topics
- Integration patterns: See [integration.md](references/integration.md)
- Error handling: See [errors.md](references/errors.md)
- Performance: See [performance.md](references/performance.md)
```

---

## 5. 技巧和最佳实践

### 如何编写有效的 description

#### 公式：功能 + 场景 + 关键特性

```yaml
description: [动词] [对象] for [目的]. Use when [场景1], [场景2], or [场景3].
```

#### 实战示例

**示例 1: 开发工具**
```yaml
# ✅ 优秀
description: >
  Guide for creating high-quality MCP servers that enable LLMs to interact
  with external services through well-designed tools. Use when building MCP
  servers to integrate external APIs or services, whether in Python (FastMCP)
  or Node/TypeScript (MCP SDK).

# 分析:
# - 功能: "Guide for creating high-quality MCP servers"
# - 目的: "enable LLMs to interact with external services"
# - 场景: "building MCP servers to integrate external APIs"
# - 关键信息: 支持 Python 和 TypeScript
```

**示例 2: 文档工具**
```yaml
# ✅ 优秀
description: >
  Comprehensive document creation, editing, and analysis with support for
  tracked changes, comments, formatting preservation, and text extraction.
  Use when Claude needs to work with professional documents (.docx files)
  for: (1) Creating new documents, (2) Modifying or editing content,
  (3) Working with tracked changes, (4) Adding comments.

# 分析:
# - 功能: "Comprehensive document creation, editing, and analysis"
# - 特性: "tracked changes, comments, formatting preservation"
# - 具体场景: 4个编号的使用场景
# - 文件格式: 明确指出 .docx
```

**示例 3: 测试工具**
```yaml
# ✅ 优秀
description: >
  Toolkit for interacting with and testing local web applications using
  Playwright. Supports verifying frontend functionality, debugging UI
  behavior, capturing browser screenshots, and viewing browser logs.

# 分析:
# - 功能: "Toolkit for interacting with and testing"
# - 对象: "local web applications"
# - 工具: "Playwright"
# - 关键特性: 4个主要功能点
```

#### 描述质量检查清单

- [ ] 是否说明了 Skill 做什么？
- [ ] 是否明确了何时使用？
- [ ] 是否包含关键特性？
- [ ] 是否指出了支持的框架/语言？
- [ ] 是否在 200 字符以内？
- [ ] 是否以动词开头？
- [ ] 是否避免技术细节（应放在 body 中）？

### 如何设置 allowed-tools

#### 原则：最小权限原则

只授予 Skill 完成任务所需的最低权限。

#### 场景示例

**场景 1: 只读分析**
```yaml
---
name: log-analyzer
description: Analyze application logs to identify issues
allowed-tools:
  - Read      # 读取日志文件
  - Grep      # 搜索日志内容
---

# ✅ 不需要 Write, Bash 等权限
```

**场景 2: 代码生成**
```yaml
---
name: api-generator
description: Generate REST API boilerplate code
allowed-tools:
  - Read      # 读取现有代码
  - Write     # 生成新文件
  - Glob      # 查找文件
  - Grep      # 搜索模式
---

# ✅ 不需要 Bash（不执行代码）
```

**场景 3: 部署自动化**
```yaml
---
name: deploy-app
description: Deploy applications to production
allowed-tools:
  - Bash      # 执行部署命令
  - Read      # 读取配置
  - Write     # 更新版本文件
  - Edit      # 修改配置
---

# ✅ 需要完整权限
```

#### 工具选择指南

| 工具 | 用途 | 何时需要 |
|------|------|----------|
| Read | 读取文件内容 | 几乎总是需要 |
| Write | 创建新文件 | 生成代码/文档 |
| Edit | 编辑现有文件 | 修改配置/代码 |
| Bash | 执行命令 | 部署/测试/运行脚本 |
| Grep | 搜索内容 | 代码分析/日志分析 |
| Glob | 文件匹配 | 查找文件类型 |
| WebSearch | 网页搜索 | 获取最新信息 |

### 如何组织多文件结构

#### 结构决策树

```
Skill 有多种变体/框架？
├─ 是 → 按变体分离
│  └─ references/
│      ├── framework-a.md
│      ├── framework-b.md
│      └── framework-c.md
│
└─ 否 → Skill 有多个领域？
   ├─ 是 → 按领域分离
   │  └─ references/
   │      ├── domain-1.md
   │      └── domain-2.md
   │
   └─ 否 → 按复杂度分离
      └─ references/
          ├── quick-start.md
          ├── advanced.md
          └── troubleshooting.md
```

#### 实战示例

**示例 1: 多框架 Skill**
```
react-validator/
├── SKILL.md
└── references/
    ├── formik.md      # Formik 集成
    ├── react-hook-form.md  # React Hook Form 集成
    └── custom.md      # 自定义验证
```

**SKILL.md**:
```markdown
# React Form Validation

Choose your validation library:

## Formik
See [references/formik.md](references/formik.md)

## React Hook Form
See [references/react-hook-form.md](references/react-hook-form.md)

## Custom Implementation
See [references/custom.md](references/custom.md)
```

**示例 2: 多领域 Skill**
```
bigquery-analytics/
├── SKILL.md
└── references/
    ├── finance.md      # 财务分析查询
    ├── marketing.md    # 营销活动分析
    ├── product.md      # 产品使用数据
    └── infrastructure.md  # 基础设施监控
```

**SKILL.md**:
```markdown
# BigQuery Analytics Guide

## Domain-Specific Queries

Select your domain:

- **Finance**: Revenue, billing, financial metrics
  → [references/finance.md](references/finance.md)

- **Marketing**: Campaigns, attribution, conversions
  → [references/marketing.md](references/marketing.md)

- **Product**: Usage, features, engagement
  → [references/product.md](references/product.md)

- **Infrastructure**: Monitoring, performance, uptime
  → [references/infrastructure.md](references/infrastructure.md)
```

### 如何处理代码模板

#### 策略 1: 小模板 - 内联在 SKILL.md

```markdown
## Quick Start

Create a simple component:

```tsx
function Hello({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>
}
```
```

#### 策略 2: 中等模板 - 放在 assets/

```
skill/
├── SKILL.md
└── assets/
    └── templates/
        └── react-component/
            ├── src/
            │   └── Component.tsx
            ├── package.json
            └── tsconfig.json
```

**SKILL.md**:
```markdown
## Create Component

Copy the template from `assets/templates/react-component/` and customize:

```bash
cp -r assets/templates/react-component ./my-component
cd my-component
npm install
```
```

#### 策略 3: 大模板 - 使用脚本生成

```bash
# scripts/generate-app.sh
#!/bin/bash
# 生成完整的应用模板
```

**SKILL.md**:
```markdown
## Generate Application

```bash
./scripts/generate-app.sh --name my-app --type web
```

Available types: web, api, worker, cli
```

### 如何添加自动化脚本

#### 脚本设计原则

1. **必须有 --help**
2. **清晰的错误消息**
3. **幂等性（可重复运行）**
4. **良好的退出码**

#### 示例脚本

```bash
#!/bin/bash
# scripts/setup-env.sh

set -euo pipefail

# 默认值
ENVIRONMENT="development"
REGION="us-east-1"

# 帮助信息
show_help() {
    cat << EOF
Setup environment configuration

Usage: $0 [OPTIONS]

Options:
    -e, --environment ENV    Environment (default: development)
    -r, --region REGION      AWS region (default: us-east-1)
    -h, --help              Show this help

Example:
    $0 -e production -r us-west-2
EOF
}

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# 主要逻辑
echo "Setting up $ENVIRONMENT environment in $REGION..."

# 配置文件生成
cat > .env << EOF
ENVIRONMENT=$ENVIRONMENT
REGION=$REGION
EOF

echo "✓ Environment configured successfully"
```

**在 SKILL.md 中引用**：

```markdown
## Setup Environment

```bash
./scripts/setup-env.sh --help
```

For production:

```bash
./scripts/setup-env.sh -e production -r us-west-2
```
```

### 命名规范建议

#### Skill 名称

```
[动词]-[对象]-[可选限定词]

示例:
- webapp-testing
- docx-editor
- mcp-builder
- data-validator
- api-client-generator
```

#### 脚本命名

```
[动作]-[对象].sh

动作:
- setup, init, create
- build, compile, generate
- deploy, publish, release
- test, verify, validate
- clean, remove, delete

示例:
- setup-env.sh
- build-project.sh
- deploy-app.sh
- test-integration.sh
- clean-cache.sh
```

#### 参考文件命名

```
[主题].md 或 [主题]-[子主题].md

示例:
- api.md
- workflows.md
- troubleshooting.md
- react-integration.md
- advanced-patterns.md
```

#### 资源文件命名

```
assets/
├── templates/        # 模板
├── fonts/           # 字体
├── icons/           # 图标
└── examples/        # 示例
```

---

## 6. 实战示例

### 示例 1: 开发工具类 Skill

**功能**: 代码生成和重构

**结构**:
```
react-component-builder/
├── SKILL.md
├── scripts/
│   ├── generate-component.sh
│   └── validate-types.sh
├── references/
│   ├── patterns.md
│   └── best-practices.md
└── assets/
    └── templates/
        └── component/
            ├── Component.tsx
            ├── Component.test.tsx
            └── index.ts
```

**SKILL.md**:
```markdown
---
name: react-component-builder
description: Generate and refactor React components with TypeScript, testing, and best practices. Use when creating new components, adding features to existing components, or modernizing legacy React code.
---

# React Component Builder

## Quick Start

Generate a new component:

```bash
./scripts/generate-component.sh --name UserCard --type functional
```

This creates:
- `UserCard.tsx` - Component with TypeScript types
- `UserCard.test.tsx` - Jest test setup
- `index.ts` - Export barrel

## Component Patterns

For common patterns, see [references/patterns.md](references/patterns.md):
- Presentational vs Container components
- Custom hooks for logic reuse
- Context for state management
- Compound components

## Best Practices

See [references/best-practices.md](references/best-practices.md) for:
- TypeScript typing strategies
- Performance optimization
- Testing approaches
- Accessibility guidelines

## Refactoring

Modernize existing components:

```bash
./scripts/generate-component.sh --refactor --path ./src/old/Button.tsx
```

This updates:
- Convert class → functional component
- Add TypeScript types
- Add hooks for state/effects
- Create corresponding test file
```

**scripts/generate-component.sh**:
```bash
#!/bin/bash
# Component generation script with full --help support
```

**references/patterns.md**:
```markdown
# Component Patterns

## Presentational Components

Focus on UI, receive data via props:

```tsx
interface UserCardProps {
  name: string
  email: string
  avatar?: string
}

export function UserCard({ name, email, avatar }: UserCardProps) {
  return (
    <div className="user-card">
      {avatar && <img src={avatar} alt={name} />}
      <h3>{name}</h3>
      <p>{email}</p>
    </div>
  )
}
```

[更多模式...]
```

### 示例 2: 测试类 Skill

**功能**: 集成测试指南

**结构**:
```
integration-test-guide/
├── SKILL.md
├── scripts/
│   ├── setup-test-env.sh
│   └── run-tests.sh
├── references/
│   ├── testing-strategies.md
│   ├── assertions.md
│   └── troubleshooting.md
└── examples/
    ├── api-testing.example.ts
    └── ui-testing.example.ts
```

**SKILL.md**:
```markdown
---
name: integration-test-guide
description: Comprehensive guide for writing integration tests with clear workflows, assertions, and debugging strategies. Use when creating test plans, writing integration tests, debugging test failures, or setting up test infrastructure.
---

# Integration Testing Guide

## Testing Workflow

1. **Plan**: Define test scenarios
2. **Setup**: Configure test environment
3. **Write**: Implement test cases
4. **Run**: Execute tests and review results
5. **Debug**: Analyze failures and fix issues

## Quick Start

Setup test environment:

```bash
./scripts/setup-test-env.sh --help
```

Run specific test suite:

```bash
./scripts/run-tests.sh --suite integration --filter "user auth"
```

## Testing Strategies

See [references/testing-strategies.md](references/testing-strategies.md):
- API endpoint testing
- Database integration
- Third-party service mocking
- State management testing
- Error scenario coverage

## Assertions

See [references/assertions.md](references/assertions.md) for:
- Response validation
- State verification
- Async assertions
- Error message checking

## Troubleshooting

See [references/troubleshooting.md](references/troubleshooting.md) for:
- Common failure patterns
- Timeout issues
- Race conditions
- Environment setup problems

## Examples

- **API Testing**: [examples/api-testing.example.ts](examples/api-testing.example.ts)
- **UI Testing**: [examples/ui-testing.example.ts](examples/ui-testing.example.ts)
```

### 示例 3: 文档类 Skill

**功能**: API 文档生成

**结构**:
```
api-doc-generator/
├── SKILL.md
├── scripts/
│   ├── extract-endpoints.py
│   └── generate-docs.py
├── references/
│   ├── openapi-spec.md
│   └── style-guide.md
└── assets/
    └── templates/
        └── api-doc.html
```

**SKILL.md**:
```markdown
---
name: api-doc-generator
description: Generate comprehensive API documentation from code annotations, OpenAPI specs, or example requests. Use when documenting REST APIs, creating API references, or maintaining developer portals.
---

# API Documentation Generator

## Overview

Generate API docs from:
- OpenAPI/Swagger specs
- Code annotations
- Example requests/responses

## Quick Start

Generate from OpenAPI spec:

```bash
./scripts/generate-docs.py \
  --input openapi.json \
  --output ./docs/api \
  --template assets/templates/api-doc.html
```

Extract endpoints from code:

```bash
./scripts/extract-endpoints.py \
  --source ./src/api \
  --output endpoints.json
```

## Documentation Standards

See [references/style-guide.md](references/style-guide.md):
- Endpoint description format
- Parameter documentation
- Response schema documentation
- Example request/response format

## OpenAPI Integration

See [references/openapi-spec.md](references/openapi-spec.md):
- Spec structure
- Common fields
- Extensions
- Validation

## Template Customization

Edit `assets/templates/api-doc.html` to customize:
- Styling and branding
- Section organization
- Code highlighting
- Interactive elements
```

### 示例 4: 部署类 Skill

**功能**: CI/CD 配置

**结构**:
```
deployment-automation/
├── SKILL.md
├── scripts/
│   ├── setup-ci.sh
│   ├── deploy.sh
│   └── rollback.sh
├── references/
│   ├── github-actions.md
│   ├── kubernetes.md
│   └── monitoring.md
└── assets/
    └── workflows/
        ├── ci.yml
        ├── deploy.yml
        └── rollback.yml
```

**SKILL.md**:
```markdown
---
name: deployment-automation
description: Automated deployment workflows for CI/CD, infrastructure provisioning, and release management. Supports GitHub Actions, Kubernetes, and traditional VM deployments with monitoring and rollback capabilities.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Deployment Automation

## Deployment Strategy

Choose your deployment method:

### GitHub Actions
See [references/github-actions.md](references/github-actions.md)
Setup: `./scripts/setup-ci.sh --platform github`

### Kubernetes
See [references/kubernetes.md](references/kubernetes.md)
Setup: `./scripts/setup-ci.sh --platform k8s`

### Traditional VM
See workflow in this file for manual deployment

## Quick Start

**Deploy to production**:

```bash
./scripts/deploy.sh \
  --environment production \
  --version $(git rev-parse --short HEAD) \
  --skip-tests false
```

**Rollback**:

```bash
./scripts/rollback.sh \
  --environment production \
  --to-version <previous-version>
```

## Monitoring

See [references/monitoring.md](references/monitoring.md) for:
- Health checks
- Log aggregation
- Metrics collection
- Alert setup

## Workflow Templates

Copy and customize from `assets/workflows/`:
- `ci.yml` - Continuous integration
- `deploy.yml` - Deployment pipeline
- `rollback.yml` - Rollback procedures
```

### 示例 5: 数据处理类 Skill

**功能**: 数据转换和验证

**结构**:
```
data-processor/
├── SKILL.md
├── scripts/
│   ├── transform.py
│   ├── validate.py
│   └── convert.py
├── references/
│   ├── schemas.md
│   ├── transformations.md
│   └── validation-rules.md
└── assets/
    └── schemas/
        ├── user.schema.json
        └── event.schema.json
```

**SKILL.md**:
```markdown
---
name: data-processor
description: Transform, validate, and convert data between formats with schema validation and custom transformation rules. Supports JSON, CSV, XML, and YAML with extensible validation.
---

# Data Processing

## Quick Start

Validate data against schema:

```bash
./scripts/validate.py \
  --input data.json \
  --schema assets/schemas/user.schema.json
```

Transform data:

```bash
./scripts/transform.py \
  --input data.csv \
  --output data.json \
  --mapping assets/mappings/user-mapping.json
```

Convert formats:

```bash
./scripts/convert.py \
  --input data.yaml \
  --output data.json \
  --format json
```

## Schemas

See [references/schemas.md](references/schemas.md):
- JSON Schema syntax
- Custom validation rules
- Schema composition
- Schema inheritance

Available schemas:
- `user.schema.json` - User data
- `event.schema.json` - Event tracking

## Transformations

See [references/transformations.md](references/transformations.md):
- Field mapping
- Data type conversion
- Conditional transformations
- Custom Python functions

## Validation Rules

See [references/validation-rules.md](references/validation-rules.md):
- Required fields
- Data type checks
- Range validation
- Pattern matching
- Custom validators
```

---

## 7. 调试和验证

### 如何测试 Skill 是否工作

#### 方法 1: 使用 Claude Code CLI

```bash
# 1. 将 Skill 放在项目目录
mkdir -p .claude/skills/my-skill
cp -r my-skill/* .claude/skills/my-skill/

# 2. 启动 Claude Code
cd /path/to/project
claude

# 3. 检查 Skill 是否加载
/available_skills

# 4. 测试触发
> Use my-skill to do something
```

#### 方法 2: 本地验证脚本

```bash
#!/bin/bash
# scripts/validate-skill.sh

echo "Validating Skill structure..."

# 检查必需文件
if [ ! -f "SKILL.md" ]; then
  echo "❌ Missing SKILL.md"
  exit 1
fi

# 检查 YAML frontmatter
if ! grep -q "^---" SKILL.md; then
  echo "❌ Missing YAML frontmatter"
  exit 1
fi

# 检查必需字段
if ! grep -q "^name:" SKILL.md; then
  echo "❌ Missing 'name' field"
  exit 1
fi

if ! grep -q "^description:" SKILL.md; then
  echo "❌ Missing 'description' field"
  exit 1
fi

# 检查脚本权限
if [ -d "scripts" ]; then
  for script in scripts/*; do
    if [ -f "$script" ]; then
      if [ ! -x "$script" ]; then
        echo "⚠️  Script not executable: $script"
        chmod +x "$script"
      fi
    fi
  done
fi

echo "✅ Skill validation passed"
```

#### 方法 3: 实际任务测试

创建测试场景，检查 Skill 是否正确触发和执行：

```
测试清单:
[ ] Skill 在正确的时机触发
[ ] SKILL.md 内容被加载
[ ] References 文件按需加载
[ ] Scripts 可以正确执行
[ ] Assets 文件可访问
[ ] 输出符合预期
```

### 常见错误信息

#### 错误 1: Skill 未触发

**症状**: 提到 Skill 但没有响应

**原因**:
- Description 不够清晰
- 触发词不明确
- Skill 名称不匹配

**解决**:
```yaml
# ❌ 不好的描述
description: A tool for testing

# ✅ 好的描述
description: Toolkit for testing web applications using Playwright.
Use when debugging UI behavior, capturing screenshots, or automating browser interactions.
```

#### 错误 2: YAML 解析失败

**症状**: Frontmatter error

**原因**:
- YAML 语法错误
- 缺少分隔符
- 特殊字符未转义

**解决**:
```yaml
# ❌ 错误
name: my-skill: test
description: This has "quotes" and 'apostrophes'

# ✅ 正确
name: my-skill-test
description: This has properly escaped quotes
```

#### 错误 3: 脚本权限问题

**症状**: Permission denied

**解决**:
```bash
chmod +x scripts/*.sh
chmod +x scripts/*.py
```

#### 错误 4: 路径引用错误

**症状**: File not found

**原因**:
- 相对路径错误
- 路径分隔符问题（Windows）

**解决**:
```markdown
# ❌ 错误
See ./references/api.md

# ✅ 正确
See [references/api.md](references/api.md)
```

#### 错误 5: Context overflow

**症状**: Token limit exceeded

**原因**:
- SKILL.md 太长
- 一次性加载太多 references

**解决**:
- 保持 SKILL.md < 500 行
- 使用渐进式加载
- 将详细内容移到 references

### 如何优化触发词

#### 策略 1: 包含关键词

在 description 中包含用户可能说的关键词：

```yaml
description: >
  Generate REST API clients from OpenAPI specifications.
  Use for: API client generation, SDK creation, HTTP wrapper code,
  REST client boilerplate, API integration setup.

# 关键词:
# - "API client"
# - "SDK"
# - "REST"
# - "integration"
```

#### 策略 2: 明确场景

```yaml
description: >
  Process PDF forms and extract field data.
  Use when: working with PDF forms, extracting form fields,
  filling PDF forms programmatically, analyzing PDF structure.

# 场景:
# - "working with PDF forms"
# - "extracting form fields"
# - "filling forms"
```

#### 策略 3: 技术栈标识

```yaml
description: >
  Build and deploy Kubernetes applications with Helm charts.
  Supports k8s, helm, containers, docker, and orchestration.
  Use for container deployment, k8s configuration, helm releases.

# 技术栈:
# - Kubernetes, k8s
# - Helm
# - Docker, containers
```

### 性能优化建议

#### 优化 1: 减少 SKILL.md 大小

```markdown
# ❌ 之前: 800 行的 SKILL.md
# 包含所有详细说明

# ✅ 优化后: 200 行的 SKILL.md + references/
# SKILL.md 只有核心流程和导航

## Advanced Topics
See [references/advanced.md](references/advanced.md)
```

**收益**: 从 5000 tokens 降到 1200 tokens

#### 优化 2: 使用脚本而非内联代码

```markdown
# ❌ 之前: 在 SKILL.md 中包含完整脚本
## Setup
```python
# 100 lines of setup code
def setup_project():
    # ...
```

# ✅ 优化后: 引用脚本
## Setup
```bash
./scripts/setup.sh --help
```

# 脚本不会加载到上下文，直接执行
```

**收益**: 节省数百 tokens

#### 优化 3: 条件加载 references

```markdown
# ✅ 优化后: 按需加载

## Configuration

For basic setup, use default config.

**For advanced configuration**: See [references/config.md](references/config.md)
**For environment variables**: See [references/env.md](references/env.md)

# 只在需要时加载详细文档
```

**收益**: 平均节省 60-80% 的 reference tokens

#### 优化 4: 避免重复

```markdown
# ❌ 之前: 在多个地方重复说明

# SKILL.md
## Authentication
Use OAuth 2.0 with bearer tokens...

# references/api.md
## Authentication
OAuth 2.0 with bearer tokens...

# ✅ 优化后: 单一信息源

# SKILL.md
## Authentication
See [references/auth.md](references/auth.md)

# references/auth.md
# OAuth 2.0 Authentication
[detailed explanation]
```

**收益**: 消除重复，减少混淆

---

## 8. 迁移指南

### 从旧的单文件迁移到多文件结构

#### 迁移前

```markdown
# big-skill.md (2000 行)

---
name: big-skill
description: A very long skill with everything
---

## Section 1
(200 lines of content)

## Section 2
(300 lines of content)

## Section 3
(500 lines of content)

...
```

#### 迁移步骤

**Step 1: 创建目录结构**

```bash
mkdir -p big-skill/{scripts,references,assets}
```

**Step 2: 提取核心内容到 SKILL.md**

```markdown
# SKILL.md (150 lines)

---
name: big-skill
description: A well-organized skill with progressive disclosure
---

# Big Skill

## Quick Start
[Brief overview and basic usage]

## Main Topics
- **Topic 1**: See [references/topic1.md](references/topic1.md)
- **Topic 2**: See [references/topic2.md](references/topic2.md)
- **Topic 3**: See [references/topic3.md](references/topic3.md)

## Scripts
- `scripts/process.sh` - Process data
- `scripts/validate.sh` - Validate input
```

**Step 3: 移动详细内容到 references/**

```bash
# references/topic1.md
# Topic 1

[原 Section 1 的内容]

# references/topic2.md
# Topic 2

[原 Section 2 的内容]
```

**Step 4: 提取代码到 scripts/**

```bash
# scripts/process.sh
#!/bin/bash
# [从 SKILL.md 提取的代码]
```

**Step 5: 测试**

```bash
# 验证所有链接有效
# 测试所有脚本可运行
# 确保 Skill 正常触发
```

### 从普通 Markdown 文档迁移到 Skill

#### 迁移前: README.md

```markdown
# My Project

This project does X, Y, Z.

## Installation
...

## Usage
...

## API Reference
...

## Troubleshooting
...
```

#### 迁移到 Skill

**Step 1: 添加 Frontmatter**

```markdown
---
name: my-project
description: Setup and use My Project for X, Y, Z. Use when initializing the project, configuring features, or troubleshooting issues.
---

# My Project Guide

## Quick Start
[最简化的开始步骤]

## Installation
[安装步骤]

## Usage
[基本用法]

## Detailed Topics
- **Configuration**: See [references/config.md](references/config.md)
- **API**: See [references/api.md](references/api.md)
- **Troubleshooting**: See [references/troubleshooting.md](references/troubleshooting.md)
```

**Step 2: 移动详细内容**

```bash
# references/config.md
[原 README 的详细配置部分]

# references/api.md
[原 README 的 API 部分]

# references/troubleshooting.md
[原 README 的故障排查部分]
```

**关键差异**：

| 方面 | README | Skill |
|------|--------|-------|
| 目标受众 | 人类开发者 | AI (Claude) |
| 触发方式 | 手动查找 | 自然语言触发 |
| 信息组织 | 线性阅读 | 渐进式加载 |
| 详细程度 | 完整说明 | 指令 + 参考文献 |

### 从脚本迁移到 Skill

#### 迁移前: 独立脚本

```bash
#!/bin/bash
# deploy.sh - Deploy application to production

# [100 lines of deployment logic]
```

#### 迁移到 Skill

**Step 1: 创建 Skill 结构**

```bash
deployer/
├── SKILL.md
└── scripts/
    ├── deploy.sh      # 原脚本
    └── rollback.sh    # 新增
```

**Step 2: 编写 SKILL.md**

```markdown
---
name: deployer
description: Automated deployment with health checks and rollback capabilities. Use when deploying applications to production, staging, or development environments.
---

# Application Deployment

## Deploy

```bash
./scripts/deploy.sh --environment production
```

Options:
- `--environment`: production, staging, development
- `--version`: Specific version to deploy
- `--skip-tests`: Skip test suite

## Rollback

If deployment fails:

```bash
./scripts/rollback.sh --environment production
```

## Workflow

1. Pre-deployment checks
2. Run tests (unless skipped)
3. Build application
4. Deploy to environment
5. Health check
6. Rollback on failure
```

**Step 3: 增强脚本**

```bash
#!/bin/bash
# scripts/deploy.sh

# 添加 --help
show_help() {
  cat << EOF
Deploy application to specified environment

Usage: $0 [OPTIONS]

Options:
  -e, --environment ENV   Target environment
  -v, --version VER       Version to deploy
  -s, --skip-tests        Skip test suite
  -h, --help             Show this help

Example:
  $0 -e production -v v1.2.3
EOF
}
```

**收益**：

| 之前 | 之后 |
|------|------|
| 手动执行脚本 | 自然语言触发 |
| 需要记住参数 | Claude 理解意图 |
| 独立工具 | 集成到工作流 |
| 无文档 | 自文档化 |

---

## 9. 检查清单

### Skill 质量检查清单

使用此清单确保你的 Skill 达到高质量标准。

#### Frontmatter 检查

- [ ] **YAML 格式正确**
  - [ ] 使用 `---` 分隔符
  - [ ] 缩进正确（2 空格）
  - [ ] 无语法错误

- [ ] **name 字段**
  - [ ] 小写字母
  - [ ] 使用连字符分隔
  - [ ] 具有描述性（2-4 个单词）
  - [ ] 长度 < 50 字符

- [ ] **description 字段**
  - [ ] 说明功能（做什么）
  - [ ] 明确触发场景（何时用）
  - [ ] 包含关键特性
  - [ ] 长度 < 500 字符
  - [ ] 以动词开头
  - [ ] 完整句子

- [ ] **可选字段（如适用）**
  - [ ] allowed-tools 合理设置
  - [ ] license 正确声明
  - [ ] model 指定（如需要）

#### 内容结构检查

- [ ] **SKILL.md 大小**
  - [ ] 总行数 < 500 行
  - [ ] 核心内容在前 50 行
  - [ ] 详细内容移到 references/

- [ ] **Quick Start**
  - [ ] 在文件开头
  - [ ] 5 步以内可开始
  - [ ] 有可运行的示例

- [ ] **渐进式信息披露**
  - [ ] 基础内容在 SKILL.md
  - [ ] 详细内容在 references/
  - [ ] 高级内容明确标记
  - [ ] 引用层级扁平（1 层）

- [ ] **导航清晰**
  - [ ] 有目录或概述
  - [ ] 引用链接有效
  - [ ] 每个章节有明确标题

#### 写作质量检查

- [ ] **简洁性**
  - [ ] 无冗余解释
  - [ ] 优先示例而非说明
  - [ ] 避免"你好"、"请注意"等客套话
  - [ ] 假设 Claude 很聪明

- [ ] **指令清晰**
  - [ ] 使用祈使句（"创建"、"运行"、"检查"）
  - [ ] 步骤编号明确
  - [ ] 有明确的决策树
  - [ ] 包含预期结果

- [ ] **代码示例**
  - [ ] 可运行（无省略）
  - [ ] 有注释解释关键部分
  - [ ] 包含必要导入
  - [ ] 格式一致

#### 文件组织检查

- [ ] **目录结构**
  - [ ] 有 SKILL.md
  - [ ] scripts/ 用于可执行代码
  - [ ] references/ 用于文档
  - [ ] assets/ 用于模板/资源

- [ ] **scripts/ 检查**
  - [ ] 所有脚本有执行权限
  - [ ] 所有脚本有 --help
  - [ ] 脚本已测试
  - [ ] 错误处理清晰

- [ ] **references/ 检查**
  - [ ] 长文件有目录
  - [ ] 从 SKILL.md 链接
  - [ ] 无重复内容
  - [ ] 命名清晰

- [ ] **assets/ 检查**
  - [ ] 模板可直接使用
  - [ ] 文件格式正确
  - [ ] 无敏感信息

#### 功能测试检查

- [ ] **触发测试**
  - [ ] Skill 在预期场景触发
  - [ ] Description 包含关键词
  - [ ] 不在无关场景触发

- [ ] **执行测试**
  - [ ] Quick Start 可运行
  - [ ] 示例代码可执行
  - [ ] 脚本输出符合预期

- [ ] **链接测试**
  - [ ] 所有内部链接有效
  - [ ] references/ 文件存在
  - [ ] scripts/ 可访问

#### 常见问题检查

- [ ] **避免的问题**
  - [ ] 无 README.md 等额外文档
  - [ ] 无时间敏感信息（如"最新版本"）
  - [ ] 无相对路径（使用正斜杠）
  - [ ] 无硬编码路径（使用变量）
  - [ ] 无重复内容

- [ ] **性能优化**
  - [ ] SKILL.md < 500 行
  - [ ] References 按需加载
  - [ ] 脚本不读入上下文
  - [ ] 无大段内联代码

#### 文档完整性检查

- [ ] **必需章节**
  - [ ] Quick Start
  - [ ] 主要工作流
  - [ ] 示例

- [ ] **可选章节（如适用）**
  - [ ] Troubleshooting
  - [ ] FAQ
  - [ ] Advanced topics
  - [ ] Migration guide

- [ ] **元信息**
  - [ ] LICENSE.txt（如非开源）
  - [ ] 版本信息（如需要）
  - [ ] 更新日期（如需要）

### 评分标准

使用此标准评估 Skill 质量：

| 维度 | 权重 | 评分标准 |
|------|------|----------|
| **Description 质量** | 20% | 清晰、完整、包含触发场景 |
| **内容组织** | 25% | 结构清晰、渐进式加载、无冗余 |
| **简洁性** | 20% | Token 高效、无废话、示例驱动 |
| **可执行性** | 20% | Quick Start 有效、示例可运行、脚本有 --help |
| **完整性** | 15% | 必需元素齐全、无常见问题 |

**等级划分**：
- 90-100%: 优秀，可直接使用
- 75-89%: 良好，小幅改进
- 60-74%: 及格，需要改进
- <60%: 不及格，需要重构

---

## 10. 参考资源

### 官方文档

#### Claude Code Docs
- **Agent Skills Overview**: https://code.claude.com/docs/en/skills
  - 官方 Skills 文档
  - 使用指南和最佳实践

- **Agent Skills Specification**: https://agentskills.io/specification
  - Skills 标准规范
  - 技术细节和格式要求

#### Anthropic Engineering Blog
- **Equipping agents for the real world with Agent Skills** (Oct 2025)
  https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
  - Skills 设计原理
  - 渐进式信息披露

- **Claude Code: Best practices for agentic coding** (Apr 2025)
  https://www.anthropic.com/engineering/claude-code-best-practices
  - Claude Code 最佳实践
  - 包含 Skills 使用建议

### 官方 GitHub 仓库

#### anthropics/skills
- **仓库**: https://github.com/anthropics/skills
- **描述**: 官方 Skills 示例集合
- **包含**:
  - 文档处理 Skills (docx, pdf, pptx, xlsx)
  - Web 测试 Skill (webapp-testing)
  - 设计 Skills (brand-guidelines, canvas-design)
  - 开发 Skills (mcp-builder, skill-creator)

**值得学习的 Skills**：

1. **skill-creator** - 创建 Skills 的指南
   - 完整的 Skill 创建流程
   - 最佳实践示例
   - 参考: https://github.com/anthropics/skills/tree/main/skills/skill-creator

2. **mcp-builder** - MCP 服务器开发
   - 多文件结构示例
   - 详细的 references 组织
   - 参考: https://github.com/anthropics/skills/tree/main/skills/mcp-builder

3. **webapp-testing** - Web 应用测试
   - Scripts 使用示例
   - 决策树模式
   - 参考: https://github.com/anthropics/skills/tree/main/skills/webapp-testing

4. **docx** - Word 文档处理
   - 复杂工作流示例
   - 条件加载模式
   - 参考: https://github.com/anthropics/skills/tree/main/skills/docx

### 社区资源

#### Awesome Lists
- **awesome-claude-skills**: https://github.com/travisvn/awesome-claude-skills
  - 精选 Skills 列表
  - 分类整理
  - 定期更新

#### Reddit 社区
- **r/ClaudeCode**: https://reddit.com/r/ClaudeCode
  - Claude Code 社区
  - Skills 分享和讨论
  - 问题解答

- **r/ClaudeAI**: https://reddit.com/r/ClaudeAI
  - Claude AI 社区
  - Skills 创意分享

#### 博客和教程

1. **"Claude Agent Skills: A First Principles Deep Dive"** by Han Lee
   https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/
   - Skills 深度分析
   - 技术原理解释

2. **"Claude Skills Tutorial: Give Your AI Superpowers"** by Sid Bharath
   https://www.siddharthbharath.com/claude-skills/
   - 实用教程
   - 示例丰富

3. **"Inside Claude Code Skills: Structure, prompts, invocation"** by Mikhail
   https://mikhail.io/2025/10/claude-code-skills/
   - 内部工作原理
   - 实际案例分析

### 技术参考

#### Skills vs 其他工具

| 工具 | 用途 | 与 Skills 的关系 |
|------|------|------------------|
| **MCP (Model Context Protocol)** | 外部工具集成 | Skills 可调用 MCP 工具 |
| **CLAUDE.md** | 项目级指令 | Skills 是模块化的 CLAUDE.md |
| **Slash Commands** | 自定义命令 | Skills 更灵活，支持复杂逻辑 |
| **Subagents** | 专业化代理 | Skills 更轻量，无独立上下文 |

#### 相关工具

- **MCP Inspector**: 测试 MCP 服务器
  ```bash
  npx @modelcontextprotocol/inspector
  ```

- **Claude Code CLI**: Claude Code 命令行
  ```bash
  npm install -g @anthropic-ai/claude-code
  ```

### 学习路径

#### 初学者

1. 阅读官方文档概述
2. 学习 anthropics/skills 仓库中的简单示例
3. 尝试创建自己的第一个 Skill
4. 在实际项目中使用和迭代

#### 中级开发者

1. 深入研究复杂 Skills（docx, mcp-builder）
2. 学习多文件结构和渐进式加载
3. 掌握 scripts 和 references 的使用
4. 优化 description 和触发机制

#### 高级开发者

1. 贡献开源 Skills
2. 创建 Skill 工具和模板
3. 分享最佳实践
4. 参与社区讨论

### 常用命令速查

```bash
# Claude Code CLI
claude                                    # 启动 Claude Code
/available_skills                         # 列出可用 Skills
/skill show <skill-name>                  # 显示 Skill 详情
/plugin marketplace add anthropics/skills  # 添加官方 Skills 市场

# Skill 开发
./scripts/init_skill.py <name>            # 初始化 Skill
./scripts/package_skill.py <path>          # 打包 Skill

# 测试
claude --test                             # 测试模式
claude --debug                            # 调试模式
```

### 获取帮助

- **官方文档**: https://code.claude.com/docs/en/skills
- **GitHub Issues**: https://github.com/anthropics/skills/issues
- **Reddit 社区**: https://reddit.com/r/ClaudeCode
- **官方支持**: 通过 Claude Code 中的 `/bug` 命令报告问题

---

## 附录

### 术语表

| 术语 | 定义 |
|------|------|
| **Skill** | 模块化的指令包，扩展 Claude 能力 |
| **Progressive Disclosure** | 渐进式信息披露，按需加载 |
| **Frontmatter** | YAML 格式的元数据块 |
| **Context Window** | 可用的 token 限制 |
| **Trigger** | Skill 被激活的条件 |
| **Reference** | 按需加载的详细文档 |
| **Asset** | 在输出中使用的资源文件 |

### 版本历史

- **v1.0.0** (2025-12-28)
  - 初始版本
  - 包含完整的指南和最佳实践
  - 基于官方文档和社区经验

### 贡献指南

欢迎贡献改进此指南：

1. Fork 仓库
2. 创建分支
3. 提交改进
4. 创建 Pull Request

### 许可证

本指南采用 Apache 2.0 许可证。

---

**End of Guide**

如有问题或建议，请通过 GitHub Issues 或社区论坛反馈。
