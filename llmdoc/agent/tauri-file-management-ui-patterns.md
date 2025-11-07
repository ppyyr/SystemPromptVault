# Tauri 文件管理和 UI 交互具体实现

## 文件对话框使用模式

### 1. 文件夹选择对话框
```typescript
// services/dialogService.ts
import { open, save } from '@tauri-apps/plugin-dialog';

export class DialogService {
  /**
   * 选择单个文件夹
   */
  static async selectFolder(title = "选择文件夹"): Promise<string | null> {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title,
        recursive: true
      });

      return selected as string || null;
    } catch (error) {
      console.error('文件夹选择失败:', error);
      return null;
    }
  }

  /**
   * 选择多个文件夹
   */
  static async selectFolders(title = "选择文件夹"): Promise<string[]> {
    try {
      const selected = await open({
        directory: true,
        multiple: true,
        title,
        recursive: true
      });

      return Array.isArray(selected) ? selected : (selected ? [selected] : []);
    } catch (error) {
      console.error('多文件夹选择失败:', error);
      return [];
    }
  }

  /**
   * 选择文件进行保存
   */
  static async selectSaveFile(
    defaultPath?: string,
    title = "保存文件",
    filters?: Array<{ name: string; extensions: string[] }>
  ): Promise<string | null> {
    try {
      const selected = await save({
        title,
        defaultPath,
        filters
      });

      return selected || null;
    } catch (error) {
      console.error('保存文件对话框失败:', error);
      return null;
    }
  }
}
```

### 2. Rust 端路径处理
```rust
// src-tauri/src/commands/path_commands.rs
use tauri::command;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PathInfo {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub is_file: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
}

#[command]
pub async fn validate_path(path: String) -> Result<PathInfo, String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Ok(PathInfo {
            path,
            exists: false,
            is_dir: false,
            is_file: false,
            size: None,
            modified: None,
        });
    }

    let metadata = path_buf.metadata()
        .map_err(|e| format!("获取文件元数据失败: {}", e))?;

    let modified = metadata.modified()
        .map(|time| time.to_string())
        .ok();

    Ok(PathInfo {
        path,
        exists: true,
        is_dir: path_buf.is_dir(),
        is_file: path_buf.is_file(),
        size: Some(metadata.len()),
        modified,
    })
}

#[command]
pub async fn list_directory_contents(path: String) -> Result<Vec<String>, String> {
    let path_buf = Path::new(&path);

    if !path_buf.exists() || !path_buf.is_dir() {
        return Err("路径不存在或不是目录".to_string());
    }

    let mut entries = Vec::new();

    for entry in path_buf.read_dir()
        .map_err(|e| format!("读取目录失败: {}", e))?
    {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();

        if let Some(path_str) = path.to_str() {
            entries.push(path_str.to_string());
        }
    }

    entries.sort();
    Ok(entries)
}
```

## 列表渲染优化模式

### 1. 虚拟滚动列表
```typescript
// components/VirtualList.tsx
import { FixedSizeList as List } from 'react-window';
import { useMemo, useCallback } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  className?: string;
}

export function VirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  className = ""
}: VirtualListProps<T>) {
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = items[index];
    return <div style={style}>{renderItem(item, index, style)}</div>;
  }, [items, renderItem]);

  const listData = useMemo(() => items, [items]);

  return (
    <List
      height={height}
      itemCount={listData.length}
      itemSize={itemHeight}
      className={className}
    >
      {Row}
    </List>
  );
}
```

