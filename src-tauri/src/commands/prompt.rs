use crate::models::Prompt;
use crate::storage::prompt_repository::PromptRepository;
use chrono::Utc;
use std::sync::{Arc, Mutex};
use tauri::State;

fn lock_repo<'a>(
    state: &'a State<'_, Arc<Mutex<PromptRepository>>>,
) -> Result<std::sync::MutexGuard<'a, PromptRepository>, String> {
    state
        .lock()
        .map_err(|e| format!("获取提示词仓库锁失败: {}", e))
}

#[tauri::command]
pub fn get_all_prompts(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
) -> Result<Vec<Prompt>, String> {
    let repo = lock_repo(&repository)?;
    repo.get_all()
}

#[tauri::command]
pub fn get_prompt_by_id(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
    id: String,
) -> Result<Option<Prompt>, String> {
    let repo = lock_repo(&repository)?;
    repo.get_by_id(&id)
}

#[tauri::command]
pub fn get_prompts_by_tags(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
    tags: Vec<String>,
) -> Result<Vec<Prompt>, String> {
    let repo = lock_repo(&repository)?;
    repo.get_by_tags(&tags)
}

#[tauri::command]
pub fn create_prompt(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
    name: String,
    content: String,
    tags: Vec<String>,
) -> Result<Prompt, String> {
    if name.trim().is_empty() {
        return Err("提示词名称不能为空".to_string());
    }
    let mut repo = lock_repo(&repository)?;
    let prompt = Prompt::new(name, content, tags);
    let created = prompt.clone();
    repo.save(prompt)?;
    Ok(created)
}

#[tauri::command]
pub fn update_prompt(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
    id: String,
    name: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<Prompt, String> {
    let mut repo = lock_repo(&repository)?;
    let mut prompt = repo
        .get_by_id(&id)?
        .ok_or_else(|| "未找到指定提示词".to_string())?;

    let mut changed = false;
    if let Some(new_name) = name {
        if new_name.trim().is_empty() {
            return Err("提示词名称不能为空".to_string());
        }
        if new_name != prompt.name {
            prompt.name = new_name;
            changed = true;
        }
    }
    if let Some(new_content) = content {
        if new_content != prompt.content {
            prompt.content = new_content;
            changed = true;
        }
    }
    if let Some(new_tags) = tags {
        prompt.tags = new_tags;
        changed = true;
    }

    if changed {
        prompt.updated_at = Utc::now();
    }

    repo.save(prompt.clone())?;
    Ok(prompt)
}

#[tauri::command]
pub fn delete_prompt(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
    id: String,
) -> Result<bool, String> {
    let mut repo = lock_repo(&repository)?;
    repo.delete(&id)
}
