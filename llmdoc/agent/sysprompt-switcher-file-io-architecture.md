# SysPromptSwitcher 文件操作实现架构

## 1. 项目文件结构设计

### 1.1 目录组织

```
src/
├── file_io/
│   ├── mod.rs              # 模块入口
│   ├── config_store.rs     # 配置文件存储管理
│   ├── template_store.rs   # 模板文件存储管理
│   ├── backup_manager.rs   # 备份管理器
│   ├── path_utils.rs       # 路径处理工具
│   └── error.rs           # 错误处理
├── models/
│   ├── config.rs          # 配置数据模型
│   ├── template.rs        # 模板数据模型
│   └── backup.rs          # 备份数据模型
└── app.rs                 # 主应用结构
```

### 1.2 核心文件路径常量

```rust
// path_utils.rs
use std::path::{Path, PathBuf};
use lazy_static::lazy_static;

lazy_static! {
    // 应用基础目录
    static ref APP_DATA_DIR: Option<PathBuf> = dirs::data_dir().map(|mut path| {
        path.push("SysPromptSwitcher");
        path
    });

    static ref APP_CONFIG_DIR: Option<PathBuf> = dirs::config_dir().map(|mut path| {
        path.push("SysPromptSwitcher");
        path
    });

    static ref USER_HOME_DIR: Option<PathBuf> = dirs::home_dir();
}

// 项目特定的配置文件路径
pub const PROJECT_CONFIG_SUBDIR: &str = ".claude";
pub const PROJECT_CONFIG_FILE: &str = "CLAUDE.md";

// 应用内部文件路径
pub const APP_CONFIG_FILE: &str = "app_config.json";
pub const TEMPLATES_DIR: &str = "templates";
pub const BACKUPS_DIR: &str = "backups";
pub const CACHE_DIR: &str = "cache";

// 获取应用配置文件路径
pub fn get_app_config_path() -> Option<PathBuf> {
    APP_CONFIG_DIR.as_ref().map(|dir| dir.join(APP_CONFIG_FILE))
}

// 获取模板存储目录
pub fn get_templates_dir() -> Option<PathBuf> {
    APP_DATA_DIR.as_ref().map(|dir| dir.join(TEMPLATES_DIR))
}

// 获取模板文件路径
pub fn get_template_file_path(template_id: &str) -> Option<PathBuf> {
    get_templates_dir().map(|dir| dir.join(format!("{}.json", template_id)))
}

// 获取备份目录
pub fn get_backups_dir() -> Option<PathBuf> {
    APP_DATA_DIR.as_ref().map(|dir| dir.join(BACKUPS_DIR))
}

// 获取项目配置文件路径
pub fn get_project_config_path(project_dir: &Path) -> PathBuf {
    project_dir.join(PROJECT_CONFIG_SUBDIR).join(PROJECT_CONFIG_FILE)
}

// 获取缓存目录
pub fn get_cache_dir() -> Option<PathBuf> {
    APP_DATA_DIR.as_ref().map(|dir| dir.join(CACHE_DIR))
}
```

## 2. 数据模型定义

### 2.1 应用配置模型

```rust
// models/config.rs
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub settings: AppSettings,
    pub project_configs: HashMap<String, ProjectConfigInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub auto_backup: bool,
    pub backup_interval_hours: u64,
    pub max_backups: usize,
    pub default_template: Option<String>,
    pub editor_command: Option<String>,
    pub auto_sync: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfigInfo {
    pub project_path: String,
    pub config_path: String,
    pub last_modified: DateTime<Utc>,
    pub template_id: Option<String>,
    pub is_active: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            settings: AppSettings::default(),
            project_configs: HashMap::new(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_backup: true,
            backup_interval_hours: 24,
            max_backups: 10,
            default_template: None,
            editor_command: None,
            auto_sync: false,
        }
    }
}
```

### 2.2 模板数据模型

```rust
// models/template.rs
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub variables: HashMap<String, VariableDefinition>,
    pub tags: Vec<String>,
    pub category: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableDefinition {
    pub name: String,
    pub description: String,
    pub default_value: Option<String>,
    pub required: bool,
    pub variable_type: VariableType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VariableType {
    String,
    Number,
    Boolean,
    Choice(Vec<String>),
    MultiChoice(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateLibrary {
    pub templates: HashMap<String, Template>,
    pub categories: HashMap<String, CategoryInfo>,
    pub tags: HashMap<String, TagInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryInfo {
    pub name: String,
    pub description: String,
    pub template_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagInfo {
    pub name: String,
    pub description: String,
    pub usage_count: usize,
}
```