### 2. 搜索过滤组件
```typescript
// components/SearchableList.tsx
import { useState, useMemo, useCallback } from 'react';
import { debounce } from 'lodash-es';

interface SearchableListProps<T> {
  items: T[];
  searchKeys: (keyof T)[];
  renderItem: (item: T, index: number) => React.ReactNode;
  placeholder?: string;
}

export function SearchableList<T>({
  items,
  searchKeys,
  renderItem,
  placeholder = "搜索..."
}: SearchableListProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const filterItems = useCallback((term: string, list: T[]) => {
    if (!term.trim()) return list;

    const lowerTerm = term.toLowerCase();
    return list.filter(item =>
      searchKeys.some(key => {
        const value = item[key];
        return typeof value === 'string' &&
               value.toLowerCase().includes(lowerTerm);
      })
    );
  }, [searchKeys]);

  const debouncedSearch = useMemo(
    () => debounce((term: string) => {
      setLoading(false);
      setSearchTerm(term);
    }, 300),
    []
  );

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLoading(true);
    debouncedSearch(e.target.value);
  }, [debouncedSearch]);

  const filteredItems = useMemo(
    () => filterItems(searchTerm, items),
    [filterItems, searchTerm, items]
  );

  return (
    <div className="searchable-list">
      <div className="search-container">
        <input
          type="text"
          placeholder={placeholder}
          onChange={handleSearchChange}
          className="search-input"
        />
        {loading && <div className="search-loading">搜索中...</div>}
      </div>

      <div className="results-container">
        {filteredItems.length === 0 ? (
          <div className="no-results">
            {searchTerm ? '没有找到匹配项' : '暂无数据'}
          </div>
        ) : (
          <div className="items-list">
            {filteredItems.map((item, index) => renderItem(item, index))}
          </div>
        )}
      </div>
    </div>
  );
}
```

## 表单验证和提交模式

### 1. 通用表单验证 Hook
```typescript
// hooks/useFormValidation.ts
import { useState, useCallback } from 'react';

interface ValidationRule<T = any> {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: T) => string | null;
  message?: string;
}

interface FormValidation<T> {
  [key: string]: ValidationRule<T>;
}

export function useFormValidation<T extends Record<string, any>>(
  initialValues: T,
  validationRules: FormValidation<T>
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  const validateField = useCallback((field: keyof T, value: any): string | null => {
    const rules = validationRules[field];
    if (!rules) return null;

    // 必填验证
    if (rules.required && (!value || (typeof value === 'string' && !value.trim()))) {
      return rules.message || `${String(field)}是必填项`;
    }

    // 最小长度验证
    if (rules.minLength && value && value.length < rules.minLength) {
      return rules.message || `${String(field)}最少需要${rules.minLength}个字符`;
    }

    // 最大长度验证
    if (rules.maxLength && value && value.length > rules.maxLength) {
      return rules.message || `${String(field)}不能超过${rules.maxLength}个字符`;
    }

    // 正则验证
    if (rules.pattern && value && !rules.pattern.test(value)) {
      return rules.message || `${String(field)}格式不正确`;
    }

    // 自定义验证
    if (rules.custom && value) {
      return rules.custom(value);
    }

    return null;
  }, [validationRules]);

  const setValue = useCallback((field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));

    if (touched[field]) {
      const error = validateField(field, value);
      setErrors(prev => ({ ...prev, [field]: error }));
    }
  }, [touched, validateField]);

  const setFieldTouched = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const error = validateField(field, values[field]);
    setErrors(prev => ({ ...prev, [field]: error }));
  }, [values, validateField]);

  const validateAll = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    Object.keys(validationRules).forEach(field => {
      const error = validateField(field as keyof T, values[field as keyof T]);
      if (error) {
        newErrors[field as keyof T] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    setTouched(Object.keys(validationRules).reduce((acc, field) => ({
      ...acc,
      [field]: true
    }), {}));

    return isValid;
  }, [validationRules, values, validateField]);

  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    setValue,
    setFieldTouched,
    validateAll,
    resetForm,
    isValid: Object.keys(errors).length === 0
  };
}
```

