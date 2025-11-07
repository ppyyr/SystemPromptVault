use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 单条提示词模型，负责描述提示词的基础信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    pub id: String,
    pub name: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Prompt {
    /// 生成带有唯一 ID 和时间戳的提示词
    pub fn new(name: impl Into<String>, content: impl Into<String>, tags: Vec<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            content: content.into(),
            tags,
            created_at: now,
            updated_at: now,
        }
    }

    /// 更新内容并刷新修改时间
    pub fn update_content(&mut self, new_content: impl Into<String>) {
        self.content = new_content.into();
        self.updated_at = Utc::now();
    }

    /// 添加标签，已存在则保持不变
    pub fn add_tag(&mut self, tag: impl Into<String>) {
        let tag = tag.into();
        if !self.tags.iter().any(|t| t == &tag) {
            self.tags.push(tag);
            self.updated_at = Utc::now();
        }
    }

    /// 移除标签，返回是否真正移除
    pub fn remove_tag(&mut self, tag: &str) -> bool {
        if let Some(index) = self.tags.iter().position(|t| t == tag) {
            self.tags.remove(index);
            self.updated_at = Utc::now();
            true
        } else {
            false
        }
    }

    /// 判断标签是否存在
    pub fn has_tag(&self, tag: &str) -> bool {
        self.tags.iter().any(|t| t == tag)
    }
}
