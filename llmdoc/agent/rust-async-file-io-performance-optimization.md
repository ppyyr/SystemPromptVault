# Rust 异步文件操作和性能优化方案

## 1. 异步文件 I/O 操作

### 1.1 使用 Tokio 进行异步文件操作

```rust
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use std::path::Path;

// 异步读取文件
pub async fn async_read_file_content<P: AsRef<Path>>(path: P) -> Result<String, std::io::Error> {
    let mut file = fs::File::open(path).await?;
    let mut content = String::new();
    file.read_to_string(&mut content).await?;
    Ok(content)
}

// 异步原子性写入
pub async fn async_atomic_write_file<P: AsRef<Path>>(
    path: P,
    content: &str
) -> Result<(), std::io::Error> {
    let path = path.as_ref();

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }

    // 创建临时文件
    let temp_path = path.with_extension("tmp");
    {
        let mut temp_file = fs::File::create(&temp_path).await?;
        temp_file.write_all(content.as_bytes()).await?;
        temp_file.sync_all().await?;
    }

    // 原子性重命名
    fs::rename(&temp_path, path).await?;
    Ok(())
}

// 异步目录创建
pub async fn async_ensure_directory_exists<P: AsRef<Path>>(path: P) -> Result<(), std::io::Error> {
    fs::create_dir_all(path).await
}
```

### 1.2 异步 JSON 存储

```rust
use tokio::fs;
use serde::{Deserialize, Serialize};

// 异步 JSON 存储管理器
pub struct AsyncJsonStore<T: Serialize + for<'de> Deserialize<'de>> {
    file_path: std::path::PathBuf,
    data: Option<T>,
}

impl<T: Serialize + for<'de> Deserialize<'de>> AsyncJsonStore<T> {
    pub fn new<P: AsRef<Path>>(file_path: P) -> Self {
        Self {
            file_path: file_path.as_ref().to_path_buf(),
            data: None,
        }
    }

    // 异步加载数据
    pub async fn load(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if self.file_path.exists() {
            let content = fs::read_to_string(&self.file_path).await?;
            let data: T = serde_json::from_str(&content)?;
            self.data = Some(data);
        }
        Ok(())
    }

    // 异步保存数据
    pub async fn save(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(ref data) = self.data {
            let json_content = serde_json::to_string_pretty(data)?;
            async_atomic_write_file(&self.file_path, &json_content).await?;
        }
        Ok(())
    }

    // 批量操作
    pub async fn batch_update<F>(&mut self, updater: F) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
    where
        F: FnOnce(&mut T),
    {
        if let Some(data) = &mut self.data {
            updater(data);
            self.save().await?;
        }
        Ok(())
    }
}
```

## 2. 性能优化方案

### 2.1 内存映射文件操作

```rust
use memmap2::{Mmap, MmapOptions};
use std::fs::File;

// 内存映射读取大文件
pub struct MappedFileReader {
    file: File,
    mmap: Mmap,
}

impl MappedFileReader {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, std::io::Error> {
        let file = File::open(path)?;
        let mmap = unsafe { MmapOptions::new().map(&file)? };

        Ok(Self { file, mmap })
    }

    // 高效读取内容
    pub fn as_slice(&self) -> &[u8] {
        &self.mmap
    }

    // 搜索特定内容
    pub fn find_bytes(&self, pattern: &[u8]) -> Option<usize> {
        self.mmap.windows(pattern.len())
            .position(|window| window == pattern)
    }
}

// 内存映射写入（适用于大文件更新）
pub struct MappedFileWriter {
    file: File,
    mmap: MmapMut,
}

use memmap2::MmapMut;

impl MappedFileWriter {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, std::io::Error> {
        let file = File::options()
            .read(true)
            .write(true)
            .open(path)?;

        let mmap = unsafe { MmapOptions::new().map_mut(&file)? };

        Ok(Self { file, mmap })
    }

    // 修改文件内容
    pub fn modify_bytes<F>(&mut self, modifier: F) -> Result<(), std::io::Error>
    where
        F: FnOnce(&mut [u8]),
    {
        modifier(&mut self.mmap);
        self.mmap.flush()?;
        Ok(())
    }
}
```

