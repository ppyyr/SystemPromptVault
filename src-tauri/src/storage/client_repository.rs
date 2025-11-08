use crate::models::{default_clients, ClientConfig};
use crate::utils::file_ops::atomic_write;
use indexmap::IndexMap;
use std::fs;
use std::path::{Path, PathBuf};

const CLIENTS_FILE_NAME: &str = "clients.json";

pub struct ClientRepository {
    path: PathBuf,
    clients: IndexMap<String, ClientConfig>,
}

impl ClientRepository {
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
        let path = data_dir.join(CLIENTS_FILE_NAME);
        let (clients, should_persist) = if path.exists() {
            (Self::load_clients(&path)?, false)
        } else {
            (
                default_clients()
                    .into_iter()
                    .map(|client| (client.id.clone(), client))
                    .collect(),
                true,
            )
        };

        let repo = Self { path, clients };
        if should_persist {
            repo.persist()?;
        }
        Ok(repo)
    }

    pub fn get_all(&self) -> Result<Vec<ClientConfig>, String> {
        Ok(self.clients.values().cloned().collect())
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<ClientConfig>, String> {
        Ok(self.clients.get(id).cloned())
    }

    pub fn save(&mut self, client: ClientConfig) -> Result<(), String> {
        self.clients.insert(client.id.clone(), client);
        self.persist()
    }

    pub fn delete(&mut self, id: &str) -> Result<bool, String> {
        let removed = self.clients.shift_remove(id).is_some();
        if removed {
            self.persist()?;
        }
        Ok(removed)
    }

    fn load_clients(path: &Path) -> Result<IndexMap<String, ClientConfig>, String> {
        let raw = fs::read_to_string(path).map_err(|e| format!("读取客户端配置失败: {}", e))?;
        let clients: Vec<ClientConfig> =
            serde_json::from_str(&raw).map_err(|e| format!("解析客户端配置失败: {}", e))?;
        Ok(clients.into_iter().map(|c| (c.id.clone(), c)).collect())
    }

    fn persist(&self) -> Result<(), String> {
        let clients: Vec<ClientConfig> = self.clients.values().cloned().collect();
        let content = serde_json::to_string_pretty(&clients)
            .map_err(|e| format!("序列化客户端配置失败: {}", e))?;
        atomic_write(&self.path, &content)
    }
}
