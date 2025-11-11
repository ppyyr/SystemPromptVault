# SystemPromptVault 提示词复制命令实现分析报告

## Code Sections

### 提示词数据模型定义

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/models/prompt.rs:6-14` (Prompt struct): 提示词核心数据结构

```rust
pub struct Prompt {
    pub id: String,           // UUID v4 格式的唯一标识符
    pub name: String,         // 提示词名称
    pub content: String,      // 提示词内容
    pub tags: Vec<String>,    // 标签列表
    pub created_at: DateTime<Utc>,  // 创建时间
    pub updated_at: DateTime<Utc>,  // 更新时间
}
```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/models/prompt.rs:18-28` (Prompt::new method): 提示词构造函数

```rust
pub fn new(name: impl Into<String>, content: impl Into<String>, tags: Vec<String>) -> Self {
    let now = Utc::now();
    Self {
        id: Uuid::new_v4().to_string(),  // 使用 UUID v4 生成唯一 ID
        name: name.into(),
        content: content.into(),
        tags,
        created_at: now,
        updated_at: now,
    }
}
```

### 提示词 Tauri 命令接口

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/commands/prompt.rs:50-65` (create_prompt): 创建新提示词命令

```rust
#[tauri::command]
pub fn create_prompt(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
    name: String,
    content: String,
    tags: Vec<String>,
) -> Result<Prompt, String> {
    if name.trim().is_empty() {
        return Err("提示词名称不能为空".to_string());
    }
    let mut repo = lock_repo(&repository)?;
    let prompt = Prompt::new(name, content, tags);
    let created = prompt.clone();
    repo.save(prompt)?;
    Ok(created)
}
```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/commands/prompt.rs:32-39` (get_prompt_by_id): 根据ID获取提示词

```rust
#[tauri::command]
pub fn get_prompt_by_id(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
    id: String,
) -> Result<Option<Prompt>, String> {
    let repo = lock_repo(&repository)?;
    repo.get_by_id(&id)
}
```

### 数据持久化层

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/storage/prompt_repository.rs:48-51` (save method): 保存提示词到内存和文件

```rust
pub fn save(&mut self, prompt: Prompt) -> Result<(), String> {
    self.prompts.insert(prompt.id.clone(), prompt);
    self.persist()
}
```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/storage/prompt_repository.rs:101-106` (persist method): 持久化到JSON文件

```rust
fn persist(&self) -> Result<(), String> {
    let prompts: Vec<Prompt> = self.prompts.values().cloned().collect();
    let content = serde_json::to_string_pretty(&prompts)
        .map_err(|e| format!("序列化提示词失败: {}", e))?;
    atomic_write(&self.path, &content)
}
```

### 主应用命令注册

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/main.rs:58-65` (invoke_handler): 提示词相关命令注册

```rust
invoke_handler(tauri::generate_handler![
    // ... 其他命令
    commands::prompt::get_all_prompts,
    commands::prompt::get_prompt_by_id,
    commands::prompt::get_prompts_by_tags,
    commands::prompt::create_prompt,
    commands::prompt::update_prompt,
    commands::prompt::delete_prompt,
    commands::prompt::export_prompts,
    commands::prompt::import_prompts,
    // ... 更多命令
])
```

### 前端API接口

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/api.js:12-21` (PromptAPI): 前端API封装

```javascript
export const PromptAPI = {
  getAll: () => call("get_all_prompts"),
  getById: (id) => call("get_prompt_by_id", { id }),
  getByTags: (tags) => call("get_prompts_by_tags", { tags }),
  create: (name, content, tags) => call("create_prompt", { name, content, tags }),
  update: (id, name, content, tags) => call("update_prompt", { id, name, content, tags }),
  delete: (id) => call("delete_prompt", { id }),
  exportPrompts: () => call("export_prompts"),
  importPrompts: (jsonData) => call("import_prompts", { jsonData }),
};
```

### 设置页面UI渲染

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:397-422` (提示词操作按钮): 编辑和删除按钮创建逻辑

```javascript
const editBtn = document.createElement("button");
editBtn.type = "button";
editBtn.className = "btn-icon btn-icon-primary";
editBtn.setAttribute("aria-label", "编辑提示词");
editBtn.setAttribute("data-tooltip", "编辑");
// ... 编辑按钮SVG图标和事件绑定