### 2.2 缓存和批处理优化

```rust
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::time::interval;

// LRU 缓存实现
#[derive(Debug)]
pub struct LRUCache<K, V> {
    capacity: usize,
    cache: HashMap<K, (V, Instant)>,
    ttl: Duration,
}

impl<K: Clone + Eq + std::hash::Hash, V> LRUCache<K, V> {
    pub fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            capacity,
            cache: HashMap::new(),
            ttl,
        }
    }

    pub fn get(&mut self, key: &K) -> Option<&V> {
        self.cache.retain(|_, (_, timestamp)| {
            timestamp.elapsed() < self.ttl
        });

        if let Some((value, _)) = self.cache.get_mut(key) {
            *value; // 更新时间戳逻辑
            Some(value)
        } else {
            None
        }
    }

    pub fn insert(&mut self, key: K, value: V) {
        if self.cache.len() >= self.capacity {
            // 简单的 LRU：移除最旧的条目
            if let Some(oldest_key) = self.cache.iter()
                .min_by_key(|(_, (_, timestamp))| *timestamp)
                .map(|(k, _)| k.clone()) {
                self.cache.remove(&oldest_key);
            }
        }

        self.cache.insert(key, (value, Instant::now()));
    }
}

// 批量文件操作
pub struct BatchFileProcessor {
    batch_size: usize,
    processing_interval: Duration,
}

impl BatchFileProcessor {
    pub fn new(batch_size: usize, processing_interval: Duration) -> Self {
        Self {
            batch_size,
            processing_interval,
        }
    }

    // 批量处理文件操作
    pub async fn process_batch<F, T, R>(&self, items: Vec<T>, processor: F) -> Vec<R>
    where
        F: Fn(T) -> R + Send + Sync + 'static,
        T: Send + 'static,
        R: Send + 'static,
    {
        let mut results = Vec::new();
        let mut interval = interval(self.processing_interval);

        for chunk in items.chunks(self.batch_size) {
            // 处理当前批次
            let chunk_results: Vec<R> = chunk.iter()
                .map(|item| processor(item.clone()))
                .collect();

            results.extend(chunk_results);

            // 等待下一个处理周期
            interval.tick().await;
        }

        results
    }
}
```

### 2.3 文件监控和热重载

```rust
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use tokio::sync::mpsc;

// 文件监控器
pub struct FileWatcher {
    watcher: RecommendedWatcher,
    event_rx: mpsc::UnboundedReceiver<Event>,
}

impl FileWatcher {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let (event_tx, event_rx) = mpsc::unbounded_channel();

        let watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = event_tx.send(event);
                }
            },
            Config::default(),
        )?;

        Ok(Self {
            watcher,
            event_rx,
        })
    }

    // 监控文件变化
    pub fn watch<P: AsRef<Path>>(&mut self, path: P) -> Result<(), Box<dyn std::error::Error>> {
        self.watcher.watch(path.as_ref(), RecursiveMode::NonRecursive)?;
        Ok(())
    }

    // 获取文件变化事件
    pub async fn next_event(&mut self) -> Option<Event> {
        self.event_rx.recv().await
    }
}

// 热重载管理器
pub struct HotReloader<T: Serialize + for<'de> Deserialize<'de>> {
    store: AsyncJsonStore<T>,
    file_watcher: FileWatcher,
}

impl<T: Serialize + for<'de> Deserialize<'de> + Send + 'static> HotReloader<T> {
    pub async fn new<P: AsRef<Path>>(file_path: P) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let mut file_watcher = FileWatcher::new()?;
        file_watcher.watch(&file_path)?;

        let store = AsyncJsonStore::<T>::new(file_path);

        Ok(Self {
            store,
            file_watcher,
        })
    }

    // 启动热重载
    pub async fn start_hot_reload<F>(&mut self, callback: F) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
    where
        F: Fn(T) + Send + Sync + 'static,
        T: Clone,
    {
        // 初始加载
        self.store.load().await?;

        if let Some(data) = self.store.get() {
            callback(data.clone());
        }

        // 监控文件变化
        while let Some(event) = self.file_watcher.next_event().await {
            match event.kind {
                EventKind::Modify(_) => {
                    if self.store.load().await.is_ok() {
                        if let Some(data) = self.store.get() {
                            callback(data.clone());
                        }
                    }
                }
                _ => {}
            }
        }

        Ok(())
    }
}
```

