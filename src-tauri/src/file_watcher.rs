use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use tauri::{AppHandle, Emitter, Runtime};

pub struct ConfigFileWatcher {
    watcher: Option<RecommendedWatcher>,
    watched_path: Option<PathBuf>,
}

impl ConfigFileWatcher {
    pub fn new() -> Self {
        Self {
            watcher: None,
            watched_path: None,
        }
    }

    pub fn watch_file<R: Runtime>(&mut self, path: PathBuf, app_handle: AppHandle<R>) -> Result<(), String> {
        if self.watched_path.as_ref() == Some(&path) {
            return Ok(());
        }

        self.stop();

        let (tx, rx) = mpsc::channel::<Event>();
        let emitter_app = app_handle.clone();
        let fallback_path = path.to_string_lossy().to_string();

        std::thread::spawn(move || {
            while let Ok(event) = rx.recv() {
                let path_str = event
                    .paths
                    .first()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| fallback_path.clone());
                let _ = emitter_app.emit("config-file-changed", path_str);
            }
        });

        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(
                    event.kind,
                    EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
                ) {
                    let _ = tx.send(event);
                }
            }
        })
        .map_err(|e| format!("创建文件监听器失败: {}", e))?;

        watcher
            .watch(&path, RecursiveMode::NonRecursive)
            .map_err(|e| format!("监听文件失败: {}", e))?;

        self.watcher = Some(watcher);
        self.watched_path = Some(path);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.watcher = None;
        self.watched_path = None;
    }
}
