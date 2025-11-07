# Rust 安全文件操作和 JSON 存储技术指南

## 1. 文件读写操作

### 1.1 基本文本文件读写

```rust
use std::fs;
use std::io::{self, Read, Write};
use std::path::Path;

// 安全读取文件内容
pub fn read_file_content<P: AsRef<Path>>(path: P) -> io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    Ok(content)
}

// 原子性写入（临时文件 + 重命名）
pub fn atomic_write_file<P: AsRef<Path>>(path: P, content: &str) -> io::Result<()> {
    let path = path.as_ref();

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    // 创建临时文件
    let temp_path = path.with_extension("tmp");
    {
        let mut temp_file = fs::File::create(&temp_path)?;
        temp_file.write_all(content.as_bytes())?;
        temp_file.sync_all()?; // 强制写入磁盘
    }

    // 原子性重命名
    fs::rename(&temp_path, path)?;
    Ok(())
}
```

### 1.2 目录操作

```rust
use std::path::Path;

// 创建多级目录
pub fn ensure_directory_exists<P: AsRef<Path>>(path: P) -> io::Result<()> {
    fs::create_dir_all(path)
}

// 检查路径是否存在且为文件
pub fn file_exists<P: AsRef<Path>>(path: P) -> bool {
    path.as_ref().is_file()
}

// 检查路径是否存在且为目录
pub fn dir_exists<P: AsRef<Path>>(path: P) -> bool {
    path.as_ref().is_dir()
}
```

## 2. JSON 数据存储实现

### 2.1 JsonStore 结构体实现

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::Path;

// JSON 存储管理器
pub struct JsonStore<T: Serialize + for<'de> Deserialize<'de>> {
    file_path: std::path::PathBuf,
    data: Option<T>,
}

impl<T: Serialize + for<'de> Deserialize<'de>> JsonStore<T> {
    // 创建新的 JSON 存储实例
    pub fn new<P: AsRef<Path>>(file_path: P) -> Self {
        Self {
            file_path: file_path.as_ref().to_path_buf(),
            data: None,
        }
    }

    // 从文件加载数据
    pub fn load(&mut self) -> io::Result<()> {
        if self.file_path.exists() {
            let content = fs::read_to_string(&self.file_path)?;
            let data: T = serde_json::from_str(&content)
                .map_err(|e| io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("JSON 解析失败: {}", e)
                ))?;
            self.data = Some(data);
        }
        Ok(())
    }

    // 保存数据到文件
    pub fn save(&self) -> io::Result<()> {
        if let Some(ref data) = self.data {
            let json_content = serde_json::to_string_pretty(data)
                .map_err(|e| io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("JSON 序列化失败: {}", e)
                ))?;

            // 使用原子性写入
            atomic_write_file(&self.file_path, &json_content)?;
        }
        Ok(())
    }

    // 获取数据引用
    pub fn get(&self) -> Option<&T> {
        self.data.as_ref()
    }

    // 获取可变数据引用
    pub fn get_mut(&mut self) -> Option<&mut T> {
        self.data.as_mut()
    }

    // 设置数据
    pub fn set(&mut self, data: T) {
        self.data = Some(data);
    }

    // 获取或创建数据（需要 T 实现默认值）
    pub fn get_or_create(&mut self) -> &mut T
    where
        T: Default,
    {
        if self.data.is_none() {
            self.data = Some(T::default());
        }
        self.data.as_mut().unwrap()
    }
}
```

### 2.2 复杂数据结构示例

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// 配置文件数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: String,
    pub templates: HashMap<String, TemplateConfig>,
    pub settings: Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateConfig {
    pub name: String,
    pub description: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub auto_backup: bool,
    pub backup_count: usize,
    pub default_template: Option<String>,
}

// 使用示例
pub fn manage_config() -> io::Result<()> {
    let config_path = get_config_dir()?.join("config.json");
    let mut store = JsonStore::<AppConfig>::new(config_path);

    // 加载或创建默认配置
    store.load()?;
    let config = store.get_or_create();

    // 修改配置
    config.version = "1.0.0".to_string();
    config.settings.auto_backup = true;

    // 保存配置
    store.save()?;
    Ok(())
}
```

## 3. 跨平台路径处理

### 3.1 路径构建和标准化