## 3. 并发和线程安全

### 3.1 线程安全的文件操作

```rust
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;

// 线程安全的 JSON 存储
pub struct ThreadSafeJsonStore<T: Serialize + for<'de> Deserialize<'de>> {
    inner: Arc<RwLock<AsyncJsonStore<T>>>,
}

impl<T: Serialize + for<'de> Deserialize<'de> + Send + Sync + 'static> ThreadSafeJsonStore<T> {
    pub fn new<P: AsRef<Path>>(file_path: P) -> Self {
        let store = AsyncJsonStore::<T>::new(file_path);
        Self {
            inner: Arc::new(RwLock::new(store)),
        }
    }

    // 异步读取数据
    pub async fn read<R>(&self, reader: R) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
    where
        R: FnOnce(&T) + Send + 'static,
    {
        let store = self.inner.read().await;
        if let Some(data) = store.get() {
            reader(data);
        }
        Ok(())
    }

    // 异步写入数据
    pub async fn write<W>(&self, writer: W) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
    where
        W: FnOnce(&mut T) + Send + 'static,
    {
        let mut store = self.inner.write().await;
        if let Some(data) = store.get_mut() {
            writer(data);
            store.save().await?;
        }
        Ok(())
    }
}
```

### 3.2 并发备份操作

```rust
use tokio::task::JoinSet;

// 并发备份管理器
pub struct ConcurrentBackupManager {
    backup_dir: std::path::PathBuf,
    max_concurrent: usize,
}

impl ConcurrentBackupManager {
    pub async fn concurrent_backup<P>(&self, paths: &[P]) -> Result<Vec<std::path::PathBuf>, std::io::Error>
    where
        P: AsRef<Path> + Send + 'static,
    {
        let mut join_set = JoinSet::new();
        let mut results = Vec::new();

        // 限制并发数量
        for chunk in paths.chunks(self.max_concurrent) {
            for path in chunk {
                let backup_dir = self.backup_dir.clone();
                let path = path.as_ref().to_path_buf();

                join_set.spawn(async move {
                    self.create_single_backup(&backup_dir, &path).await
                });
            }

            // 等待当前批次完成
            while let Some(result) = join_set.join_next().await {
                match result {
                    Ok(Ok(path)) => results.push(path),
                    Ok(Err(e)) => eprintln!("备份失败: {}", e),
                    Err(e) => eprintln!("任务执行失败: {}", e),
                }
            }
        }

        Ok(results)
    }

    async fn create_single_backup(
        backup_dir: &std::path::Path,
        source_path: &std::path::Path,
    ) -> Result<std::path::PathBuf, std::io::Error> {
        // 实现单个文件的备份逻辑
        // ...
        Ok(backup_dir.join("backup_file"))
    }
}
```

## 4. 监控和诊断

### 4.1 性能指标收集

```rust
use std::time::{Duration, Instant};
use std::collections::HashMap;

// 性能监控器
pub struct PerformanceMonitor {
    metrics: HashMap<String, Vec<Duration>>,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            metrics: HashMap::new(),
        }
    }

    // 记录操作耗时
    pub fn record_operation<F, R>(&mut self, name: &str, operation: F) -> R
    where
        F: FnOnce() -> R,
    {
        let start = Instant::now();
        let result = operation();
        let duration = start.elapsed();

        self.metrics
            .entry(name.to_string())
            .or_insert_with(Vec::new)
            .push(duration);

        result
    }

    // 获取平均耗时
    pub fn get_average_duration(&self, name: &str) -> Option<Duration> {
        self.metrics.get(name)
            .map(|durations| {
                let total: Duration = durations.iter().sum();
                total / durations.len() as u32
            })
    }

    // 生成性能报告
    pub fn generate_report(&self) -> String {
        let mut report = String::new();
        for (name, durations) in &self.metrics {
            let total: Duration = durations.iter().sum();
            let average = total / durations.len() as u32;
            let min = durations.iter().min().unwrap();
            let max = durations.iter().max().unwrap();

            report.push_str(&format!(
                "操作: {}, 平均: {:?}, 最小: {:?}, 最大: {:?}, 次数: {}\n",
                name, average, min, max, durations.len()
            ));
        }
        report
    }
}
```

