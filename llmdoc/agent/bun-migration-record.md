# Bun 迁移操作记录

## 迁移日期
2025-11-10

## 变更概览
项目从 npm 包管理器迁移到 Bun，以提升开发效率和性能。

## 具体变更

### 1. 文件变更
- **新增**: `bun.lock` - Bun 的锁文件（文本格式）
- **备份**: `package-lock.json.backup` - 原 npm 锁文件备份
- **修改**: `package.json` - 添加了 `@tauri-apps/cli` 依赖
- **修改**: `src-tauri/tauri.conf.json` - 更新构建命令使用 Bun

### 2. 配置文件更新

#### src-tauri/tauri.conf.json
```json
{
  "build": {
    "beforeBuildCommand": "bun run build:css",  // 原: npm run build:css
    "beforeDevCommand": "bun run watch:css"      // 原: npm run watch:css
  }
}
```

### 3. 文档更新
- `llmdoc/guides/tailwind-css-integration-guide.md` - 更新所有命令示例为 Bun
- `llmdoc/architecture/systemprompt-vault-architecture.md` - 更新构建命令描述
- `llmdoc/features/theme-system-implementation.md` - 更新构建命令引用
- `llmdoc/guides/bun-migration-guide.md` - 新增迁移指南文档
- `llmdoc/index.md` - 更新文档索引

### 4. 新的开发命令
```bash
# 依赖管理
bun install              # 替代 npm install
bun add <package>        # 替代 npm add <package>
bun remove <package>     # 替代 npm remove <package>

# 脚本执行
bun run build:css        # 替代 npm run build:css
bun run watch:css        # 替代 npm run watch:css
bun run tauri:dev        # 替代 npm run tauri:dev
bun run tauri:build      # 替代 npm run tauri:build
```

### 5. 性能提升
- 依赖安装速度: 2-10x 提升
- 脚本执行速度: 2-5x 提升
- 锁文件解析: 5x+ 提升

## 回滚方案
如需回滚到 npm：
1. 恢复 `package-lock.json.backup` 为 `package-lock.json`
2. 删除 `bun.lock`
3. 更新 `src-tauri/tauri.conf.json` 中的构建命令回 npm
4. 更新相关文档中的命令引用

## 注意事项
- 团队成员需要安装 Bun 才能正常开发
- CI/CD 环境需要更新为使用 Bun
- 所有现有功能保持不变，只是包管理器更换