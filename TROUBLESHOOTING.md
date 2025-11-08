# 故障排除指南

## 问题: "Tauri 尚未就绪" 错误

### 症状
- 打开应用后,界面显示错误提示
- 控制台显示 "Tauri API 加载超时" 或 "Tauri 尚未就绪"

### 解决方案

#### 1. 确认 Tauri API 版本
SystemPromptVault 使用 Tauri v2,API 路径为 `window.__TAURI_INTERNALS__`。

**检查方法**:
1. 打开应用的开发者工具 (macOS: `Cmd+Option+I`)
2. 在控制台输入:
```javascript
console.log(window.__TAURI_INTERNALS__);
```
3. 应该看到一个对象,包含 `invoke` 函数

#### 2. 检查前端文件是否正确加载

**在开发者工具的 Network 标签中检查**:
- `index.html` - 状态应为 200
- `js/api.js` - 状态应为 200
- `js/main.js` - 状态应为 200
- `css/main.css` - 状态应为 200

如果文件加载失败(404),检查 `src-tauri/tauri.conf.json` 中的 `frontendDist` 配置:
```json
"build": {
  "frontendDist": "../dist"
}
```

#### 3. 清理缓存并重新编译

```bash
# 1. 清理 Rust 编译缓存
cd src-tauri
cargo clean

# 2. 重新编译
cargo tauri dev
```

#### 4. 检查控制台错误

**打开开发者工具** (macOS: `Cmd+Option+I`),查看:
- **Console 标签**: 查看 JavaScript 错误
- **Network 标签**: 查看资源加载情况

常见错误:
- `Cannot read property 'invoke' of undefined` → API 路径错误
- `Failed to fetch` → 前端文件路径错误
- `Command not found` → Rust 命令未注册

---

## 问题: 客户端列表为空

### 症状
- 打开应用后,顶部没有显示 Claude/Codex/Gemini 的 Tab

### 解决方案

#### 1. 检查数据初始化

**在开发者工具控制台执行**:
```javascript
// 导入 API
import { ClientAPI } from './js/api.js';

// 获取所有客户端
ClientAPI.getAll().then(clients => {
  console.log('客户端列表:', clients);
});
```

**预期结果**:
```javascript
[
  { id: "claude", name: "Claude", config_file_path: "~/.claude/CLAUDE.md", ... },
  { id: "codex", name: "Codex", config_file_path: "~/.codex/CODEX.md", ... },
  { id: "gemini", name: "Gemini", config_file_path: "~/.gemini/GEMINI.md", ... }
]
```

#### 2. 手动初始化客户端数据

如果列表为空,检查数据文件:
```bash
# macOS
ls -la ~/Library/Application\ Support/com.example.systemprompt-vault/

# 应该看到:
# - clients.json
# - prompts.json
# - app_state.json
```

如果 `clients.json` 不存在或为空,删除它让应用重新初始化:
```bash
rm ~/Library/Application\ Support/com.example.systemprompt-vault/clients.json
```

重启应用,`ClientRepository` 会自动创建默认客户端。

---

## 问题: 配置文件读取失败

### 症状
- 切换客户端后,左侧编辑器显示错误或为空
- 控制台显示 "Failed to read config file"

### 解决方案

#### 1. 检查配置文件路径

**默认路径**:
- Claude: `~/.claude/CLAUDE.md`
- Codex: `~/.codex/CODEX.md`
- Gemini: `~/.gemini/GEMINI.md`

**手动创建测试文件**:
```bash
# 创建目录
mkdir -p ~/.claude ~/.codex ~/.gemini

# 创建测试文件
echo "# Claude 配置文件测试" > ~/.claude/CLAUDE.md
echo "# Codex 配置文件测试" > ~/.codex/CODEX.md
echo "# Gemini 配置文件测试" > ~/.gemini/GEMINI.md
```

#### 2. 检查文件权限

```bash
# 检查权限
ls -la ~/.claude/CLAUDE.md

# 如果权限不足,修改权限
chmod 644 ~/.claude/CLAUDE.md
```

#### 3. 路径展开问题

如果使用自定义客户端,确保路径格式正确:
- ✅ 正确: `~/.myai/config.md`
- ✅ 正确: `/Users/username/.myai/config.md`
- ❌ 错误: `$HOME/.myai/config.md` (不支持环境变量)

---

## 问题: 提示词保存失败

### 症状
- 点击"保存"按钮后显示错误
- 提示词列表未更新

### 解决方案

#### 1. 检查数据目录权限

```bash
# macOS
ls -la ~/Library/Application\ Support/com.example.systemprompt-vault/

# 确保有写入权限
chmod -R 755 ~/Library/Application\ Support/com.example.systemprompt-vault/
```

#### 2. 检查 JSON 文件是否损坏

```bash
# 验证 prompts.json 格式
cat ~/Library/Application\ Support/com.example.systemprompt-vault/prompts.json | python3 -m json.tool
```

如果 JSON 格式损坏,备份后删除:
```bash
# 备份
cp ~/Library/Application\ Support/com.example.systemprompt-vault/prompts.json ~/prompts.json.backup

# 删除损坏的文件
rm ~/Library/Application\ Support/com.example.systemprompt-vault/prompts.json
```

重启应用,会创建新的空文件。

---

## 问题: Tag 过滤不工作

### 症状
- 点击 Tag 按钮后,提示词列表未变化
- 所有提示词仍然显示

### 解决方案

#### 1. 检查 Tag 数据格式

**在开发者工具控制台**:
```javascript
import { PromptAPI } from './js/api.js';

PromptAPI.getAll().then(prompts => {
  prompts.forEach(p => {
    console.log(`${p.name}: tags = `, p.tags);
  });
});
```

**预期结果**: 每个提示词应该有 `tags` 数组:
```javascript
{ name: "重构助手", tags: ["claude", "coding", "refactor"], ... }
```

#### 2. 检查过滤逻辑

**在 `dist/js/main.js` 中检查 `filterPrompts` 函数**:
```javascript
const filterPrompts = () => {
  const { selectedTags, prompts } = state;
  if (selectedTags.length === 0) {
    return prompts; // 无过滤
  }
  return prompts.filter(p =>
    selectedTags.some(tag => p.tags.includes(tag))
  );
};
```

---

## 开发调试技巧

### 1. 启用 Rust 日志

**在 `src-tauri/src/main.rs` 中添加**:
```rust
env_logger::init();
```

**运行时查看日志**:
```bash
RUST_LOG=debug cargo tauri dev
```

### 2. 前端调试

**在 `dist/js/main.js` 中添加调试点**:
```javascript
console.log('State:', state);
console.log('Clients:', state.clients);
console.log('Prompts:', state.prompts);
```

### 3. 检查 Tauri Command 注册

**在 `src-tauri/src/lib.rs` 中确认所有命令已注册**:
```rust
.invoke_handler(tauri::generate_handler![
    commands::prompt::get_all_prompts,
    commands::prompt::create_prompt,
    // ... 确保所有命令都在这里
])
```

---

## 联系支持

如果上述方法都无法解决问题:

1. **收集信息**:
   - 操作系统版本
   - Rust 版本 (`rustc --version`)
   - 错误日志 (开发者工具控制台 + 终端输出)

2. **创建 Issue**:
   - 在 GitHub 仓库创建 Issue
   - 附上错误日志和复现步骤

3. **临时解决方案**:
   - 删除应用数据目录让应用重新初始化:
     ```bash
     rm -rf ~/Library/Application\ Support/com.example.systemprompt-vault/
     ```
   - 重启应用
