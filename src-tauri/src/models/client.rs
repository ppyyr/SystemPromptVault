use serde::{Deserialize, Serialize};

/// 客户端配置，描述提示词文件来源
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientConfig {
    pub id: String,
    pub name: String,
    pub config_file_path: String,
    pub auto_tag: bool,
    pub is_builtin: bool,
}

impl ClientConfig {
    /// 创建内置客户端配置
    pub fn new_builtin(
        id: impl Into<String>,
        name: impl Into<String>,
        config_file_path: impl Into<String>,
        auto_tag: bool,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            config_file_path: config_file_path.into(),
            auto_tag,
            is_builtin: true,
        }
    }

    /// 创建自定义客户端配置
    pub fn new_custom(
        id: impl Into<String>,
        name: impl Into<String>,
        config_file_path: impl Into<String>,
        auto_tag: bool,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            config_file_path: config_file_path.into(),
            auto_tag,
            is_builtin: false,
        }
    }
}

/// 默认内置客户端列表
pub fn default_clients() -> Vec<ClientConfig> {
    vec![
        ClientConfig::new_builtin("claude", "Claude", "~/.claude/CLAUDE.md", true),
        ClientConfig::new_builtin("codex", "Codex", "~/.codex/CODEX.md", true),
        ClientConfig::new_builtin("gemini", "Gemini", "~/.gemini/GEMINI.md", true),
    ]
}
