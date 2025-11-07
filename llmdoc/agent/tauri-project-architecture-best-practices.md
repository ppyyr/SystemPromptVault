# Tauri 项目架构和最佳实践指南

## 项目结构最佳实践

### 推荐的目录结构
```
sys-prompt-switcher/
├── src/                          # 前端代码
│   ├── components/              # React 组件
│   │   ├── ui/                 # 基础 UI 组件
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── index.ts
│   │   ├── forms/              # 表单组件
│   │   │   ├── ConfigForm.tsx
│   │   │   └── TemplateForm.tsx
│   │   └── features/           # 功能组件
│   │       ├── ConfigList.tsx
│   │       ├── TemplateEditor.tsx
│   │       └── HistoryView.tsx
│   ├── hooks/                  # 自定义 Hooks
│   │   ├── useConfigManager.ts
│   │   ├── useFileOperations.ts
│   │   └── useToast.ts
│   ├── services/               # 服务层
│   │   ├── api.ts
│   │   ├── dialogService.ts
│   │   ├── toastService.ts
│   │   └── confirmService.ts
│   ├── stores/                 # 状态管理
│   │   ├── configStore.ts
│   │   ├── uiStore.ts
│   │   └── historyStore.ts
│   ├── types/                  # TypeScript 类型定义
│   │   ├── config.ts
│   │   ├── template.ts
│   │   └── api.ts
│   ├── utils/                  # 工具函数
│   │   ├── validation.ts
│   │   ├── fileUtils.ts
│   │   └── dateUtils.ts
│   ├── styles/                 # 样式文件
│   │   ├── globals.css
│   │   └── components.css
│   ├── App.tsx
│   ├── main.tsx
│   └── index.html
├── src-tauri/                  # Rust 后端代码
│   ├── src/
│   │   ├── main.rs            # 应用入口
│   │   ├── lib.rs             # 库文件
│   │   ├── commands/          # Tauri 命令
│   │   │   ├── mod.rs
│   │   │   ├── config_commands.rs
│   │   │   ├── file_commands.rs
│   │   │   └── template_commands.rs
│   │   ├── models/            # 数据模型
│   │   │   ├── mod.rs
│   │   │   ├── config.rs
│   │   │   └── template.rs
│   │   ├── services/          # 业务逻辑服务
│   │   │   ├── mod.rs
│   │   │   ├── config_service.rs
│   │   │   ├── file_service.rs
│   │   │   └── template_service.rs
│   │   ├── utils/             # 工具模块
│   │   │   ├── mod.rs
│   │   │   ├── error.rs
│   │   │   └── path_utils.rs
│   │   └── error.rs           # 错误处理
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── build.rs
├── public/                     # 静态资源
├── docs/                      # 文档
├── tests/                     # 测试文件
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## Rust 代码组织模式

### 1. 错误处理系统
```rust
// src-tauri/src/error.rs
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("文件操作失败: {0}")]
    FileOperation(#[from] std::io::Error),

    #[error("配置解析错误: {0}")]
    ConfigParse(#[from] serde_json::Error),

    #[error("路径不存在: {0}")]
    PathNotFound(String),

    #[error("权限不足: {0}")]
    PermissionDenied(String),

    #[error("操作被取消")]
    Cancelled,

    #[error("未知错误: {0}")]
    Unknown(String),
}

impl AppError {
    pub fn error_code(&self) -> u16 {
        match self {
            AppError::FileOperation(_) => 401,
            AppError::ConfigParse(_) => 402,
            AppError::PathNotFound(_) => 404,
            AppError::PermissionDenied(_) => 403,
            AppError::Cancelled => 499,
            AppError::Unknown(_) => 500,
        }
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
```

### 2. 命令模块组织
```rust
// src-tauri/src/commands/mod.rs
pub mod config_commands;
pub mod file_commands;
pub mod template_commands;
pub mod dialog_commands;

// 重新导出所有命令
pub use config_commands::*;
pub use file_commands::*;
pub use template_commands::*;
pub use dialog_commands::*;
```

```rust
// src-tauri/src/commands/config_commands.rs
use crate::error::{AppError, Result};
use crate::models::config::{Config, CreateConfigRequest};
use crate::services::config_service::ConfigService;
use serde::{Deserialize, Serialize};
use tauri::command;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigResponse {
    pub success: bool,
    pub data: Option<Config>,
    pub error: Option<String>,
    pub code: Option<u16>,
}

#[command]
pub async fn get_configs(
    service: tauri::State<'_, Arc<Mutex<ConfigService>>>
) -> Result<Vec<Config>> {
    let service = service.lock().await;
    service.get_all_configs().await
}

#[command]
pub async fn create_config(
    service: tauri::State<'_, Arc<Mutex<ConfigService>>>,
    request: CreateConfigRequest
) -> Result<Config> {
    let service = service.lock().await;
    service.create_config(request).await
}

#[command]
pub async fn update_config(
    service: tauri::State<'_, Arc<Mutex<ConfigService>>>,
    id: String,
    request: UpdateConfigRequest
) -> Result<Config> {
    let service = service.lock().await;
    service.update_config(id, request).await
}

#[command]
pub async fn delete_config(
    service: tauri::State<'_, Arc<Mutex<ConfigService>>>,
    id: String
) -> Result<()> {
    let service = service.lock().await;
    service.delete_config(id).await
}

#[command]
pub async fn switch_to_config(
    service: tauri::State<'_, Arc<Mutex<ConfigService>>>,
    id: String
) -> Result<SwitchResult> {
    let service = service.lock().await;
    service.switch_to_config(id).await
}
```

### 3. 服务层模式
```rust
// src-tauri/src/services/config_service.rs
use crate::error::{AppError, Result};
use crate::models::config::{Config, CreateConfigRequest, UpdateConfigRequest};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;
use serde_json;

pub struct ConfigService {
    configs_dir: PathBuf,
    configs: HashMap<String, Config>,
}

impl ConfigService {
    pub fn new(configs_dir: PathBuf) -> Self {
        Self {
            configs_dir,
            configs: HashMap::new(),
        }
    }

    pub async fn initialize(&mut self) -> Result<()> {
        // 确保配置目录存在
        fs::create_dir_all(&self.configs_dir).await?;

        // 加载现有配置
        self.load_configs().await?;
        Ok(())
    }

    async fn load_configs(&mut self) -> Result<()> {
        let mut entries = fs::read_dir(&self.configs_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                let content = fs::read_to_string(&path).await?;
                let config: Config = serde_json::from_str(&content)?;
                self.configs.insert(config.id.clone(), config);
            }
        }

        Ok(())
    }

    pub async fn get_all_configs(&self) -> Result<Vec<Config>> {
        let mut configs: Vec<_> = self.configs.values().cloned().collect();
        configs.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(configs)
    }

    pub async fn create_config(&mut self, request: CreateConfigRequest) -> Result<Config> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        let config = Config {
            id: id.clone(),
            name: request.name,
            path: request.path,
            description: request.description,
            created_at: now.clone(),
            updated_at: Some(now.clone()),
            is_active: false,
        };

        // 验证路径是否存在
        if !tokio::fs::metadata(&config.path).await?.is_dir() {
            return Err(AppError::PathNotFound(config.path));
        }

        // 保存到文件
        self.save_config_to_file(&config).await?;

        // 添加到内存
        self.configs.insert(id, config.clone());

        Ok(config)
    }

    async fn save_config_to_file(&self, config: &Config) -> Result<()> {
        let filename = format!("{}.json", config.id);
        let file_path = self.configs_dir.join(filename);

        let content = serde_json::to_string_pretty(config)?;
        fs::write(file_path, content).await?;

        Ok(())
    }

    pub async fn switch_to_config(&mut self, id: String) -> Result<SwitchResult> {
        let config = self.configs.get(&id)
            .ok_or_else(|| AppError::PathNotFound("配置不存在".to_string()))?;

        // 执行切换逻辑
        let result = self.perform_config_switch(config).await?;

        // 更新活动状态
        self.update_active_status(&id).await?;

        Ok(result)
    }

    async fn perform_config_switch(&self, config: &Config) -> Result<SwitchResult> {
        // 实现具体的配置切换逻辑
        // 这里可以包括备份、复制文件、更新系统配置等

        let backup_path = self.create_backup(&config.path).await?;

        // 执行切换操作
        // ...

        Ok(SwitchResult {
            success: true,
            backup_path: Some(backup_path),
            message: "配置切换成功".to_string(),
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SwitchResult {
    pub success: bool,
    pub backup_path: Option<String>,
    pub message: String,
}
```

## 前端架构模式

### 1. 状态管理 - Zustand
```typescript
// stores/configStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Config, CreateConfigRequest } from '../types/config';

interface ConfigState {
  configs: Config[];
  activeConfigId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  setConfigs: (configs: Config[]) => void;
  addConfig: (config: Config) => void;
  updateConfig: (id: string, updates: Partial<Config>) => void;
  removeConfig: (id: string) => void;
  setActiveConfig: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Computed
  activeConfig: Config | null;
  inactiveConfigs: Config[];
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      configs: [],
      activeConfigId: null,
      loading: false,
      error: null,

      setConfigs: (configs) => set({ configs }),

      addConfig: (config) => set((state) => ({
        configs: [...state.configs, config]
      })),

      updateConfig: (id, updates) => set((state) => ({
        configs: state.configs.map(config =>
          config.id === id ? { ...config, ...updates } : config
        )
      })),

      removeConfig: (id) => set((state) => ({
        configs: state.configs.filter(config => config.id !== id),
        activeConfigId: state.activeConfigId === id ? null : state.activeConfigId
      })),

      setActiveConfig: (id) => set({ activeConfigId: id }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      get activeConfig() {
        const { configs, activeConfigId } = get();
        return configs.find(config => config.id === activeConfigId) || null;
      },

      get inactiveConfigs() {
        const { configs, activeConfigId } = get();
        return configs.filter(config => config.id !== activeConfigId);
      }
    }),
    {
      name: 'config-storage',
      partialize: (state) => ({
        activeConfigId: state.activeConfigId,
        configs: state.configs
      })
    }
  )
);
```

### 2. API 服务层
```typescript
// services/api.ts
import { invoke } from '@tauri-apps/api/core';
import { Config, CreateConfigRequest, UpdateConfigRequest } from '../types/config';

export class ApiService {
  private static instance: ApiService;

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  // 配置相关 API
  async getConfigs(): Promise<Config[]> {
    return await invoke('get_configs');
  }

  async createConfig(request: CreateConfigRequest): Promise<Config> {
    return await invoke('create_config', { request });
  }

  async updateConfig(id: string, request: UpdateConfigRequest): Promise<Config> {
    return await invoke('update_config', { id, request });
  }

  async deleteConfig(id: string): Promise<void> {
    return await invoke('delete_config', { id });
  }

  async switchToConfig(id: string): Promise<SwitchResult> {
    return await invoke('switch_to_config', { id });
  }

  // 文件操作 API
  async validatePath(path: string): Promise<PathInfo> {
    return await invoke('validate_path', { path });
  }

  async listDirectory(path: string): Promise<string[]> {
    return await invoke('list_directory_contents', { path });
  }

  async readFile(path: string): Promise<string> {
    return await invoke('read_file', { path });
  }

  async writeFile(path: string, content: string): Promise<void> {
    return await invoke('write_file', { path, content });
  }

  // 模板相关 API
  async getTemplates(): Promise<Template[]> {
    return await invoke('get_templates');
  }

  async createTemplate(request: CreateTemplateRequest): Promise<Template> {
    return await invoke('create_template', { request });
  }

  async applyTemplate(templateId: string, targetPath: string): Promise<void> {
    return await invoke('apply_template', { templateId, targetPath });
  }
}

export const apiService = ApiService.getInstance();
```

### 3. React Query 集成（可选）
```typescript
// hooks/useConfigQuery.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { Config, CreateConfigRequest } from '../types/config';
import { toast } from '../services/toastService';

export function useConfigs() {
  return useQuery({
    queryKey: ['configs'],
    queryFn: () => apiService.getConfigs(),
    staleTime: 5 * 60 * 1000, // 5分钟
  });
}

export function useCreateConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateConfigRequest) => apiService.createConfig(request),
    onSuccess: (newConfig) => {
      queryClient.setQueryData(['configs'], (old: Config[] | undefined) =>
        old ? [newConfig, ...old] : [newConfig]
      );
      toast.success('配置创建成功');
    },
    onError: (error) => {
      toast.error(`配置创建失败: ${error}`);
    },
  });
}

