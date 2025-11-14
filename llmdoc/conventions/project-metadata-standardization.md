# 项目元数据标准化

## 1. Purpose

本文档记录 SystemPromptVault 项目元数据的标准化配置，包括作者信息、许可证信息、版本号等核心项目标识信息的统一管理和维护规范。

## 2. How it Works

### 2.1 元数据文件分布

项目元数据分布在以下关键文件中：

- **Cargo.toml**: Rust 后端项目的包管理配置
- **package.json**: Node.js 前端项目的包管理配置
- **LICENSE**: 项目许可证文件
- **src-tauri/src/main.rs**: 应用程序中的版本和版权信息显示

### 2.2 统一的元数据标准

#### 2.2.1 作者信息
- **姓名**: Saul
- **邮箱**: p@sora.im
- **版权归属**: Copyright © 2025 Saul <p@sora.im>

#### 2.2.2 许可证信息
- **类型**: MIT License
- **文件**: LICENSE (完整的 MIT 许可证文本)
- **配置声明**: `license = "MIT"` (Cargo.toml)

#### 2.2.3 项目信息
- **名称**: SystemPromptVault
- **版本**: 0.1.0
- **描述**: 基于 Tauri v2 的单文件 Prompt 管理与客户端切换工具

### 2.3 元数据同步机制

1. **手动同步**: 目前采用手动同步方式保持各配置文件中的元数据一致性
2. **自动化考虑**: 未来可考虑使用脚本或工具实现元数据的自动同步
3. **版本发布检查**: 在版本发布前检查所有元数据文件的一致性

### 2.4 显示信息集成

应用程序在 About 对话框中显示标准化的项目信息：

```rust
const ABOUT_DIALOG_MESSAGE: &str = "SystemPromptVault v0.1.0\n\n基于 Tauri v2 的单文件 Prompt 管理与客户端切换工具\n\nCopyright © 2025 Saul <p@sora.im>\nLicensed under MIT License";
```

## 3. Relevant Code Modules

- `Cargo.toml`: Rust 后端项目配置文件，包含作者和许可证信息
- `package.json`: Node.js 前端项目配置文件，包含项目元数据
- `LICENSE`: MIT 许可证文件，包含完整的许可证条款
- `src-tauri/src/main.rs`: About 对话框中的项目信息显示
- `src-tauri/tauri.conf.json`: Tauri 应用配置文件

## 4. Attention

- **一致性维护**: 确保所有配置文件中的作者、版本、许可证信息保持一致
- **许可证兼容性**: MIT 许可证允许商业使用、修改、分发、私有使用
- **版权归属**: 明确版权归属为 Saul <p@sora.im>，年份为 2025
- **版本同步**: 版本号更新时需要同步更新所有相关文件
- **法律效力**: LICENSE 文件是具有法律效力的许可证文本，不应随意修改