const deleteBtn = document.createElement("button");
deleteBtn.type = "button";
deleteBtn.className = "btn-icon btn-icon-primary";
deleteBtn.setAttribute("aria-label", "删除提示词");
deleteBtn.setAttribute("data-tooltip", "删除");
// ... 删除按钮SVG图标和事件绑定
```

## Report

### conclusions

1. **提示词数据模型**：使用 UUID v4 作为唯一标识符，包含名称、内容、标签、创建时间和更新时间字段
2. **ID生成策略**：采用 `Uuid::new_v4()` 自动生成唯一ID，无需手动管理ID冲突
3. **数据持久化**：通过 `PromptRepository` 管理内存中的 `HashMap<String, Prompt>`，并持久化到JSON文件
4. **命令系统**：现有的 `create_prompt` 命令已支持创建新提示词，可直接用于复制功能
5. **存储位置**：数据存储在系统数据目录的 `SystemPromptVault/prompts.json` 文件中
6. **原子操作**：使用 `atomic_write` 确保文件写入的原子性，避免数据损坏

### relations

1. **文件间依赖关系**：
   - `src-tauri/src/main.rs` → `src-tauri/src/commands/prompt.rs` (命令注册)
   - `src-tauri/src/commands/prompt.rs` → `src-tauri/src/models/prompt.rs` (数据模型)
   - `src-tauri/src/commands/prompt.rs` → `src-tauri/src/storage/prompt_repository.rs` (数据持久化)
   - `dist/js/settings.js` → `dist/js/api.js` (API调用)
   - `dist/js/api.js` → Tauri invoke bridge (前后端通信)

2. **功能调用链**：
   - 前端UI → `PromptAPI.duplicate()` → Tauri命令 → `PromptRepository::save()` → JSON文件

3. **命名冲突处理**：由于使用UUID作为唯一标识符，系统天然支持重名提示词，无需特殊的名称冲突处理

### result

#### 1. 复制命令实现方案

要在设置页面添加提示词复制功能，需要实现以下组件：

**后端命令 (src-tauri/src/commands/prompt.rs)**:
```rust
#[tauri::command]
pub fn duplicate_prompt(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
    id: String,
) -> Result<Prompt, String> {
    let mut repo = lock_repo(&repository)?;
    let original = repo.get_by_id(&id)?
        .ok_or_else(|| "未找到指定提示词".to_string())?;

    // 生成唯一名称
    let new_name = generate_unique_name(&original.name, |name| {
        repo.get_all().unwrap_or_default().iter().any(|p| p.name == name)
    });

    // 创建副本
    let duplicated = Prompt::new(new_name, original.content, original.tags.clone());
    let result = duplicated.clone();
    repo.save(duplicated)?;
    Ok(result)
}

fn generate_unique_name<F>(base_name: &str, exists: F) -> String
where
    F: Fn(&str) -> bool,
{
    if !exists(base_name) {
        return base_name.to_string();
    }

    let mut counter = 1;
    loop {
        let candidate = format!("{} (副本)", base_name);
        if !exists(&candidate) {
            return candidate;
        }
        let candidate = format!("{} (副本 {})", base_name, counter);
        if !exists(&candidate) {
            return candidate;
        }
        counter += 1;
    }
}
```

**前端API (dist/js/api.js)**:
```javascript
export const PromptAPI = {
  // ... 现有方法
  duplicate: (id) => call("duplicate_prompt", { id }),
};
```

**前端UI集成 (dist/js/settings.js)**:
在 `renderPromptTable` 函数的按钮组中添加复制按钮：
```javascript
const duplicateBtn = document.createElement("button");
duplicateBtn.type = "button";
duplicateBtn.className = "btn-icon btn-icon-primary";
duplicateBtn.setAttribute("aria-label", "复制提示词");
duplicateBtn.setAttribute("data-tooltip", "复制");
duplicateBtn.innerHTML = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
  </svg>
`;
duplicateBtn.addEventListener("click", () => duplicatePrompt(prompt.id));

// 在按钮组中添加复制按钮
actionsDiv.appendChild(editBtn);
actionsDiv.appendChild(duplicateBtn);  // 新增
actionsDiv.appendChild(deleteBtn);
```

**复制功能处理函数**:
```javascript
const duplicatePrompt = async (id) => {
  const confirmed = await showConfirm(`确定要复制这个提示词吗？`);
  if (!confirmed) return;

  try {
    const newPrompt = await PromptAPI.duplicate(id);
    await loadPrompts();
    showToast(`提示词 "${newPrompt.name}" 复制成功`);
  } catch (error) {
    showToast(`复制提示词失败: ${error}`, "error");
  }
};
```

#### 2. 需要修改的文件清单

1. **src-tauri/src/commands/prompt.rs**：添加 `duplicate_prompt` 命令和 `generate_unique_name` 辅助函数
2. **src-tauri/src/main.rs**：在 `invoke_handler` 中注册新的 `duplicate_prompt` 命令
3. **dist/js/api.js**：在 `PromptAPI` 中添加 `duplicate` 方法
4. **dist/js/settings.js**：在提示词表格中添加复制按钮和相关事件处理

#### 3. 名称冲突处理策略

- **智能命名**：首先尝试 `原名称 (副本)`，如果已存在则使用 `原名称 (副本 2)`、`原名称 (副本 3)` 递增模式
- **存在性检查**：通过检查现有提示词名称来确保生成唯一名称
- **用户友好**：使用中文"副本"标识，符合用户习惯

#### 4. 错误处理

- **提示词不存在**：返回明确的错误信息
- **数据操作失败**：使用现有的错误处理机制
- **用户取消操作**：通过确认对话框避免误操作

### attention

1. **性能考虑**：每次复制都需要检查所有现有提示词名称，对于大量提示词可能影响性能，但实际使用中影响较小
2. **并发安全**：当前使用 `Arc<Mutex<PromptRepository>>` 确保线程安全，复制操作也是并发安全的
3. **数据一致性**：使用 `atomic_write` 确保文件写入的原子性，避免数据损坏
4. **用户体验**：添加确认对话框避免误操作，使用 Toast 提供操作反馈
5. **扩展性**：设计支持未来可能的批量复制功能
6. **国际化**：命名策略目前使用中文"副本"，如需支持多语言需要进一步设计