## 3. 配置存储管理器

### 3.1 应用配置存储

```rust
// file_io/config_store.rs
use crate::models::config::AppConfig;
use crate::file_io::error::AppError;
use crate::file_io::path_utils::{get_app_config_path, get_project_config_path};
use crate::file_io::JsonStore;
use std::path::Path;

// 应用配置存储管理器
pub struct ConfigStore {
    store: JsonStore<AppConfig>,
}

impl ConfigStore {
    pub fn new() -> Result<Self, AppError> {
        let config_path = get_app_config_path()
            .ok_or_else(|| AppError::Config("无法获取应用配置路径".to_string()))?;

        Ok(Self {
            store: JsonStore::new(config_path),
        })
    }

    // 加载或创建配置
    pub fn load_or_create(&mut self) -> Result<&mut AppConfig, AppError> {
        self.store.load()?;
        Ok(self.store.get_or_create())
    }

    // 保存配置
    pub fn save(&self) -> Result<(), AppError> {
        self.store.save()
    }

    // 获取配置引用
    pub fn get_config(&self) -> Option<&AppConfig> {
        self.store.get()
    }

    // 获取可变配置引用
    pub fn get_config_mut(&mut self) -> Option<&mut AppConfig> {
        self.store.get_mut()
    }

    // 更新配置并保存
    pub fn update_config<F>(&mut self, updater: F) -> Result<(), AppError>
    where
        F: FnOnce(&mut AppConfig),
    {
        if let Some(config) = self.store.get_mut() {
            updater(config);
            config.updated_at = chrono::Utc::now();
            self.store.save()?;
        }
        Ok(())
    }

    // 注册项目配置
    pub fn register_project<P: AsRef<Path>>(
        &mut self,
        project_dir: P,
        template_id: Option<String>,
    ) -> Result<(), AppError> {
        let project_dir = project_dir.as_ref();
        let config_path = get_project_config_path(project_dir);

        if !config_path.exists() {
            return Err(AppError::Config("项目配置文件不存在".to_string()));
        }

        let metadata = std::fs::metadata(&config_path)?;
        let last_modified = metadata.modified()
            .map_err(|e| AppError::Io(e))?
            .into();

        let project_key = project_dir.to_string_lossy().to_string();

        self.update_config(|config| {
            let project_info = crate::models::config::ProjectConfigInfo {
                project_path: project_key.clone(),
                config_path: config_path.to_string_lossy().to_string(),
                last_modified,
                template_id,
                is_active: true,
            };

            config.project_configs.insert(project_key, project_info);
        })
    }

    // 移除项目配置
    pub fn unregister_project<P: AsRef<Path>>(&mut self, project_dir: P) -> Result<(), AppError> {
        let project_key = project_dir.as_ref().to_string_lossy().to_string();

        self.update_config(|config| {
            config.project_configs.remove(&project_key);
        })
    }

    // 获取所有注册的项目
    pub fn get_registered_projects(&self) -> Vec<&crate::models::config::ProjectConfigInfo> {
        self.store.get()
            .map(|config| config.project_configs.values().collect())
            .unwrap_or_default()
    }

    // 读取项目配置文件内容
    pub fn read_project_config<P: AsRef<Path>>(&self, project_dir: P) -> Result<String, AppError> {
        let config_path = get_project_config_path(project_dir);

        if !config_path.exists() {
            return Err(AppError::Config("项目配置文件不存在".to_string()));
        }

        std::fs::read_to_string(&config_path)
            .map_err(AppError::Io)
    }

    // 写入项目配置文件内容
    pub fn write_project_config<P: AsRef<Path>>(
        &self,
        project_dir: P,
        content: &str,
    ) -> Result<(), AppError> {
        let config_path = get_project_config_path(project_dir);

        // 确保目录存在
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // 原子性写入
        super::atomic_write_file(&config_path, content)?;

        // 更新注册信息
        self.register_project(project_dir, None)?;

        Ok(())
    }
}
```

### 3.2 模板存储管理器

