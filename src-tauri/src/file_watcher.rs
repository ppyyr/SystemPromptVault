use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Runtime};

pub const LEGACY_CLIENT_ID: &str = "__legacy_config_client__";

pub struct ConfigFileWatcher {
    watcher: Option<RecommendedWatcher>,
    watched_paths: HashMap<String, Vec<PathBuf>>,
}

impl ConfigFileWatcher {
    pub fn new() -> Self {
        Self {
            watcher: None,
            watched_paths: HashMap::new(),
        }
    }

    pub fn current_path(&self) -> Option<PathBuf> {
        self.watched_paths
            .values()
            .next()
            .and_then(|paths| paths.first().cloned())
    }

    pub fn watch_files<R: Runtime>(
        &mut self,
        client_id: String,
        paths: Vec<PathBuf>,
        app_handle: AppHandle<R>,
    ) -> Result<(), String> {
        let unique_paths = Self::dedup_paths(paths);
        if unique_paths.is_empty() {
            return Err("未提供任何可监听的配置文件路径".to_string());
        }

        if let Some(existing) = self.watched_paths.get(&client_id) {
            if Self::paths_are_identical(existing, &unique_paths) {
                return Ok(());
            }
        }

        self.stop();

        let fallback_path = unique_paths
            .first()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        let event_client_id = client_id.clone();
        let fallback_for_event = fallback_path.clone();

        let mut watcher =
            notify::recommended_watcher(move |res: Result<Event, notify::Error>| match res {
                Ok(event) => {
                    if matches!(
                        event.kind,
                        EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
                    ) {
                        let mut affected_paths: Vec<String> = event
                            .paths
                            .iter()
                            .map(|p| p.to_string_lossy().to_string())
                            .collect();

                        if affected_paths.is_empty() && !fallback_for_event.is_empty() {
                            affected_paths.push(fallback_for_event.clone());
                        }

                        for changed_path in affected_paths {
                            let payload = json!({
                                "client_id": event_client_id.clone(),
                                "path": changed_path,
                            });
                            if let Err(err) = app_handle.emit("config-file-changed", payload) {
                                eprintln!(
                                    "[FileWatcher] Failed to emit config-file-changed event: {}",
                                    err
                                );
                            }
                        }
                    }
                }
                Err(err) => {
                    eprintln!("[FileWatcher] 文件监听器错误: {}", err);
                }
            })
            .map_err(|e| format!("创建文件监听器失败: {}", e))?;

        for path in &unique_paths {
            watcher
                .watch(path, RecursiveMode::NonRecursive)
                .map_err(|e| format!("监听文件失败: {} ({})", path.display(), e))?;
        }

        self.watcher = Some(watcher);
        self.watched_paths.insert(client_id, unique_paths);
        return Ok(());
    }

    pub fn watch_file<R: Runtime>(
        &mut self,
        path: PathBuf,
        app_handle: AppHandle<R>,
    ) -> Result<(), String> {
        self.watch_files(LEGACY_CLIENT_ID.to_string(), vec![path], app_handle)
    }

    pub fn stop(&mut self) {
        if let Some(mut watcher) = self.watcher.take() {
            let watched: Vec<PathBuf> = self
                .watched_paths
                .values()
                .flat_map(|paths| paths.iter().cloned())
                .collect();
            for path in watched {
                if let Err(err) = watcher.unwatch(&path) {
                    eprintln!(
                        "[FileWatcher] 停止监听文件失败: {} ({})",
                        path.display(),
                        err
                    );
                }
            }
        }
        self.watched_paths.clear();
    }

    fn dedup_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
        let mut seen = HashSet::new();
        let mut unique = Vec::new();
        for path in paths {
            if seen.insert(path.clone()) {
                unique.push(path);
            }
        }
        unique
    }

    fn paths_are_identical(left: &[PathBuf], right: &[PathBuf]) -> bool {
        left.len() == right.len() && left.iter().zip(right).all(|(a, b)| a == b)
    }
}
