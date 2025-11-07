// CSS 选择器调试脚本
// 在浏览器开发者工具控制台中运行此脚本来诊断选择器问题

function debugPromptButtonSelector() {
  console.group('🔍 CSS 选择器调试分析');

  // 1. 检查基本容器
  const promptList = document.getElementById('promptList');
  console.log('✓ promptList 容器:', promptList);

  if (!promptList) {
    console.error('❌ 未找到 promptList 容器');
    console.groupEnd();
    return;
  }

  // 2. 检查提示词卡片数量
  const promptCards = document.querySelectorAll('#promptList .prompt-card');
  console.log('✓ 提示词卡片数量:', promptCards.length);

  if (promptCards.length === 0) {
    console.warn('⚠️ 未找到提示词卡片，可能原因:');
    console.warn('  - 数据尚未加载完成');
    console.warn('  - 标签过滤导致无结果');
    console.warn('  - 显示空状态');

    // 检查空状态
    const emptyState = document.querySelector('#promptList .empty-state');
    if (emptyState) {
      console.warn('  ✓ 发现空状态元素:', emptyState.textContent);
    }
  }

  // 3. 测试各种选择器
  const selectors = [
    '原始 XPath 对应的 CSS',
    '#promptList > article:first-child > div > button',

    '修正的选择器',
    '#promptList .prompt-card:first-child .btn-primary',
    '#promptList article:first-child .prompt-card-header button',

    '更宽松的选择器',
    '#promptList .btn-primary:first-child',
    '#promptList button:first-child'
  ];

  selectors.forEach(description => {
    const selector = description.split('\n')[1]; // 获取第二行的选择器
    if (selector) {
      const element = document.querySelector(selector);
      console.log(`✓ ${selector}:`, element ? '✅ 找到' : '❌ 未找到');
      if (element) {
        console.log(`  文本: "${element.textContent}"`);
        console.log(`  类名: "${element.className}"`);
      }
    }
  });

  // 4. 检查按钮详情
  const firstButton = document.querySelector('#promptList .prompt-card:first-child .btn-primary');
  if (firstButton) {
    console.log('✓ 第一个按钮详情:');
    console.log('  文本:', firstButton.textContent);
    console.log('  类名:', firstButton.className);
    console.log('  父元素:', firstButton.parentElement?.className);
    console.log('  祖父元素:', firstButton.parentElement?.parentElement?.className);

    // 模拟点击测试
    console.log('✓ 模拟点击测试...');
    try {
      firstButton.click();
      console.log('✅ 点击成功');
    } catch (error) {
      console.error('❌ 点击失败:', error.message);
    }
  }

  // 5. 检查应用状态
  console.log('✓ 应用状态检查:');
  if (window.state) {
    console.log('  客户端数量:', window.state.clients?.length || 0);
    console.log('  当前客户端:', window.state.currentClientId);
    console.log('  提示词数量:', window.state.prompts?.length || 0);
    console.log('  选中标签:', window.state.selectedTags);
  } else {
    console.warn('  ⚠️ 无法访问应用状态 (window.state)');
  }

  console.groupEnd();

  // 返回推荐的选择器
  return {
    recommendedSelector: '#promptList .prompt-card:first-child .btn-primary',
    alternativeSelector: '#promptList article:first-child .prompt-card-header button',
    firstButton: firstButton
  };
}

// 自动执行调试
const result = debugPromptButtonSelector();

// 导出函数供手动调用
window.debugPromptButtonSelector = debugPromptButtonSelector;

// 提供快捷方法
console.log('💡 调试完成！使用 debugPromptButtonSelector() 重新运行调试');
console.log('📋 推荐的选择器:', result.recommendedSelector);