```rust
use std::path::{Path, PathBuf};

// 获取用户主目录
pub fn get_home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

// 获取应用数据目录
pub fn get_app_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|mut path| {
        path.push("SysPromptSwitcher");
        path
    })
}

// 获取配置目录
pub fn get_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|mut path| {
        path.push("SysPromptSwitcher");
        path
    })
}

// 构建项目配置文件路径
pub fn get_project_config_path(project_dir: &Path) -> PathBuf {
    project_dir.join(".claude").join("CLAUDE.md")
}

// 构建备份目录路径
pub fn get_backup_dir_path() -> Option<PathBuf> {
    get_app_data_dir().map(|mut path| {
        path.push("backups");
        path
    })
}

// 路径标准化
pub fn normalize_path<P: AsRef<Path>>(path: P) -> PathBuf {
    let path = path.as_ref();

    // 处理绝对路径
    if path.is_absolute() {
        // 移除冗余的 . 和 ..
        path.components().collect::<PathBuf>()
    } else {
        // 相对路径转换为绝对路径
        let current_dir = std::env::current_dir().unwrap_or_default();
        current_dir.join(path).components().collect::<PathBuf>()
    }
}

// 路径拼接（避免手动字符串拼接）
pub fn safe_join_paths<P: AsRef<Path>>(base: P, components: &[&str]) -> PathBuf {
    let mut path = base.as_ref().to_path_buf();
    for component in components {
        path = path.join(component);
    }
    path
}
```

### 3.2 Windows 长路径处理

```rust
#[cfg(windows)]
pub fn prepare_long_path(path: &Path) -> String {
    use std::os::windows::ffi::OsStrExt;

    if path.as_os_str().len() >= 260 {
        // 添加 UNC 前缀以支持长路径
        format!("\\\\?\\{}", path.to_string_lossy())
    } else {
        path.to_string_lossy().to_string()
    }
}

#[cfg(not(windows))]
pub fn prepare_long_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}
```

## 4. 备份机制实现

### 4.1 备份管理器

```rust
use chrono::{DateTime, Utc};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

// 备份管理器
pub struct BackupManager {
    backup_dir: PathBuf,
    max_backups: usize,
}

impl BackupManager {
    pub fn new<P: AsRef<Path>>(backup_dir: P, max_backups: usize) -> io::Result<Self> {
        let backup_dir = backup_dir.as_ref().to_path_buf();
        fs::create_dir_all(&backup_dir)?;

        Ok(Self {
            backup_dir,
            max_backups,
        })
    }

    // 创建备份
    pub fn create_backup<P: AsRef<Path>>(&self, source_path: P) -> io::Result<PathBuf> {
        let source_path = source_path.as_ref();

        if !source_path.exists() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "源文件不存在"
            ));
        }

        // 生成唯一的备份目录名
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let uuid = Uuid::new_v4().to_string().split_at(8).0;
        let backup_name = format!("backup_{}_{}", timestamp, uuid);
        let backup_path = self.backup_dir.join(backup_name);

        // 复制文件或目录
        if source_path.is_file() {
            fs::copy(source_path, &backup_path)?;
        } else {
            copy_recursively(source_path, &backup_path)?;
        }

        // 清理旧备份
        self.cleanup_old_backups()?;

        Ok(backup_path)
    }

    // 清理旧备份
    fn cleanup_old_backups(&self) -> io::Result<()> {
        let mut entries: Vec<_> = fs::read_dir(&self.backup_dir)?
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| {
                let metadata = entry.metadata().ok()?;
                let created = metadata.created().ok()?;
                Some((entry.path(), created))
            })
            .collect();

        // 按创建时间排序（新的在前）
        entries.sort_by_key(|&(_, created)| std::cmp::Reverse(created));

        // 删除超出限制的旧备份
        if entries.len() > self.max_backups {
            for (path, _) in entries.iter().skip(self.max_backups) {
                if path.is_dir() {
                    fs::remove_dir_all(path)?;
                } else {
                    fs::remove_file(path)?;
                }
            }
        }

        Ok(())
    }

    // 列出所有备份
    pub fn list_backups(&self) -> io::Result<Vec<PathBuf>> {
        let backups: Vec<_> = fs::read_dir(&self.backup_dir)?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .collect();
        Ok(backups)
    }

    // 恢复备份
    pub fn restore_backup<P: AsRef<Path>>(&self, backup_path: P, target_path: P) -> io::Result<()> {
        let backup_path = backup_path.as_ref();
        let target_path = target_path.as_ref();

        if !backup_path.exists() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "备份文件不存在"
            ));
        }

        // 确保目标目录存在
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // 复制备份到目标位置
        if backup_path.is_file() {
            fs::copy(backup_path, target_path)?;
        } else {
            // 如果目标目录存在，先删除
            if target_path.exists() {
                fs::remove_dir_all(target_path)?;
            }
            copy_recursively(backup_path, target_path)?;
        }

        Ok(())
    }
}

// 递归复制目录
fn copy_recursively<P: AsRef<Path>, Q: AsRef<Path>>(source: P, destination: Q) -> io::Result<()> {
    let source = source.as_ref();
    let destination = destination.as_ref();

    fs::create_dir_all(destination)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let source_path = entry.path();
        let dest_path = destination.join(entry.file_name());

        if file_type.is_file() {
            fs::copy(source_path, dest_path)?;
        } else if file_type.is_dir() {
            copy_recursively(source_path, dest_path)?;
        }
    }

    Ok(())
}
```