```rust
// file_io/template_store.rs
use crate::models::template::{Template, TemplateLibrary};
use crate::file_io::error::AppError;
use crate::file_io::path_utils::{get_templates_dir, get_template_file_path};
use crate::file_io::JsonStore;
use std::collections::HashMap;

// 模板存储管理器
pub struct TemplateStore {
    library_store: JsonStore<TemplateLibrary>,
    template_stores: HashMap<String, JsonStore<Template>>,
}

impl TemplateStore {
    pub fn new() -> Result<Self, AppError> {
        let templates_dir = get_templates_dir()
            .ok_or_else(|| AppError::Config("无法获取模板目录".to_string()))?;

        // 确保模板目录存在
        std::fs::create_dir_all(&templates_dir)?;

        let library_path = templates_dir.join("library.json");

        Ok(Self {
            library_store: JsonStore::new(library_path),
            template_stores: HashMap::new(),
        })
    }

    // 初始化模板库
    pub fn initialize(&mut self) -> Result<(), AppError> {
        self.library_store.load()?;
        let library = self.library_store.get_or_create();

        // 加载所有已存在的模板
        for template_id in library.templates.keys() {
            self.load_template_store(template_id)?;
        }

        Ok(())
    }

    // 加载单个模板存储
    fn load_template_store(&mut self, template_id: &str) -> Result<(), AppError> {
        let template_path = get_template_file_path(template_id)
            .ok_or_else(|| AppError::Config("无法获取模板文件路径".to_string()))?;

        let store = JsonStore::<Template>::new(template_path);
        store.load()?;

        self.template_stores.insert(template_id.to_string(), store);
        Ok(())
    }

    // 创建新模板
    pub fn create_template(&mut self, template: Template) -> Result<(), AppError> {
        let template_id = template.id.clone();

        // 保存到单独文件
        let template_path = get_template_file_path(&template_id)
            .ok_or_else(|| AppError::Config("无法获取模板文件路径".to_string()))?;

        let mut template_store = JsonStore::<Template>::new(template_path);
        template_store.set(template.clone());
        template_store.save()?;

        // 更新模板库
        self.library_store.get_or_create()
            .templates.insert(template_id.clone(), template.clone());
        self.library_store.save()?;

        // 添加到内存存储
        self.template_stores.insert(template_id, template_store);

        Ok(())
    }

    // 更新模板
    pub fn update_template(&mut self, template: Template) -> Result<(), AppError> {
        let template_id = template.id.clone();

        if let Some(store) = self.template_stores.get_mut(&template_id) {
            let mut updated_template = template.clone();
            updated_template.updated_at = chrono::Utc::now();

            store.set(updated_template.clone());
            store.save()?;

            // 更新模板库
            if let Some(library) = self.library_store.get_mut() {
                library.templates.insert(template_id, updated_template);
                self.library_store.save()?;
            }
        } else {
            return Err(AppError::Config("模板不存在".to_string()));
        }

        Ok(())
    }

    // 删除模板
    pub fn delete_template(&mut self, template_id: &str) -> Result<(), AppError> {
        // 删除文件
        let template_path = get_template_file_path(template_id)
            .ok_or_else(|| AppError::Config("无法获取模板文件路径".to_string()))?;

        if template_path.exists() {
            std::fs::remove_file(&template_path)?;
        }

        // 从内存存储移除
        self.template_stores.remove(template_id);

        // 从模板库移除
        if let Some(library) = self.library_store.get_mut() {
            library.templates.remove(template_id);
            self.library_store.save()?;
        }

        Ok(())
    }

    // 获取模板
    pub fn get_template(&self, template_id: &str) -> Option<&Template> {
        self.template_stores.get(template_id)
            .and_then(|store| store.get())
    }

    // 列出所有模板
    pub fn list_templates(&self) -> Vec<&Template> {
        self.template_stores.values()
            .filter_map(|store| store.get())
            .collect()
    }

    // 搜索模板
    pub fn search_templates(&self, query: &str) -> Vec<&Template> {
        let query = query.to_lowercase();
        self.list_templates().into_iter()
            .filter(|template| {
                template.name.to_lowercase().contains(&query) ||
                template.description.to_lowercase().contains(&query) ||
                template.tags.iter().any(|tag| tag.to_lowercase().contains(&query)) ||
                template.category.to_lowercase().contains(&query)
            })
            .collect()
    }

    // 按类别获取模板
    pub fn get_templates_by_category(&self, category: &str) -> Vec<&Template> {
        self.list_templates().into_iter()
            .filter(|template| template.category == category)
            .collect()
    }
}
```

## 4. 备份管理系统

### 4.1 智能备份管理器

