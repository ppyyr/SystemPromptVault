use crate::utils::path_utils::{get_config_path, ConfigFileType};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub fn read_config_file<P: AsRef<Path>>(
    project_path: P,
    file_type: ConfigFileType,
) -> Result<String, String> {
    let file_path = get_config_path(project_path, file_type);
    let mut file = File::open(&file_path).map_err(|e| format!("读取配置文件失败: {}", e))?;
    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|e| format!("读取配置内容失败: {}", e))?;
    Ok(content)
}

pub fn write_config_file<P: AsRef<Path>>(
    project_path: P,
    file_type: ConfigFileType,
    content: &str,
) -> Result<PathBuf, String> {
    let target = get_config_path(project_path, file_type);
    atomic_write(&target, content)?;
    Ok(target)
}

pub fn atomic_write<P: AsRef<Path>>(path: P, content: &str) -> Result<(), String> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {}", e))?;
    }

    let temp_path = path.with_extension(format!("tmp-{}", Uuid::new_v4()));
    {
        let mut file = File::create(&temp_path).map_err(|e| format!("创建临时文件失败: {}", e))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("写入临时文件失败: {}", e))?;
        file.sync_all()
            .map_err(|e| format!("同步临时文件失败: {}", e))?;
    }

    fs::rename(&temp_path, path).map_err(|e| format!("替换配置文件失败: {}", e))?;
    Ok(())
}
