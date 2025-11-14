use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

/// 创建macOS应用菜单
pub fn build_app_menu<R: Runtime>(app_handle: &AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let menu = Menu::new(app_handle)?;

    // File 菜单
    let file_menu = build_file_menu(app_handle)?;
    menu.append(&file_menu)?;

    // Help 菜单
    let help_menu = build_help_menu(app_handle)?;
    menu.append(&help_menu)?;

    Ok(menu)
}

/// 构建 File 菜单
fn build_file_menu<R: Runtime>(app_handle: &AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    // 创建 Open 菜单项
    let open_item = MenuItem::with_id(app_handle, "open", "Open", true, None::<&str>)?;

    // 创建分隔符
    let separator = PredefinedMenuItem::separator(app_handle)?;

    // 创建 Close Window 菜单项
    let close_item = PredefinedMenuItem::close_window(app_handle, None)?;

    // 创建 File 子菜单
    let file_submenu = Submenu::with_id_and_items(
        app_handle,
        "file",
        "File",
        true,
        &[&open_item, &separator, &close_item],
    )?;

    Ok(file_submenu)
}

/// 构建 Help 菜单
fn build_help_menu<R: Runtime>(app_handle: &AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    // 创建 About 菜单项
    let about_item = MenuItem::with_id(app_handle, "about", "About", true, None::<&str>)?;

    // 创建 Help 子菜单
    let help_submenu = Submenu::with_id_and_items(
        app_handle,
        "help",
        "Help",
        true,
        &[&about_item],
    )?;

    Ok(help_submenu)
}

/// 处理应用菜单事件
pub fn handle_menu_event<R: Runtime>(
    app_handle: &AppHandle<R>,
    event: &MenuEvent,
) -> Result<(), String> {
    let id = event.id().as_ref();

    match id {
        "open" => {
            // 显示文件选择对话框
            if let Some(window) = app_handle.get_webview_window("main") {
                window.show().map_err(|e| e.to_string())?;
                window.set_focus().map_err(|e| e.to_string())?;
                // 向前端发送打开文件事件
                window
                    .emit("menu://file-open", ())
                    .map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        "about" => {
            show_about_dialog(app_handle);
            Ok(())
        }
        _ => Ok(()),
    }
}

/// 显示关于对话框
fn show_about_dialog<R: Runtime>(app_handle: &AppHandle<R>) {
    // 检查About窗口是否已存在
    if let Some(about_window) = app_handle.get_webview_window("about") {
        let _ = about_window.set_focus();
        return;
    }

    // 使用独立的 about.html 文件
    let _ = WebviewWindowBuilder::new(
        app_handle,
        "about",
        WebviewUrl::App("about.html".into()),
    )
    .title("About")
    .inner_size(320.0, 240.0)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .center()
    .build();
}
