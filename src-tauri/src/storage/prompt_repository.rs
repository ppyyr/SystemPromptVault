use crate::commands::prompt::ImportResult;
use crate::models::Prompt;
use crate::utils::file_ops::atomic_write;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const PROMPTS_FILE_NAME: &str = "prompts.json";

pub struct PromptRepository {
    path: PathBuf,
    prompts: HashMap<String, Prompt>,
}

impl PromptRepository {
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
        let path = data_dir.join(PROMPTS_FILE_NAME);
        let prompts = if path.exists() {
            Self::load_prompts(&path)?
        } else {
            HashMap::new()
        };

        Ok(Self { path, prompts })
    }

    pub fn get_all(&self) -> Result<Vec<Prompt>, String> {
        Ok(self.prompts.values().cloned().collect())
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<Prompt>, String> {
        Ok(self.prompts.get(id).cloned())
    }

    pub fn get_by_tags(&self, tags: &[String]) -> Result<Vec<Prompt>, String> {
        if tags.is_empty() {
            return Ok(Vec::new());
        }
        Ok(self
            .prompts
            .values()
            .filter(|prompt| prompt.tags.iter().any(|tag| tags.iter().any(|t| t == tag)))
            .cloned()
            .collect())
    }

    pub fn save(&mut self, prompt: Prompt) -> Result<(), String> {
        self.prompts.insert(prompt.id.clone(), prompt);
        self.persist()
    }

    pub fn delete(&mut self, id: &str) -> Result<bool, String> {
        let removed = self.prompts.remove(id).is_some();
        if removed {
            self.persist()?;
        }
        Ok(removed)
    }

    pub fn import_prompts(&mut self, prompts: Vec<Prompt>) -> Result<ImportResult, String> {
        if prompts.is_empty() {
            return Ok(ImportResult {
                total: 0,
                added: 0,
                updated: 0,
            });
        }

        let mut merged = self.prompts.clone();
        let mut added = 0usize;
        let mut updated = 0usize;
        for prompt in prompts {
            if merged.contains_key(&prompt.id) {
                updated += 1;
            } else {
                added += 1;
            }
            merged.insert(prompt.id.clone(), prompt);
        }

        let merged_list: Vec<Prompt> = merged.values().cloned().collect();
        let content = serde_json::to_string_pretty(&merged_list)
            .map_err(|e| format!("序列化提示词失败: {}", e))?;
        atomic_write(&self.path, &content)?;
        self.prompts = merged;
        Ok(ImportResult {
            total: added + updated,
            added,
            updated,
        })
    }

    fn load_prompts(path: &Path) -> Result<HashMap<String, Prompt>, String> {
        let raw = fs::read_to_string(path).map_err(|e| format!("读取提示词失败: {}", e))?;
        let prompts: Vec<Prompt> =
            serde_json::from_str(&raw).map_err(|e| format!("解析提示词失败: {}", e))?;
        Ok(prompts.into_iter().map(|p| (p.id.clone(), p)).collect())
    }

    fn persist(&self) -> Result<(), String> {
        let prompts: Vec<Prompt> = self.prompts.values().cloned().collect();
        let content = serde_json::to_string_pretty(&prompts)
            .map_err(|e| format!("序列化提示词失败: {}", e))?;
        atomic_write(&self.path, &content)
    }
}