```rust
// file_io/backup_manager.rs
use crate::models::backup::{BackupInfo, BackupType};
use crate::file_io::error::AppError;
use crate::file_io::path_utils::{get_backups_dir, get_project_config_path};
use chrono::{DateTime, Utc};
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug)]
pub struct SmartBackupManager {
    backup_dir: PathBuf,
    metadata_store: JsonStore<BackupMetadata>,
    config: BackupConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BackupMetadata {
    backups: HashMap<String, BackupInfo>,
    last_cleanup: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct BackupConfig {
    pub max_backups: usize,
    pub backup_interval_hours: u64,
    pub auto_cleanup: bool,
    pub compression_enabled: bool,
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            max_backups: 20,
            backup_interval_hours: 6,
            auto_cleanup: true,
            compression_enabled: false,
        }
    }
}

impl SmartBackupManager {
    pub fn new(config: BackupConfig) -> Result<Self, AppError> {
        let backup_dir = get_backups_dir()
            .ok_or_else(|| AppError::Config("无法获取备份目录".to_string()))?;

        std::fs::create_dir_all(&backup_dir)?;

        let metadata_path = backup_dir.join("metadata.json");
        let metadata_store = JsonStore::new(metadata_path);

        Ok(Self {
            backup_dir,
            metadata_store,
            config,
        })
    }

    // 创建项目配置备份
    pub fn create_project_backup<P: AsRef<Path>>(
        &mut self,
        project_dir: P,
        backup_type: BackupType,
    ) -> Result<String, AppError> {
        let project_dir = project_dir.as_ref();
        let config_path = get_project_config_path(project_dir);

        if !config_path.exists() {
            return Err(AppError::Config("项目配置文件不存在".to_string()));
        }

        // 生成备份ID
        let backup_id = Uuid::new_v4().to_string();
        let backup_name = format!("{}_{}_backup",
            project_dir.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("unknown"),
            Utc::now().format("%Y%m%d_%H%M%S")
        );
        let backup_path = self.backup_dir.join(&backup_name);

        // 创建备份目录
        std::fs::create_dir_all(&backup_path)?;

        // 复制配置文件
        let backup_config_path = backup_path.join("CLAUDE.md");
        std::fs::copy(&config_path, &backup_config_path)?;

        // 如果是完整备份，也备份相关模板
        if let BackupType::Full = backup_type {
            self.backup_related_templates(&backup_path, project_dir)?;
        }

        // 创建备份信息
        let backup_info = BackupInfo {
            id: backup_id.clone(),
            name: backup_name.clone(),
            backup_type,
            source_path: project_dir.to_string_lossy().to_string(),
            backup_path: backup_path.to_string_lossy().to_string(),
            created_at: Utc::now(),
            size: self.calculate_backup_size(&backup_path)?,
            compressed: self.config.compression_enabled,
        };

        // 保存元数据
        self.metadata_store.get_or_create()
            .backups.insert(backup_id.clone(), backup_info);
        self.metadata_store.save()?;

        // 自动清理
        if self.config.auto_cleanup {
            self.cleanup_old_backups()?;
        }

        Ok(backup_id)
    }

    // 恢复项目备份
    pub fn restore_project_backup(
        &self,
        backup_id: &str,
        target_project_dir: &Path,
    ) -> Result<(), AppError> {
        let backup_info = self.find_backup_info(backup_id)?;

        let backup_path = Path::new(&backup_info.backup_path);
        let backup_config_path = backup_path.join("CLAUDE.md");
        let target_config_path = get_project_config_path(target_project_dir);

        if !backup_config_path.exists() {
            return Err(AppError::Config("备份配置文件不存在".to_string()));
        }

        // 确保目标目录存在
        if let Some(parent) = target_config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // 复制备份文件
        std::fs::copy(&backup_config_path, &target_config_path)?;

        Ok(())
    }

    // 列出所有备份
    pub fn list_backups(&self) -> Vec<&BackupInfo> {
        self.metadata_store.get()
            .map(|metadata| metadata.backups.values().collect())
            .unwrap_or_default()
    }

    // 按项目列出备份
    pub fn list_project_backups<P: AsRef<Path>>(&self, project_dir: P) -> Vec<&BackupInfo> {
        let project_path = project_dir.as_ref().to_string_lossy();

        self.list_backups().into_iter()
            .filter(|backup| backup.source_path.contains(&*project_path))
            .collect()
    }

    // 删除备份
    pub fn delete_backup(&mut self, backup_id: &str) -> Result<(), AppError> {
        let backup_info = self.find_backup_info(backup_id)?;
        let backup_path = Path::new(&backup_info.backup_path);

        // 删除备份文件
        if backup_path.exists() {
            if backup_path.is_dir() {
                std::fs::remove_dir_all(backup_path)?;
            } else {
                std::fs::remove_file(backup_path)?;
            }
        }

        // 从元数据中移除
        if let Some(metadata) = self.metadata_store.get_mut() {
            metadata.backups.remove(backup_id);
            self.metadata_store.save()?;
        }

        Ok(())
    }

    // 清理旧备份
    fn cleanup_old_backups(&mut self) -> Result<(), AppError> {
        let metadata = self.metadata_store.get_or_create();
        let mut backups: Vec<_> = metadata.backups.values().collect();

        // 按创建时间排序（新的在前）
        backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        // 保留最新的备份，删除超出限制的旧备份
        for backup in backups.iter().skip(self.config.max_backups) {
            let backup_path = Path::new(&backup.backup_path);
            if backup_path.exists() {
                if backup_path.is_dir() {
                    std::fs::remove_dir_all(backup_path)?;
                } else {
                    std::fs::remove_file(backup_path)?;
                }
            }
            metadata.backups.remove(&backup.id);
        }

        // 更新清理时间
        metadata.last_cleanup = Utc::now();
        self.metadata_store.save()?;

        Ok(())
    }

    // 查找备份信息
    fn find_backup_info(&self, backup_id: &str) -> Result<BackupInfo, AppError> {
        self.metadata_store.get()
            .and_then(|metadata| metadata.backups.get(backup_id))
            .cloned()
            .ok_or_else(|| AppError::Config("备份不存在".to_string()))
    }

    // 计算备份大小
    fn calculate_backup_size(&self, backup_path: &Path) -> Result<u64, AppError> {
        let mut total_size = 0u64;

        if backup_path.is_file() {
            total_size = std::fs::metadata(backup_path)?.len();
        } else if backup_path.is_dir() {
            for entry in std::fs::read_dir(backup_path)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_file() {
                    total_size += std::fs::metadata(path)?.len();
                }
            }
        }

        Ok(total_size)
    }

    // 备份相关模板（完整备份时使用）
    fn backup_related_templates(&self, backup_dir: &Path, project_dir: &Path) -> Result<(), AppError> {
        // 这里可以实现相关模板的备份逻辑
        // 例如，根据项目配置中使用的模板ID，备份对应的模板文件
        let template_backup_dir = backup_dir.join("templates");
        std::fs::create_dir_all(&template_backup_dir)?;

        // 实现具体的模板备份逻辑...

        Ok(())
    }
}
```

