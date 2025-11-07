# Tauri 项目案例调研报告

## 推荐项目案例

### 1. FileExplorer by conaticus
- **GitHub**: https://github.com/conaticus/FileExplorer
- **技术栈**: Rust + Tauri + React + Vite
- **特点**: 现代化 UI、高速搜索、LPU 缓存、ART 算法
- **代码组织**: 模块化命令系统、集中错误管理、功能标志
- **适用场景**: 需要高性能文件操作和现代化 UI

### 2. fedit by QuentinWach
- **GitHub**: https://github.com/QuentinWach/fedit
- **技术栈**: Rust + Tauri 2.0 + Vanilla JS
- **特点**: 简单文本编辑器、Tauri 2.0 文件系统 API 演示
- **代码组织**: 简单命令模式、标准 Tauri 2.0 项目结构
- **适用场景**: 学习 Tauri 2.0 文件操作基础

### 3. tauri-settings by harshkhandeparkar
- **GitHub**: https://github.com/harshkhandeparkar/tauri-settings
- **技术栈**: TypeScript + Tauri 文件系统 API
- **特点**: 配置文件管理、缓存机制、类型安全
- **代码组织**: 纯前端实现、泛型约束、两种 API 模式
- **适用场景**: 配置编辑类工具的参考实现

## 代码组织最佳实践

### Rust 代码模块化

```rust
// src-tauri/src/main.rs - 入口文件
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            file_commands::read_file,
            file_commands::write_file,
            config_commands::get_configs,
            config_commands::save_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// src-tauri/src/commands/mod.rs - 命令模块组织
pub mod file_commands;
pub mod config_commands;
pub mod dialog_commands;

// src-tauri/src/commands/file_commands.rs - 文件操作命令
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("写入文件失败: {}", e))
}
```

### tauri.conf.json 配置优化

```json
{
  "productName": "配置切换工具",
  "version": "1.0.0",
  "identifier": "com.example.config-switcher",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "配置切换工具",
        "width": 1000,
        "height": 700,
        "minWidth": 800,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  },
  "plugins": {
    "fs": {
      "scope": ["$APPCONFIG", "$APPCONFIG/*", "$DOWNLOAD", "$HOME/*"]
    },
    "dialog": {
      "all": true,
      "open": true,
      "save": true
    }
  }
}
```

## UI 交互模式

### 列表渲染模式

```typescript
// 组件化列表管理
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

interface Config {
  id: string;
  name: string;
  path: string;
  description?: string;
  created_at: string;
}

export function ConfigList() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const result = await invoke<Config[]>('get_configs');
      setConfigs(result);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择配置文件夹"
      });

      if (selected && typeof selected === 'string') {
        await invoke('add_config_folder', { path: selected });
        await loadConfigs(); // 重新加载列表
      }
    } catch (err) {
      setError(err as string);
    }
  };

  return (
    <div className="config-list">
      <div className="list-header">
        <h2>配置文件列表</h2>
        <button onClick={handleSelectFolder}>
          添加文件夹
        </button>
      </div>

      {loading && <div className="loading">加载中...</div>}
      {error && <div className="error">{error}</div>}

      <div className="config-items">
        {configs.map(config => (
          <ConfigItem
            key={config.id}
            config={config}
            onUpdate={loadConfigs}
          />
        ))}
      </div>
    </div>
  );
}
```

### 表单编辑模式

```typescript
export function ConfigEditor({ config, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: config?.name || '',
    path: config?.path || '',
    description: config?.description || ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 基本验证
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = '名称不能为空';
    }
    if (!formData.path.trim()) {
      newErrors.path = '路径不能为空';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await invoke('save_config', {
        id: config?.id,
        data: formData
      });
      onSave();
    } catch (err) {
      setErrors({ general: err as string });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="config-form">
      <div className="form-group">
        <label>配置名称</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className={errors.name ? 'error' : ''}
        />
        {errors.name && <span className="error-text">{errors.name}</span>}
      </div>

      <div className="form-group">
        <label>配置路径</label>
        <input
          type="text"
          value={formData.path}
          onChange={(e) => handleChange('path', e.target.value)}
          className={errors.path ? 'error' : ''}
        />
        {errors.path && <span className="error-text">{errors.path}</span>}
      </div>

      <div className="form-actions">
        <button type="submit">保存</button>
        <button type="button" onClick={onCancel}>取消</button>
      </div>
    </form>
  );
}
```

