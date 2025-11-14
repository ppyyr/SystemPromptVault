# 客户端导入导出UI集成和用户体验设计

### Code Sections

- `dist/settings.html:201-209` (btnNewClient): 现有的新增客户端按钮结构
  ```html
  <button
    class="btn-icon btn-icon-primary"
    id="btnNewClient"
    type="button"
    aria-label="Add Client"
    data-tooltip="Add Client"
    data-i18n-aria="settings.newClient"
    data-i18n-tooltip="settings.newClient"
  >
  ```

- `dist/js/settings.js:1462-1480` (showClientModal): 客户端模态框显示和表单初始化
  ```javascript
  const showClientModal = (clientId = null) => {
    const clientTitleKey = clientId ? "settings.clientModalEditTitle" : "settings.clientModalTitle";
    elements.modalClientTitle.textContent = t(clientTitleKey);

    if (clientId) {
      const client = state.clients.find((item) => item.id === clientId);
      // 表单数据填充和路径处理
    }
    elements.modalClient.classList.remove("hidden");
  };
  ```

- `dist/js/settings.js:1200-1204` (deleteClient): 客户端删除操作和确认机制
  ```javascript
  const isOnlyClient = state.clients.length <= 1;
  deleteBtn.disabled = isOnlyClient;
  deleteBtn.title = isOnlyClient ? t("toast.keepOneClient", "At least one client must remain") : "";
  deleteBtn.addEventListener("click", () => deleteClient(client.id));
  ```

- `dist/js/utils.js`: 通用工具函数（Toast提示、确认对话框等）
  ```javascript
  // 假设存在以下工具函数
  export const showToast = (message, type = 'info') => { /* 实现 */ };
  export const showConfirm = (message) => { /* 返回Promise<boolean> */ };
  export const showLoading = () => { /* 实现加载状态 */ };
  export const hideLoading = () => { /* 隐藏加载状态 */ };
  ```

### Report

#### conclusions

> 导入导出功能的UI设计需要遵循现有的交互模式，保持一致的用户体验

- 在客户端操作按钮区域添加导出和导入按钮，使用相同的图标和样式系统
- 导出操作支持多选模式，用户可以选择要导出的客户端
- 导入操作使用文件选择器，支持预览和冲突解决选项
- 复用现有的模态框、Toast通知和确认对话框组件
- 支持拖拽导入和批量操作，提升用户体验

#### relations

> UI组件与现有界面元素的集成关系

- **按钮布局**: btnNewClient旁添加btnExportClients和btnImportClients
- **模态框系统**: 复用现有的modal结构，添加导出选择和导入预览模态框
- **状态管理**: 扩展state对象添加导入导出相关状态
- **事件处理**: 集成到现有的事件委托和生命周期管理系统
- **国际化**: 添加相关的i18n键值对，支持多语言

#### result

> 完整的UI交互设计方案

**HTML结构扩展:**
```html
<!-- 在 clientActions div 中添加 -->
<button
  class="btn-icon btn-icon-primary"
  id="btnExportClients"
  type="button"
  aria-label="Export Clients"
  data-tooltip="Export Clients"
  data-i18n-aria="settings.exportClients"
  data-i18n-tooltip="settings.exportClients"
>
  <!-- 导出图标 -->
</button>

<button
  class="btn-icon btn-icon-primary"
  id="btnImportClients"
  type="button"
  aria-label="Import Clients"
  data-tooltip="Import Clients"
  data-i18n-aria="settings.importClients"
  data-i18n-tooltip="settings.importClients"
>
  <!-- 导入图标 -->
</button>

<!-- 隐藏的文件输入 -->
<input type="file" id="importFileInput" accept=".json" style="display: none;">
```

**JavaScript功能实现:**
```javascript
// 导出功能
const exportSelectedClients = async () => {
  const selectedClientIds = getSelectedClientIds();
  if (selectedClientIds.length === 0) {
    showToast(t("toast.selectClientsToExport", "Please select clients to export"), "warning");
    return;
  }

  showLoading(t("status.exporting", "Exporting..."));
  try {
    const exportData = await ClientAPI.exportClients(selectedClientIds);
    downloadJSON(exportData, `clients-export-${new Date().toISOString().split('T')[0]}.json`);
    showToast(t("toast.exportSuccess", "Export completed successfully"), "success");
  } catch (error) {
    showToast(t("toast.exportFailed", "Export failed: {{error}}", { error }), "error");
  } finally {
    hideLoading();
  }
};

// 导入功能
const importClients = async (file) => {
  const content = await file.text();
  showLoading(t("status.importing", "Importing..."));

  try {
    const importResult = await ClientAPI.importClients(content, {
      conflictStrategy: 'ask', // ask/overwrite/skip
      createDirectories: true
    });

    if (importResult.conflicts.length > 0) {
      const resolved = await showConflictResolutionDialog(importResult.conflicts);
      if (!resolved) return;
    }

    await loadClients(); // 刷新客户端列表
    showToast(t("toast.importSuccess", "Import completed successfully"), "success");
  } catch (error) {
    showToast(t("toast.importFailed", "Import failed: {{error}}", { error }), "error");
  } finally {
    hideLoading();
  }
};
```

#### attention

> UI设计需要特别注意的用户体验问题

- **选择状态**: 需要在表格中添加checkbox列，支持多选和全选功能
- **进度反馈**: 大量数据导入导出时需要进度条和取消功能
- **冲突处理**: 清晰的冲突预览界面，让用户能够逐项决定处理方式
- **错误恢复**: 导入失败时的回滚机制和数据恢复提示
- **权限提示**: 文件读写权限不足时的用户指导
- **键盘导航**: 支持键盘快捷键操作，提升可访问性