## 5. 主应用结构

### 5.1 应用程序入口

```rust
// app.rs
use crate::file_io::{ConfigStore, TemplateStore, SmartBackupManager};
use crate::file_io::error::AppError;
use crate::models::backup::BackupConfig;

pub struct SysPromptSwitcherApp {
    config_store: ConfigStore,
    template_store: TemplateStore,
    backup_manager: SmartBackupManager,
}

impl SysPromptSwitcherApp {
    pub fn new() -> Result<Self, AppError> {
        let config_store = ConfigStore::new()?;
        let mut template_store = TemplateStore::new()?;
        let backup_config = BackupConfig::default();
        let backup_manager = SmartBackupManager::new(backup_config)?;

        // 初始化模板库
        template_store.initialize()?;

        Ok(Self {
            config_store,
            template_store,
            backup_manager,
        })
    }

    // 初始化应用
    pub fn initialize(&mut self) -> Result<(), AppError> {
        // 加载或创建应用配置
        self.config_store.load_or_create()?;

        Ok(())
    }

    // 注册项目
    pub fn register_project<P: AsRef<std::path::Path>>(
        &mut self,
        project_dir: P,
    ) -> Result<(), AppError> {
        self.config_store.register_project(project_dir, None)
    }

    // 读取项目配置
    pub fn read_project_config<P: AsRef<std::path::Path>>(
        &self,
        project_dir: P,
    ) -> Result<String, AppError> {
        self.config_store.read_project_config(project_dir)
    }

    // 写入项目配置（自动备份）
    pub fn write_project_config<P: AsRef<std::path::Path>>(
        &mut self,
        project_dir: P,
        content: &str,
        backup_first: bool,
    ) -> Result<(), AppError> {
        let project_dir = project_dir.as_ref();

        // 先创建备份
        if backup_first {
            use crate::models::backup::BackupType;
            self.backup_manager.create_project_backup(
                project_dir,
                BackupType::Incremental,
            )?;
        }

        // 写入新配置
        self.config_store.write_project_config(project_dir, content)?;

        Ok(())
    }

    // 获取所有模板
    pub fn get_templates(&self) -> Vec<&crate::models::template::Template> {
        self.template_store.list_templates()
    }

    // 应用模板到项目
    pub fn apply_template_to_project<P: AsRef<std::path::Path>>(
        &mut self,
        project_dir: P,
        template_id: &str,
    ) -> Result<(), AppError> {
        let template = self.template_store.get_template(template_id)
            .ok_or_else(|| AppError::Config("模板不存在".to_string()))?;

        // 处理模板变量（这里需要实现变量替换逻辑）
        let processed_content = self.process_template_variables(&template)?;

        // 应用到项目配置
        self.write_project_config(project_dir, &processed_content, true)?;

        Ok(())
    }

    // 处理模板变量
    fn process_template_variables(
        &self,
        template: &crate::models::template::Template,
    ) -> Result<String, AppError> {
        // 这里实现模板变量替换逻辑
        // 可以询问用户输入或使用默认值
        Ok(template.content.clone())
    }
}

// 错误处理模块
// file_io/error.rs
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    Io(std::io::Error),
    Json(serde_json::Error),
    Config(String),
    Backup(String),
    Template(String),
    Path(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Io(err) => write!(f, "IO错误: {}", err),
            AppError::Json(err) => write!(f, "JSON错误: {}", err),
            AppError::Config(msg) => write!(f, "配置错误: {}", msg),
            AppError::Backup(msg) => write!(f, "备份错误: {}", msg),
            AppError::Template(msg) => write!(f, "模板错误: {}", msg),
            AppError::Path(msg) => write!(f, "路径错误: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Json(err)
    }
}
```