### Toast 提示组件

```typescript
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type, duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
      <button onClick={onClose}>×</button>
    </div>
  );
}

// Toast 容器组件
export function ToastContainer() {
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: string }>>([]);

  const addToast = (message: string, type: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type as any}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
```

## CSS 样式框架推荐

### 1. Tailwind CSS + shadcn/ui (推荐)
```css
/* app.css - 基础样式 */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
  }
}

@layer components {
  .btn {
    @apply px-4 py-2 rounded-md font-medium transition-colors;
  }

  .btn-primary {
    @apply bg-blue-600 text-white hover:bg-blue-700;
  }

  .btn-secondary {
    @apply bg-gray-200 text-gray-900 hover:bg-gray-300;
  }
}
```

### 2. CSS 变量 + 自定义样式
```css
/* 现代化卡片样式 */
.card {
  @apply bg-white rounded-lg border border-gray-200 shadow-sm;
}

.card-header {
  @apply px-6 py-4 border-b border-gray-200;
}

.card-body {
  @apply px-6 py-4;
}

/* 列表项样式 */
.list-item {
  @apply flex items-center justify-between p-4 hover:bg-gray-50
         border-b border-gray-100 transition-colors;
}

.list-item:hover {
  @apply bg-blue-50 border-blue-100;
}

/* 表单样式 */
.form-group {
  @apply mb-4;
}

.form-label {
  @apply block text-sm font-medium text-gray-700 mb-1;
}

.form-input {
  @apply w-full px-3 py-2 border border-gray-300 rounded-md
         focus:outline-none focus:ring-2 focus:ring-blue-500
         focus:border-blue-500;
}

.form-input.error {
  @apply border-red-300 focus:ring-red-500 focus:border-red-500;
}

.error-text {
  @apply text-red-600 text-sm mt-1;
}
```

## 可复用代码模板

### 1. 基础 Tauri 应用模板
```rust
// src-tauri/src/lib.rs - 库文件
pub mod commands;
pub mod models;
pub mod utils;

pub use commands::*;
pub use models::*;
```

```rust
// src-tauri/src/models.rs - 数据模型
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateConfigRequest {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
}
```

### 2. 状态管理 Hook
```typescript
// hooks/useConfigManager.ts
import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useConfigManager() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Config[]>('get_configs');
      setConfigs(result);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  }, []);

  const createConfig = useCallback(async (data: CreateConfigRequest) => {
    try {
      await invoke('create_config', { data });
      await loadConfigs();
    } catch (err) {
      setError(err as string);
      throw err;
    }
  }, [loadConfigs]);

  const updateConfig = useCallback(async (id: string, data: Partial<Config>) => {
    try {
      await invoke('update_config', { id, data });
      await loadConfigs();
    } catch (err) {
      setError(err as string);
      throw err;
    }
  }, [loadConfigs]);

  const deleteConfig = useCallback(async (id: string) => {
    try {
      await invoke('delete_config', { id });
      setConfigs(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError(err as string);
      throw err;
    }
  }, []);

  return {
    configs,
    loading,
    error,
    loadConfigs,
    createConfig,
    updateConfig,
    deleteConfig
  };
}
```

## 推荐工具链

### 开发工具
- **前端**: Vite + TypeScript + Tailwind CSS
- **后端**: Rust + Tauri 2.0 + tokio
- **UI 组件**: shadcn/ui 或 headless UI
- **状态管理**: React Context + useReducer 或 Zustand

### 代码质量
- **代码检查**: ESLint + Prettier + rustfmt + clippy
- **类型检查**: TypeScript + Rust 类型系统
- **测试**: Vitest + Jest (前端) + cargo test (后端)

这个调研报告提供了从项目选择到具体实现的完整参考，可以直接用于指导配置切换工具的开发。