export function useDeleteConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiService.deleteConfig(id),
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData(['configs'], (old: Config[] | undefined) =>
        old?.filter(config => config.id !== deletedId) || []
      );
      toast.success('配置删除成功');
    },
    onError: (error) => {
      toast.error(`配置删除失败: ${error}`);
    },
  });
}
```

## 测试策略

### 1. Rust 后端测试
```rust
// src-tauri/src/services/tests.rs
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use tokio::fs;

    #[tokio::test]
    async fn test_create_config() -> Result<()> {
        let temp_dir = TempDir::new()?;
        let mut service = ConfigService::new(temp_dir.path().to_path_buf());
        service.initialize().await?;

        let request = CreateConfigRequest {
            name: "测试配置".to_string(),
            path: temp_dir.path().join("test").to_string_lossy().to_string(),
            description: Some("测试配置描述".to_string()),
        };

        fs::create_dir_all(&request.path).await?;

        let config = service.create_config(request).await?;

        assert_eq!(config.name, "测试配置");
        assert_eq!(service.configs.len(), 1);

        Ok(())
    }

    #[tokio::test]
    async fn test_switch_config() -> Result<()> {
        // 测试配置切换逻辑
    }
}
```

### 2. 前端组件测试
```typescript
// components/__tests__/ConfigList.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigList } from '../ConfigList';
import { apiService } from '../../services/api';

