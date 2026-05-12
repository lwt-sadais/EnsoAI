# Release 版本发布命令

## 流程

### 1. 读取当前版本号

从 `package.json` 中读取当前版本号 `currentVersion`。

### 2. 选择新版本号

根据当前版本号计算出三个语义化版本选项，通过 `AskUserQuestion` 工具让用户选择：

- **补丁版本 (Patch)**：`major.minor.patch+1`
- **次版本 (Minor)**：`major.minor+1.0`
- **主版本 (Major)**：`major+1.0.0`
- **手动输入 (Custom)**：用户手动输入版本号

用户选择后，得到目标版本号 `newVersion`（去掉可能的 `v` 前缀，统一用纯数字格式如 `1.0.0`）。

### 3. 执行发布脚本

```bash
bash .claude/commands/release.sh "${newVersion}"
```