### 2. 智能表单组件
```typescript
// components/SmartForm.tsx
import { useFormValidation } from '../hooks/useFormValidation';

interface SmartFormProps<T> {
  initialValues: T;
  validationRules: FormValidation<T>;
  onSubmit: (values: T) => Promise<void>;
  fields: Array<{
    name: keyof T;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'file';
    options?: Array<{ value: string; label: string }>;
    placeholder?: string;
  }>;
  submitText?: string;
  cancelText?: string;
  onCancel?: () => void;
}

export function SmartForm<T extends Record<string, any>>({
  initialValues,
  validationRules,
  onSubmit,
  fields,
  submitText = "提交",
  cancelText = "取消",
  onCancel
}: SmartFormProps<T>) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    values,
    errors,
    touched,
    setValue,
    setFieldTouched,
    validateAll,
    resetForm
  } = useFormValidation(initialValues, validationRules);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateAll()) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(values);
      resetForm();
    } catch (error) {
      setSubmitError(error as string);
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: fields[0]) => {
    const fieldError = touched[field.name] ? errors[field.name] : null;
    const hasError = !!fieldError;

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={values[field.name] || ''}
            onChange={(e) => setValue(field.name, e.target.value)}
            onBlur={() => setFieldTouched(field.name)}
            placeholder={field.placeholder}
            className={`form-textarea ${hasError ? 'error' : ''}`}
            rows={4}
          />
        );

      case 'select':
        return (
          <select
            value={values[field.name] || ''}
            onChange={(e) => setValue(field.name, e.target.value)}
            onBlur={() => setFieldTouched(field.name)}
            className={`form-select ${hasError ? 'error' : ''}`}
          >
            <option value="">请选择</option>
            {field.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      default:
        return (
          <input
            type={field.type}
            value={values[field.name] || ''}
            onChange={(e) => setValue(field.name, e.target.value)}
            onBlur={() => setFieldTouched(field.name)}
            placeholder={field.placeholder}
            className={`form-input ${hasError ? 'error' : ''}`}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="smart-form">
      {fields.map(field => (
        <div key={String(field.name)} className="form-group">
          <label className="form-label">
            {field.label}
            {validationRules[field.name]?.required && (
              <span className="required">*</span>
            )}
          </label>
          {renderField(field)}
          {touched[field.name] && errors[field.name] && (
            <div className="error-message">{errors[field.name]}</div>
          )}
        </div>
      ))}

      {submitError && (
        <div className="form-error">{submitError}</div>
      )}

      <div className="form-actions">
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary"
        >
          {submitting ? '提交中...' : submitText}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn btn-secondary"
          >
            {cancelText}
          </button>
        )}
      </div>
    </form>
  );
}
```

## Toast 和确认对话框

### 1. Toast 管理器
```typescript
// services/toastService.ts
import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = Date.now().toString();
    const newToast = { ...toast, id };

    set((state) => ({
      toasts: [...state.toasts, newToast]
    }));

    // 自动移除
    const duration = toast.duration || 3000;
    setTimeout(() => {
      get().removeToast(id);
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id)
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  }
}));

// 便捷方法
export const toast = {
  success: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
    useToastStore.getState().addToast({ message, type: 'success', ...options });
  },

  error: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
    useToastStore.getState().addToast({ message, type: 'error', duration: 5000, ...options });
  },

  warning: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
    useToastStore.getState().addToast({ message, type: 'warning', ...options });
  },

  info: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
    useToastStore.getState().addToast({ message, type: 'info', ...options });
  }
};
```

### 2. 确认对话框服务
```typescript
// services/confirmService.ts
import { create } from 'zustand';

interface ConfirmDialog {
  id: string;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface ConfirmStore {
  dialogs: ConfirmDialog[];
  showDialog: (dialog: Omit<ConfirmDialog, 'id'>) => Promise<boolean>;
  removeDialog: (id: string) => void;
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  dialogs: [],

  showDialog: (dialog) => {
    return new Promise((resolve) => {
      const id = Date.now().toString();
      const newDialog: ConfirmDialog = {
        ...dialog,
        id,
        onConfirm: async () => {
          await dialog.onConfirm();
          resolve(true);
          get().removeDialog(id);
        },
        onCancel: () => {
          dialog.onCancel?.();
          resolve(false);
          get().removeDialog(id);
        }
      };

      set((state) => ({
        dialogs: [...state.dialogs, newDialog]
      }));
    });
  },

  removeDialog: (id) => {
    set((state) => ({
      dialogs: state.dialogs.filter((dialog) => dialog.id !== id)
    }));
  }
}));

// 便捷方法
export const confirm = {
  danger: (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    return useConfirmStore.getState().showDialog({
      title,
      message,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
      onConfirm
    });
  },

  warning: (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    return useConfirmStore.getState().showDialog({
      title,
      message,
      type: 'warning',
      confirmText: '确认',
      cancelText: '取消',
      onConfirm
    });
  },

  info: (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    return useConfirmStore.getState().showDialog({
      title,
      message,
      type: 'info',
      confirmText: '确定',
      cancelText: '取消',
      onConfirm
    });
  }
};
```

这些实现模式提供了完整的文件管理、表单处理、搜索过滤和用户交互的解决方案，可以直接应用于配置切换工具的开发。