// Mock API service
jest.mock('../../services/api');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

describe('ConfigList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders config list correctly', async () => {
    const mockConfigs = [
      { id: '1', name: '配置1', path: '/path/1', created_at: '2024-01-01' },
      { id: '2', name: '配置2', path: '/path/2', created_at: '2024-01-02' },
    ];

    mockApiService.getConfigs.mockResolvedValue(mockConfigs as any);

    render(<ConfigList />);

    await waitFor(() => {
      expect(screen.getByText('配置1')).toBeInTheDocument();
      expect(screen.getByText('配置2')).toBeInTheDocument();
    });
  });

  test('handles config deletion', async () => {
    const mockConfigs = [
      { id: '1', name: '配置1', path: '/path/1', created_at: '2024-01-01' },
    ];

    mockApiService.getConfigs.mockResolvedValue(mockConfigs as any);
    mockApiService.deleteConfig.mockResolvedValue(undefined);

    render(<ConfigList />);

    await waitFor(() => {
      expect(screen.getByText('配置1')).toBeInTheDocument();
    });

    const deleteButton = screen.getByText('删除');
    fireEvent.click(deleteButton);

    // 确认删除
    const confirmButton = screen.getByText('确认');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockApiService.deleteConfig).toHaveBeenCalledWith('1');
    });
  });
});
```

## 部署和构建优化

### 1. 构建配置优化
```toml
# src-tauri/Cargo.toml
[package]
name = "sys-prompt-switcher"
version = "1.0.0"
edition = "2021"

[dependencies]
tauri = { version = "2.0", features = ["icon-ico", "icon-png"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["full"] }
uuid = { version = "1.0", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1.0"
anyhow = "1.0"

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

### 2. Tauri 配置优化
```json
{
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
    "identifier": "com.example.sys-prompt-switcher",
    "category": "Utility",
    "shortDescription": "系统配置切换工具",
    "longDescription": "一个用于管理和切换系统配置文件的工具，支持模板管理和历史记录功能。"
  },
  "security": {
    "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';"
  }
}
```

这个架构指南提供了完整的项目组织、代码结构、测试策略和部署优化的最佳实践，为构建高质量的 Tauri 应用提供了详细的参考。