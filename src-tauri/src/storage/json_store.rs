use crate::models::{Project, Template};
use crate::utils::file_ops::atomic_write;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const CONFIG_FILE_NAME: &str = "app_config.json";
const APP_DIR_NAME: &str = "SystemPromptVault";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub auto_backup: bool,
    pub default_template: Option<String>,
    pub last_opened_project: Option<PathBuf>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_backup: false,
            default_template: None,
            last_opened_project: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub templates: Vec<Template>,
    pub projects: Vec<Project>,
    pub settings: AppSettings,
    pub updated_at: DateTime<Utc>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            templates: Vec::new(),
            projects: Vec::new(),
            settings: AppSettings::default(),
            updated_at: Utc::now(),
        }
    }
}

#[derive(Debug)]
pub struct JsonStore {
    path: PathBuf,
    config: AppConfig,
}

impl JsonStore {
    pub fn new() -> Result<Self, String> {
        let mut base_dir = resolve_app_data_dir()?;
        base_dir.push(APP_DIR_NAME);
        fs::create_dir_all(&base_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;

        let config_path = base_dir.join(CONFIG_FILE_NAME);
        Ok(Self {
            path: config_path,
            config: AppConfig::default(),
        })
    }

    pub fn load(&mut self) -> Result<&AppConfig, String> {
        if self.path.exists() {
            let raw = fs::read_to_string(&self.path).map_err(|e| format!("读取配置失败: {}", e))?;
            let config: AppConfig =
                serde_json::from_str(&raw).map_err(|e| format!("解析配置失败: {}", e))?;
            self.config = config;
            Ok(&self.config)
        } else {
            self.ensure_parent_dir()?;
            self.config = AppConfig::default();
            Ok(&self.config)
        }
    }

    pub fn save(&mut self) -> Result<(), String> {
        self.config.updated_at = Utc::now();
        self.ensure_parent_dir()?;
        let content = serde_json::to_string_pretty(&self.config)
            .map_err(|e| format!("序列化配置失败: {}", e))?;
        atomic_write(&self.path, &content)
    }

    pub fn config(&self) -> &AppConfig {
        &self.config
    }

    pub fn config_mut(&mut self) -> &mut AppConfig {
        &mut self.config
    }

    pub fn path(&self) -> &Path {
        self.path.as_path()
    }

    fn ensure_parent_dir(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?
        }
        Ok(())
    }
}

fn resolve_app_data_dir() -> Result<PathBuf, String> {
    let data_dir = legacy_tauri_app_data_dir()
        .or_else(dirs::data_dir)
        .ok_or_else(|| "无法定位应用数据目录".to_string())?;
    Ok(data_dir)
}

#[allow(dead_code)]
fn legacy_tauri_app_data_dir() -> Option<PathBuf> {
    #[cfg(feature = "legacy-tauri-api")]
    {
        #[allow(deprecated)]
        {
            return tauri::api::path::app_data_dir(&tauri::Config::default());
        }
    }
    #[cfg(not(feature = "legacy-tauri-api"))]
    {
        None
    }
}