### 4.2 自动备份策略

```rust
// 自动备份配置
#[derive(Debug, Clone)]
pub struct AutoBackupConfig {
    pub enabled: bool,
    pub max_backups: usize,
    pub backup_interval: chrono::Duration,
}

impl Default for AutoBackupConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_backups: 10,
            backup_interval: chrono::Duration::hours(24),
        }
    }
}

// 自动备份管理器
pub struct AutoBackupManager {
    backup_manager: BackupManager,
    config: AutoBackupConfig,
    last_backup: Option<DateTime<Utc>>,
}

impl AutoBackupManager {
    pub fn new<P: AsRef<Path>>(backup_dir: P) -> io::Result<Self> {
        let backup_manager = BackupManager::new(backup_dir, 10)?;
        Ok(Self {
            backup_manager,
            config: AutoBackupConfig::default(),
            last_backup: None,
        })
    }

    // 检查是否需要备份
    pub fn should_backup(&self) -> bool {
        if !self.config.enabled {
            return false;
        }

        match self.last_backup {
            Some(last) => Utc::now() - last > self.config.backup_interval,
            None => true,
        }
    }

    // 执行自动备份
    pub fn auto_backup<P: AsRef<Path>>(&mut self, path: P) -> io::Result<bool> {
        if self.should_backup() {
            self.backup_manager.create_backup(path)?;
            self.last_backup = Some(Utc::now());
            Ok(true)
        } else {
            Ok(false)
        }
    }
}
```

## 5. 错误处理模式

### 5.1 自定义错误类型

```rust
use std::fmt;

// 应用错误类型
#[derive(Debug)]
pub enum AppError {
    Io(io::Error),
    Json(serde_json::Error),
    Config(String),
    Backup(String),
    Path(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Io(err) => write!(f, "IO 错误: {}", err),
            AppError::Json(err) => write!(f, "JSON 错误: {}", err),
            AppError::Config(msg) => write!(f, "配置错误: {}", msg),
            AppError::Backup(msg) => write!(f, "备份错误: {}", msg),
            AppError::Path(msg) => write!(f, "路径错误: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

// 从其他错误类型转换
impl From<io::Error> for AppError {
    fn from(err: io::Error) -> Self {
        AppError::Io(err)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Json(err)
    }
}

// 错误处理宏
macro_rules! map_err {
    ($expr:expr, $variant:ident, $msg:expr) => {
        $expr.map_err(|e| AppError::$variant(format!("{}: {}", $msg, e)))
    };
}
```

### 5.2 Result 类型使用

```rust
// 类型别名
pub type AppResult<T> = Result<T, AppError>;

// 函数示例
pub fn load_app_config() -> AppResult<AppConfig> {
    let config_path = get_config_dir()
        .ok_or_else(|| AppError::Config("无法获取配置目录".to_string()))?
        .join("config.json");

    let content = fs::read_to_string(&config_path)?;
    let config: AppConfig = serde_json::from_str(&content)?;

    Ok(config)
}

// 安全操作包装器
pub fn safe_file_operation<F, R>(operation: F) -> AppResult<R>
where
    F: FnOnce() -> io::Result<R>,
{
    operation().map_err(AppError::Io)
}
```