### 4.2 文件系统健康检查

```rust
// 文件系统健康检查器
pub struct FileSystemHealthChecker {
    critical_paths: Vec<std::path::PathBuf>,
}

impl FileSystemHealthChecker {
    pub fn new() -> Self {
        Self {
            critical_paths: Vec::new(),
        }
    }

    pub fn add_critical_path<P: AsRef<Path>>(&mut self, path: P) {
        self.critical_paths.push(path.as_ref().to_path_buf());
    }

    // 执行健康检查
    pub async fn health_check(&self) -> Result<HealthReport, std::io::Error> {
        let mut report = HealthReport::new();

        for path in &self.critical_paths {
            // 检查文件/目录是否存在
            let exists = path.exists();
            report.add_path_check(path.to_string_lossy().to_string(), exists);

            if exists {
                // 检查权限
                let metadata = fs::metadata(path).await?;
                let readable = metadata.permissions().readonly() == false;
                report.add_permission_check(path.to_string_lossy().to_string(), readable);

                // 检查磁盘空间
                if let Some(parent) = path.parent() {
                    let space_info = fs::metadata(parent).await?;
                    report.add_space_check(
                        parent.to_string_lossy().to_string(),
                        space_info.len()
                    );
                }
            }
        }

        Ok(report)
    }
}

#[derive(Debug)]
pub struct HealthReport {
    path_checks: HashMap<String, bool>,
    permission_checks: HashMap<String, bool>,
    space_checks: HashMap<String, u64>,
}

impl HealthReport {
    pub fn new() -> Self {
        Self {
            path_checks: HashMap::new(),
            permission_checks: HashMap::new(),
            space_checks: HashMap::new(),
        }
    }

    pub fn add_path_check(&mut self, path: String, exists: bool) {
        self.path_checks.insert(path, exists);
    }

    pub fn add_permission_check(&mut self, path: String, readable: bool) {
        self.permission_checks.insert(path, readable);
    }

    pub fn add_space_check(&mut self, path: String, available_bytes: u64) {
        self.space_checks.insert(path, available_bytes);
    }

    pub fn is_healthy(&self) -> bool {
        self.path_checks.values().all(|&exists| exists) &&
        self.permission_checks.values().all(|&readable| readable)
    }
}
```

## 5. 异步版本的 Cargo.toml 依赖

```toml
[dependencies]
# 基础依赖
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
dirs = "5.0"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.0", features = ["v4"] }

# 异步运行时
tokio = { version = "1.0", features = [
    "full",
    "fs",
    "io-util",
    "sync",
    "time",
    "rt-multi-thread"
] }

# 异步操作支持
futures = "0.3"
async-trait = "0.1"

# 文件监控
notify = "6.0"

# 内存映射
memmap2 = "0.9"

# 错误处理
anyhow = "1.0"
thiserror = "1.0"

# 性能监控
tracing = "0.1"
tracing-subscriber = "0.3"

# 并发工具
rayon = "1.8"  # 用于 CPU 密集型任务的并行处理
```

这些优化方案提供了：

1. **异步文件操作**：使用 Tokio 实现非阻塞 I/O
2. **内存映射**：高效处理大文件
3. **缓存机制**：减少重复的文件读取
4. **并发处理**：提高多个文件操作的性能
5. **热重载**：实时监控文件变化
6. **性能监控**：收集和分析操作指标
7. **健康检查**：确保文件系统状态正常

结合第一个文档的基础文件操作，这些优化方案可以构建出高性能、可靠的文件管理系统。