## 📏 TikTokTac 管理规则

### 🔄 滚动规则
- **文档长度限制**: 最大200行，建议150行内
- **已完成循环**: 最多保留3个，其余移至 `archive/completed-cycles.md`
- **问题池**: 每类最多保留10个，解决的问题移至归档
- **技术债务**: 已清理项目移至归档，保持当前视图简洁

### 📋 滚动触发条件
**必须滚动** (任一条件满足):
- 文档行数 > 200行
- 已完成循环 > 3个
- 问题池单类 > 10个

**滚动操作**:
1. 已完成循环 → `archive/completed-cycles-[YYYY-MM].md`
2. 解决的问题 → `archive/solved-issues-[YYYY-MM].md`  
3. 清理的技术债务 → `archive/tech-debt-cleared-[YYYY-MM].md`
4. 在本文档末尾记录归档时间和位置

### ⏰ 维护周期
- **每日**: 更新当前Tik状态
- **每周**: 检查行数，必要时执行滚动
- **每月**: 整理归档，清理无效链接

---

## 🔄 当前循环状态

### 🔥 **Tik** ([状态]: 计划中📝) 
**循环 #[2]**: 功能完善与代码重构

**🎯 核心目标**:
- [ ] 将现有功能对齐 `toread` 参考实现，并完成缺失的关键功能。
- [ ] 大规模重构代码，优化文件结构，提高模块化程度。
- [ ] 完善预处理指令，特别是条件编译。

**📋 详细执行计划**:
- **阶段1**: 代码结构重构与测试环境搭建 (关注点分离)
  - [ ] **测试**: 安装 `jest`, `ts-jest`, `@types/jest` 并创建 `jest.config.js`。在 `package.json` 中添加 `test` 脚本。
  - [ ] 将 `src/index.ts` 中属于解析的函数 (`extractFunction`, `findFunctionStart` 等) 全部移动到 `src/parser.ts`。
  - [ ] 将 `src/index.ts` 中属于预处理的函数 (`processMacros`, `processConditionalCompilation` 等) 的实现移动到 `src/preprocessor.ts`。
  - [ ] 将 `src/index.ts` 中与文件处理相关的函数 (`fetchContent`, `resolveImportPath`) 统一到 `src/utils.ts` 中，并确保整个项目都从 `utils.ts` 导入。
  - [ ] 创建 `src/builtins.ts` 文件，并实现 `isBuiltinFunction` 函数，参考 `toread/isBuiltinFunction.js`。
  - [ ] **测试**: 为 `builtins.ts` 编写第一个单元测试，确保测试流程正常工作。

- **阶段2**: 关键功能实现 (测试驱动)
  - [ ] **条件编译**: 在 `src/preprocessor.ts` 中实现一个健壮的、支持嵌套的条件编译逻辑 (`@ifdef`, `@ifndef`, `@else`, `@endif`)。
  - [ ] **测试**: 为新的条件编译逻辑编写全面的单元测试。
  - [ ] **常量导入**: 增强 `@import` 逻辑，支持导入 `const`, `let`, `var` 声明的常量。
  - [ ] **Uniform 解析**: 在 `src/parser.ts` 中新增 `parseUniforms` 功能，用于解析 `@group` 和 `@binding` 定义，参考 `toread/uniformParser.js`。
  - [ ] **测试**: 为常量导入和 Uniform 解析功能编写单元测试。

- **阶段3**: 整合与优化
  - [ ] 在 `src/index.ts` 中重新组织主流程 `processWGSL`，确保它调用的是来自不同模块（`parser`, `preprocessor`, `utils`）的函数，而不是自己内部的实现。
  - [ ] **测试**: 编写集成测试，使用测试用的 `.wgsl` 文件验证 `processWGSL` 的端到端功能。
  - [ ] 确保在处理 `@import` 时，使用 `isBuiltinFunction` 过滤掉内置函数。
  - [ ] 审查并优化 `MagicString` 的使用，尽可能用 `overwrite` 和 `remove` 代替字符串拼接。

### ⏳ **Tok** (待定执行)
计划就绪后，将在此阶段根据上述 `Tik` 计划执行代码的重构和新功能开发。

### 📋 **Tak** (修正)  
对 `Tok` 阶段实现的代码进行精细调整、测试和优化。

## ✅ 已完成循环 (最多保留3个)

### **循环 #[1]**: 实现一个基础的WGSL预处理器和模块加载器 ✅
**任务**: 搭建了项目基本框架，并实现了核心的 `@import` 逻辑。
**完成状态**: ✅ 初步实现，但功能不全且代码结构混乱。
**成果**:
- ✅ 搭建了基本的 `src` 目录结构。
- ✅ 实现了简易的 `@import` 功能，包含依赖解析和拓扑排序。
- ✅ 引入了 `magic-string` 但未充分利用。
**遗留问题**: 条件编译和宏功能不完整，代码高度耦合在 `index.ts` 中，缺少 uniform 解析等高级功能。 (在循环#[2]处理)
**完成时间**: (织在更新此条目时填写)

---

## 📋 问题池 (每类最多10个)
*暂无*

--- 