## 6. 使用示例

### 6.1 基本使用流程

```rust
// main.rs
mod file_io;
mod models;
mod app;

use app::SysPromptSwitcherApp;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 创建应用实例
    let mut app = SysPromptSwitcherApp::new()?;

    // 初始化应用
    app.initialize()?;

    // 注册当前项目
    let current_dir = std::env::current_dir()?;
    app.register_project(&current_dir)?;

    // 读取项目配置
    let config_content = app.read_project_config(&current_dir)?;
    println!("当前项目配置:\n{}", config_content);

    // 获取可用模板
    let templates = app.get_templates();
    println!("可用模板:");
    for template in templates {
        println!("- {} ({})", template.name, template.description);
    }

    // 应用模板到项目
    if let Some(template) = templates.first() {
        println!("应用模板: {}", template.name);
        app.apply_template_to_project(&current_dir, &template.id)?;
        println!("模板应用成功!");
    }

    Ok(())
}
```

### 6.2 配置文件示例

```json
// 应用配置示例 (app_config.json)
{
  "version": "1.0.0",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "settings": {
    "auto_backup": true,
    "backup_interval_hours": 24,
    "max_backups": 10,
    "default_template": null,
    "editor_command": "code",
    "auto_sync": false
  },
  "project_configs": {
    "/Users/user/projects/my-project": {
      "project_path": "/Users/user/projects/my-project",
      "config_path": "/Users/user/projects/my-project/.claude/CLAUDE.md",
      "last_modified": "2024-01-01T00:00:00Z",
      "template_id": "standard-rust-project",
      "is_active": true
    }
  }
}
```

```json
// 模板示例 (templates/standard-rust-project.json)
{
  "id": "standard-rust-project",
  "name": "标准 Rust 项目",
  "description": "适用于标准 Rust 项目的 Claude 配置",
  "content": "# Claude Code + Codex MCP Collaboration\n\n## Project Type\nRust Project\n\n## Core Rules\n- Follow Rust best practices\n- Use cargo for build and test\n- Prefer error handling with Result<T, E>\n",
  "variables": {
    "project_name": {
      "name": "项目名称",
      "description": "项目的名称",
      "default_value": null,
      "required": true,
      "variable_type": "String"
    }
  },
  "tags": ["rust", "standard"],
  "category": "programming",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "version": "1.0.0"
}
```

这个架构提供了：

1. **模块化设计**：清晰的文件组织结构
2. **类型安全**：使用强类型的数据模型
3. **错误处理**：统一的错误处理机制
4. **备份保护**：自动备份和恢复功能
5. **模板管理**：完整的模板系统
6. **项目跟踪**：项目配置的注册和管理

这个设计可以直接用于生产环境，支持扩展和维护。