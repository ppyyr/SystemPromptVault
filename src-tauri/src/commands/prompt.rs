use crate::models::Prompt;
use crate::storage::prompt_repository::PromptRepository;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub total: usize,
    pub added: usize,
    pub updated: usize,
}

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


#[tauri::command]
pub fn export_prompts(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
) -> Result<String, String> {
    let repo = lock_repo(&repository)?;
    let prompts = repo.get_all()?;
    serde_json::to_string_pretty(&prompts).map_err(|e| format!("序列化提示词失败: {}", e))
}

#[tauri::command]
pub fn import_prompts(
    repository: State<'_, Arc<Mutex<PromptRepository>>>,
    json_data: String,
) -> Result<ImportResult, String> {
    let prompts = parse_and_validate_prompts(&json_data)?;
    if prompts.is_empty() {
        return Ok(ImportResult {
            total: 0,
            added: 0,
            updated: 0,
        });
    }
    let mut repo = lock_repo(&repository)?;
    repo.import_prompts(prompts)
}

fn parse_and_validate_prompts(json_data: &str) -> Result<Vec<Prompt>, String> {
    let trimmed = json_data.trim();
    if trimmed.is_empty() {
        return Err("导入数据不能为空".to_string());
    }

    let value: Value =
        serde_json::from_str(trimmed).map_err(|e| format!("解析提示词 JSON 失败: {}", e))?;
    let entries = value
        .as_array()
        .ok_or_else(|| "导入数据必须是提示词数组".to_string())?;
    validate_prompt_entries(entries)?;

    let prompts: Vec<Prompt> =
        serde_json::from_value(value).map_err(|e| format!("转换提示词数据失败: {}", e))?;
    validate_prompt_models(&prompts)?;
    Ok(prompts)
}

fn validate_prompt_entries(entries: &[Value]) -> Result<(), String> {
    for (index, entry) in entries.iter().enumerate() {
        let obj = entry
            .as_object()
            .ok_or_else(|| format!("第{}个条目必须是对象", index + 1))?;
        ensure_string_field(obj, "id", index)?;
        ensure_string_field(obj, "name", index)?;
        ensure_string_field(obj, "content", index)?;
        ensure_array_field(obj, "tags", index)?;
        ensure_string_field(obj, "created_at", index)?;
        ensure_string_field(obj, "updated_at", index)?;
    }
    Ok(())
}

fn ensure_string_field(
    obj: &serde_json::Map<String, Value>,
    field: &str,
    index: usize,
) -> Result<(), String> {
    match obj.get(field) {
        Some(Value::String(value)) if !value.trim().is_empty() => Ok(()),
        Some(Value::String(_)) => Err(format!(
            "第{}个提示词的{}不能为空",
            index + 1,
            field_label(field)
        )),
        Some(_) => Err(format!(
            "第{}个提示词的{}格式错误",
            index + 1,
            field_label(field)
        )),
        None => Err(format!(
            "第{}个提示词缺少{}字段",
            index + 1,
            field_label(field)
        )),
    }
}

fn ensure_array_field(
    obj: &serde_json::Map<String, Value>,
    field: &str,
    index: usize,
) -> Result<(), String> {
    match obj.get(field) {
        Some(Value::Array(_)) => Ok(()),
        Some(_) => Err(format!(
            "第{}个提示词的{}必须是数组",
            index + 1,
            field_label(field)
        )),
        None => Err(format!(
            "第{}个提示词缺少{}字段",
            index + 1,
            field_label(field)
        )),
    }
}

fn validate_prompt_models(prompts: &[Prompt]) -> Result<(), String> {
    for (index, prompt) in prompts.iter().enumerate() {
        if prompt.id.trim().is_empty() {
            return Err(format!("第{}个提示词的ID不能为空", index + 1));
        }
        if prompt.name.trim().is_empty() {
            return Err(format!("第{}个提示词的名称不能为空", index + 1));
        }
        if prompt.content.trim().is_empty() {
            return Err(format!("第{}个提示词的内容不能为空", index + 1));
        }
        if prompt.tags.iter().any(|tag| tag.trim().is_empty()) {
            return Err(format!("第{}个提示词包含空标签", index + 1));
        }
    }
    Ok(())
}

fn field_label(field: &str) -> &str {
    match field {
        "id" => "ID",
        "name" => "名称",
        "content" => "内容",
        "tags" => "标签",
        "created_at" => "创建时间",
        "updated_at" => "更新时间",
        _ => field,
    }
}


