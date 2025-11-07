use std::env;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigFileType {
    Claude,
    Codex,
    Gemini,
}

impl ConfigFileType {
    pub fn from_str(value: &str) -> Result<Self, String> {
        match value.to_lowercase().as_str() {
            "claude" => Ok(Self::Claude),
            "codex" => Ok(Self::Codex),
            "gemini" => Ok(Self::Gemini),
            other => Err(format!("未知的配置类型: {}", other)),
        }
    }

    pub fn directory(&self) -> &'static str {
        match self {
            Self::Claude => ".claude",
            Self::Codex => ".codex",
            Self::Gemini => ".gemini",
        }
    }

    pub fn file_name(&self) -> &'static str {
        match self {
            Self::Claude => "CLAUDE.md",
            Self::Codex => "AGENTS.md",
            Self::Gemini => "GEMINI.md",
        }
    }
}

pub fn normalize_path<P: AsRef<Path>>(path: P) -> PathBuf {
    let input = path.as_ref();
    if input.is_absolute() {
        clean_components(input)
    } else {
        env::current_dir()
            .map(|cwd| clean_components(cwd.join(input)))
            .unwrap_or_else(|_| clean_components(input))
    }
}

pub fn get_config_path<P: AsRef<Path>>(project_path: P, file_type: ConfigFileType) -> PathBuf {
    let base = normalize_path(project_path);
    base.join(file_type.directory()).join(file_type.file_name())
}

fn clean_components<P: AsRef<Path>>(path: P) -> PathBuf {
    path.as_ref()
        .components()
        .fold(PathBuf::new(), |mut acc, component| {
            match component {
                Component::CurDir => {}
                Component::ParentDir => {
                    acc.pop();
                }
                other => acc.push(other.as_os_str()),
            }
            acc
        })
}
