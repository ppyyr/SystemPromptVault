use crate::models::{Snapshot, SnapshotConfig};
use crate::utils::file_ops::atomic_write;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const SNAPSHOT_DIR_NAME: &str = "snapshots";

pub struct SnapshotRepository {
    base_dir: PathBuf,
}

impl SnapshotRepository {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        let base_dir = app_data_dir.join(SNAPSHOT_DIR_NAME);
        fs::create_dir_all(&base_dir).map_err(|e| format!("创建快照目录失败: {}", e))?;
        Ok(Self { base_dir })
    }

    pub fn create_snapshot(
        &self,
        client_id: &str,
        name: String,
        content: String,
        multi_file_contents: Option<HashMap<String, String>>,
        is_auto: bool,
    ) -> Result<Snapshot, String> {
        let client_id = Self::normalize_client_id(client_id)?;
        let normalized_name = name.trim();
        if normalized_name.is_empty() {
            return Err("快照名称不能为空".to_string());
        }
        let mut config = self.load_config(&client_id)?;
        let content_hash = if let Some(ref contents) = multi_file_contents {
            Self::calculate_multi_content_hash(contents)
        } else {
            Self::calculate_content_hash(&content)
        };
        if is_auto {
            if let Some(latest) = config
                .snapshots
                .iter()
                .max_by(|a, b| a.created_at.cmp(&b.created_at))
            {
                if latest.content_hash == content_hash {
                    return Err("内容未变化,跳过快照创建".to_string());
                }
            }
        }
        let snapshot = Snapshot::new(
            client_id.clone(),
            normalized_name.to_string(),
            content,
            is_auto,
            content_hash,
            multi_file_contents,
        );
        config.snapshots.push(snapshot.clone());
        Self::enforce_limit(&mut config);
        self.save_config(&config)?;
        Ok(snapshot)
    }

    pub fn get_snapshots(&self, client_id: &str) -> Result<Vec<Snapshot>, String> {
        let client_id = Self::normalize_client_id(client_id)?;
        let config = self.load_config(&client_id)?;
        let mut snapshots = config.snapshots;
        snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(snapshots)
    }

    pub fn get_config(&self, client_id: &str) -> Result<SnapshotConfig, String> {
        let client_id = Self::normalize_client_id(client_id)?;
        let mut config = self.load_config(&client_id)?;
        config
            .snapshots
            .sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(config)
    }

    pub fn restore_snapshot(&self, client_id: &str, snapshot_id: &str) -> Result<Snapshot, String> {
        let client_id = Self::normalize_client_id(client_id)?;
        let snapshot_id = Self::normalize_snapshot_id(snapshot_id)?;
        let config = self.load_config(&client_id)?;
        let snapshot = config
            .snapshots
            .iter()
            .find(|s| s.id == snapshot_id)
            .ok_or_else(|| "未找到指定快照".to_string())?;
        Ok(snapshot.clone())
    }

    pub fn delete_snapshot(&self, client_id: &str, snapshot_id: &str) -> Result<(), String> {
        let client_id = Self::normalize_client_id(client_id)?;
        let snapshot_id = Self::normalize_snapshot_id(snapshot_id)?;
        let mut config = self.load_config(&client_id)?;
        let original_len = config.snapshots.len();
        config.snapshots.retain(|s| s.id != snapshot_id);
        if config.snapshots.len() == original_len {
            return Err("未找到指定快照".to_string());
        }
        self.save_config(&config)
    }

    pub fn rename_snapshot(
        &self,
        client_id: &str,
        snapshot_id: &str,
        new_name: String,
    ) -> Result<(), String> {
        let client_id = Self::normalize_client_id(client_id)?;
        let snapshot_id = Self::normalize_snapshot_id(snapshot_id)?;
        let normalized_name = new_name.trim();
        if normalized_name.is_empty() {
            return Err("快照名称不能为空".to_string());
        }
        let mut config = self.load_config(&client_id)?;
        let snapshot = config
            .snapshots
            .iter_mut()
            .find(|s| s.id == snapshot_id)
            .ok_or_else(|| "未找到指定快照".to_string())?;
        if snapshot.name != normalized_name {
            snapshot.name = normalized_name.to_string();
            self.save_config(&config)?;
        }
        Ok(())
    }

    pub fn set_max_snapshots(&self, client_id: &str, max: usize) -> Result<(), String> {
        if max == 0 {
            return Err("最大快照数量必须大于 0".to_string());
        }
        let client_id = Self::normalize_client_id(client_id)?;
        let mut config = self.load_config(&client_id)?;
        config.max_snapshots = max;
        config.max_auto_snapshots = max;
        config.max_manual_snapshots = max;
        Self::sync_legacy_limit(&mut config);
        let _ = Self::enforce_limit(&mut config);
        self.save_config(&config)
    }

    pub fn set_max_auto_snapshots(&self, client_id: &str, max: usize) -> Result<(), String> {
        if max == 0 {
            return Err("最大快照数量必须大于 0".to_string());
        }
        let client_id = Self::normalize_client_id(client_id)?;
        let mut config = self.load_config(&client_id)?;
        config.max_auto_snapshots = max;
        Self::sync_legacy_limit(&mut config);
        let _ = Self::enforce_limit(&mut config);
        self.save_config(&config)
    }

    pub fn set_max_manual_snapshots(&self, client_id: &str, max: usize) -> Result<(), String> {
        if max == 0 {
            return Err("最大快照数量必须大于 0".to_string());
        }
        let client_id = Self::normalize_client_id(client_id)?;
        let mut config = self.load_config(&client_id)?;
        config.max_manual_snapshots = max;
        Self::sync_legacy_limit(&mut config);
        let _ = Self::enforce_limit(&mut config);
        self.save_config(&config)
    }

    pub fn cleanup_old_snapshots(&self, client_id: &str) -> Result<(), String> {
        let client_id = Self::normalize_client_id(client_id)?;
        let mut config = self.load_config(&client_id)?;
        if Self::enforce_limit(&mut config) {
            self.save_config(&config)?;
        }
        Ok(())
    }

    fn load_config(&self, client_id: &str) -> Result<SnapshotConfig, String> {
        let path = self.snapshot_file_path(client_id);
        if path.exists() {
            let raw = fs::read_to_string(&path).map_err(|e| format!("读取快照配置失败: {}", e))?;
            let mut config: SnapshotConfig =
                serde_json::from_str(&raw).map_err(|e| format!("解析快照配置失败: {}", e))?;
            if config.client_id.trim().is_empty() {
                config.client_id = client_id.to_string();
            }
            Self::normalize_limits(&mut config);
            Ok(config)
        } else {
            Ok(SnapshotConfig::new(client_id.to_string()))
        }
    }

    fn save_config(&self, config: &SnapshotConfig) -> Result<(), String> {
        if config.client_id.trim().is_empty() {
            return Err("快照配置缺少客户端 ID".to_string());
        }
        let path = self.snapshot_file_path(&config.client_id);
        let content = serde_json::to_string_pretty(config)
            .map_err(|e| format!("序列化快照配置失败: {}", e))?;
        atomic_write(&path, &content)
    }

    fn snapshot_file_path(&self, client_id: &str) -> PathBuf {
        self.base_dir.join(format!("{}.json", client_id))
    }

    fn normalize_client_id(client_id: &str) -> Result<String, String> {
        let trimmed = client_id.trim();
        if trimmed.is_empty() {
            Err("客户端 ID 不能为空".to_string())
        } else {
            Ok(trimmed.to_string())
        }
    }

    fn normalize_snapshot_id(snapshot_id: &str) -> Result<String, String> {
        let trimmed = snapshot_id.trim();
        if trimmed.is_empty() {
            Err("快照 ID 不能为空".to_string())
        } else {
            Ok(trimmed.to_string())
        }
    }

    fn enforce_limit(config: &mut SnapshotConfig) -> bool {
        if config.snapshots.is_empty() {
            return false;
        }
        Self::normalize_limits(config);
        config
            .snapshots
            .sort_by(|a, b| a.created_at.cmp(&b.created_at));
        let auto_count = config.snapshots.iter().filter(|s| s.is_auto).count();
        let manual_count = config.snapshots.iter().filter(|s| !s.is_auto).count();
        let mut auto_to_remove = auto_count.saturating_sub(config.max_auto_snapshots);
        let mut manual_to_remove = manual_count.saturating_sub(config.max_manual_snapshots);
        if auto_to_remove == 0 && manual_to_remove == 0 {
            return false;
        }
        let mut changed = false;
        config.snapshots.retain(|snapshot| {
            if snapshot.is_auto && auto_to_remove > 0 {
                auto_to_remove -= 1;
                changed = true;
                false
            } else if !snapshot.is_auto && manual_to_remove > 0 {
                manual_to_remove -= 1;
                changed = true;
                false
            } else {
                true
            }
        });
        changed
    }

    fn calculate_content_hash(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn calculate_multi_content_hash(contents: &HashMap<String, String>) -> String {
        let mut entries: Vec<_> = contents.iter().collect();
        entries.sort_by(|a, b| a.0.cmp(b.0));

        let mut hasher = Sha256::new();
        for (path, content) in entries {
            hasher.update(path.as_bytes());
            hasher.update(b"\n");
            hasher.update(content.as_bytes());
            hasher.update(b"\n");
        }
        format!("{:x}", hasher.finalize())
    }

    fn normalize_limits(config: &mut SnapshotConfig) {
        if config.max_snapshots == 0 {
            config.max_snapshots = SnapshotConfig::default_max_snapshots();
        }
        if config.max_auto_snapshots == 0 {
            config.max_auto_snapshots = config.max_snapshots;
        }
        if config.max_manual_snapshots == 0 {
            config.max_manual_snapshots = config.max_snapshots;
        }
        Self::sync_legacy_limit(config);
    }

    fn sync_legacy_limit(config: &mut SnapshotConfig) {
        config.max_snapshots = config
            .max_snapshots
            .max(config.max_auto_snapshots)
            .max(config.max_manual_snapshots);
    }
}
