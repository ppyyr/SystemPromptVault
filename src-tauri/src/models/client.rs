use serde::{Deserialize, Deserializer, Serialize};

/// 客户端配置，描述提示词文件来源
#[derive(Debug, Clone, Serialize)]
pub struct ClientConfig {
    pub id: String,
    pub name: String,
    pub config_file_paths: Vec<String>,
    pub active_config_path: Option<String>,
    pub auto_tag: bool,
    pub is_builtin: bool,
}

impl<'de> Deserialize<'de> for ClientConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum ClientConfigSerde {
            Current {
                id: String,
                name: String,
                config_file_paths: Vec<String>,
                #[serde(default)]
                active_config_path: Option<String>,
                auto_tag: bool,
                is_builtin: bool,
            },
            Legacy {
                id: String,
                name: String,
                config_file_path: String,
                auto_tag: bool,
                is_builtin: bool,
            },
        }

        let config = match ClientConfigSerde::deserialize(deserializer)? {
            ClientConfigSerde::Current {
                id,
                name,
                config_file_paths,
                active_config_path,
                auto_tag,
                is_builtin,
            } => ClientConfig::from_parts(
                id,
                name,
                config_file_paths,
                active_config_path,
                auto_tag,
                is_builtin,
            ),
            ClientConfigSerde::Legacy {
                id,
                name,
                config_file_path,
                auto_tag,
                is_builtin,
            } => ClientConfig::from_parts(
                id,
                name,
                vec![config_file_path],
                None,
                auto_tag,
                is_builtin,
            ),
        };

        Ok(config)
    }
}

impl ClientConfig {
    fn from_parts(
        id: String,
        name: String,
        config_file_paths: Vec<String>,
        active_config_path: Option<String>,
        auto_tag: bool,
        is_builtin: bool,
    ) -> Self {
        let mut config = Self {
            id,
            name,
            config_file_paths,
            active_config_path,
            auto_tag,
            is_builtin,
        };
        config.ensure_active_path();
        config
    }

    fn ensure_active_path(&mut self) {
        if self.config_file_paths.is_empty() {
            self.active_config_path = None;
            return;
        }

        let has_valid_active = self
            .active_config_path
            .as_ref()
            .map(|target| self.config_file_paths.iter().any(|path| path == target))
            .unwrap_or(false);

        if !has_valid_active {
            self.active_config_path = self.config_file_paths.first().cloned();
        }
    }

    /// 创建内置客户端配置
    pub fn new_builtin(
        id: impl Into<String>,
        name: impl Into<String>,
        config_file_paths: Vec<String>,
        auto_tag: bool,
    ) -> Self {
        Self::from_parts(
            id.into(),
            name.into(),
            config_file_paths,
            None,
            auto_tag,
            true,
        )
    }

    /// 创建自定义客户端配置
    pub fn new_custom(
        id: impl Into<String>,
        name: impl Into<String>,
        config_file_paths: Vec<String>,
        auto_tag: bool,
    ) -> Self {
        Self::from_parts(
            id.into(),
            name.into(),
            config_file_paths,
            None,
            auto_tag,
            false,
        )
    }

    /// 获取当前默认配置路径（优先 active，其次首个路径）
    pub fn default_config_path(&self) -> Option<&str> {
        self.active_config_path
            .as_deref()
            .or_else(|| self.config_file_paths.first().map(|path| path.as_str()))
    }

    /// 根据外部输入解析最终使用的配置路径
    pub fn resolve_config_path(&self, override_path: Option<&str>) -> Result<String, String> {
        if let Some(path) = override_path {
            if !self.has_config_path(path) {
                return Err("指定的配置文件路径未在客户端配置中找到".to_string());
            }
            return Ok(path.to_string());
        }

        self.default_config_path()
            .map(|path| path.to_string())
            .ok_or_else(|| "客户端未配置任何配置文件路径".to_string())
    }

    pub fn has_config_path(&self, path: &str) -> bool {
        self.config_file_paths.iter().any(|item| item == path)
    }
}

/// 默认内置客户端列表
pub fn default_clients() -> Vec<ClientConfig> {
    vec![
        ClientConfig::new_builtin(
            "Claude",
            "Claude",
            vec!["~/.claude/CLAUDE.md".to_string()],
            true,
        ),
        ClientConfig::new_builtin(
            "Codex",
            "Codex",
            vec!["~/.codex/AGENTS.md".to_string()],
            true,
        ),
        ClientConfig::new_builtin(
            "Gemini",
            "Gemini",
            vec!["~/.gemini/GEMINI.md".to_string()],
            true,
        ),
    ]
}