### 5.3 错误恢复策略

```rust
// 错误恢复策略
pub struct ErrorRecovery {
    max_retries: usize,
    retry_delay: std::time::Duration,
}

impl ErrorRecovery {
    pub fn new(max_retries: usize, retry_delay: std::time::Duration) -> Self {
        Self {
            max_retries,
            retry_delay,
        }
    }

    // 带重试的操作执行
    pub fn execute_with_retry<F, R>(&self, mut operation: F) -> AppResult<R>
    where
        F: FnMut() -> AppResult<R>,
    {
        let mut last_error = None;

        for attempt in 0..=self.max_retries {
            match operation() {
                Ok(result) => return Ok(result),
                Err(e) => {
                    last_error = Some(e);
                    if attempt < self.max_retries {
                        std::thread::sleep(self.retry_delay);
                    }
                }
            }
        }

        Err(last_error.unwrap())
    }
}
```

## 6. 完整使用示例

```rust
// 主应用结构
pub struct App {
    config_store: JsonStore<AppConfig>,
    backup_manager: BackupManager,
    auto_backup: AutoBackupManager,
}

impl App {
    pub fn new() -> AppResult<Self> {
        let config_path = get_config_dir()
            .ok_or_else(|| AppError::Config("无法获取配置目录".to_string()))?
            .join("config.json");

        let config_store = JsonStore::<AppConfig>::new(config_path);

        let backup_dir = get_backup_dir_path()
            .ok_or_else(|| AppError::Config("无法获取备份目录".to_string()))?;

        let backup_manager = BackupManager::new(backup_dir, 10)?;
        let auto_backup = AutoBackupManager::new(backup_dir)?;

        Ok(Self {
            config_store,
            backup_manager,
            auto_backup,
        })
    }

    // 初始化应用
    pub fn initialize(&mut self) -> AppResult<()> {
        // 加载配置
        self.config_store.load()?;

        // 确保配置存在
        self.config_store.get_or_create();

        // 保存初始配置
        self.config_store.save()?;

        Ok(())
    }

    // 保存配置（带备份）
    pub fn save_config_with_backup(&mut self) -> AppResult<()> {
        let config_path = &self.config_store.file_path;

        // 创建备份
        if config_path.exists() {
            self.backup_manager.create_backup(config_path)?;
        }

        // 保存新配置
        self.config_store.save()?;

        Ok(())
    }

    // 处理项目配置文件
    pub fn process_project_config<P: AsRef<Path>>(&mut self, project_dir: P) -> AppResult<()> {
        let project_dir = project_dir.as_ref();
        let config_path = get_project_config_path(project_dir);

        // 如果配置文件存在，读取内容
        if config_path.exists() {
            let content = read_file_content(&config_path)?;
            // 处理配置内容...
            println!("项目配置内容: {}", content);
        }

        Ok(())
    }
}

fn main() -> AppResult<()> {
    let mut app = App::new()?;
    app.initialize()?;

    // 示例：处理当前目录的项目配置
    if let Ok(current_dir) = std::env::current_dir() {
        app.process_project_config(current_dir)?;
    }

    Ok(())
}
```

## 7. Cargo.toml 依赖

```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
dirs = "5.0"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.0", features = ["v4"] }
tokio = { version = "1.0", features = ["full"] }  # 如需异步操作
anyhow = "1.0"  # 可选：更简化的错误处理
thiserror = "1.0"  # 可选：更优雅的错误类型定义
```

## 8. 关键要点总结

1. **原子性文件操作**：使用临时文件 + 重命名确保数据一致性
2. **错误处理**：自定义错误类型 + From 转换，统一错误处理
3. **跨平台路径**：使用 `std::path::PathBuf` 和 `dirs` 库，避免手动拼接
4. **JSON 存储**：使用 `serde` 序列化，实现通用的 `JsonStore` 管理器
5. **备份机制**：时间戳 + UUID 命名，自动清理旧备份
6. **重试策略**：对可恢复的错误实现重试机制

这些代码示例提供了生产级的安全文件操作基础，可以根据具体需求进行扩展和定制。