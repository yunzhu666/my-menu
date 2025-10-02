
import { Context, Schema, h } from 'koishi'
import {} from 'koishi-plugin-puppeteer'

export const name = 'my-menu'
export const inject = ['puppeteer']

export interface Config {
  defaultCategory: string
  enableCategories: boolean
  itemsPerPage: number
  allowUserSuggestions: boolean
  adminPermission: string
  enableImageMenu: boolean
  imageFooterText: string
  imageWidth: number
  imageColumnWidth: number
  defaultItems: Array<{
    id: string
    name: string
    description: string
    command: string
    category: string
    enabled: boolean
    order: number
    permissions: string[]
  }>
}

export const Config: Schema<Config> = Schema.object({
  defaultCategory: Schema.string().default('通用功能').description('默认分类名称'),
  enableCategories: Schema.boolean().default(true).description('启用分类显示'),
  itemsPerPage: Schema.number().min(5).max(50).default(10).description('每页显示菜单项数量'),
  allowUserSuggestions: Schema.boolean().default(true).description('允许用户建议新菜单项'),
  adminPermission: Schema.string().default('menu.admin').description('菜单管理权限'),
  enableImageMenu: Schema.boolean().default(false).description('启用图片菜单'),
  imageFooterText: Schema.string().default('菜单管理插件 | 使用 menu -i 查看图片菜单').description('图片底部额外信息'),
  imageWidth: Schema.number().min(800).max(2000).default(1600).description('图片生成宽度（像素），影响多列布局效果'),
  imageColumnWidth: Schema.number().min(200).max(600).default(400).description('每列最小宽度（像素），宽度除以此值计算列数'),
  defaultItems: Schema.array(Schema.object({
    id: Schema.string().required().description('菜单项ID'),
    name: Schema.string().required().description('菜单项名称'),
    description: Schema.string().required().description('菜单项描述'),
    command: Schema.string().required().description('菜单项命令'),
    category: Schema.string().required().description('菜单项分类'),
    enabled: Schema.boolean().default(true).description('是否启用'),
    order: Schema.number().default(1).description('显示顺序'),
    permissions: Schema.array(Schema.string()).default([]).description('权限要求')
  })).default([
    {
      id: 'signin',
      name: '签到',
      description: '每日签到获取积分',
      command: '#签到',
      category: '日常',
      enabled: true,
      order: 1,
      permissions: []
    },
    {
      id: 'hitokoto',
      name: '一言',
      description: '获取一条随机名言或句子',
      command: '#一言',
      category: '娱乐',
      enabled: true,
      order: 2,
      permissions: []
    },
    {
      id: 'music',
      name: '点歌',
      description: '点播指定歌曲',
      command: '#点歌 [歌曲]',
      category: '娱乐',
      enabled: true,
      order: 3,
      permissions: []
    },
    {
      id: 'domain',
      name: '域名查询',
      description: '查询域名信息',
      command: '#域名 [域名]',
      category: '工具',
      enabled: true,
      order: 4,
      permissions: []
    },
    {
      id: 'server',
      name: '服务器状态',
      description: '查询服务器状态信息',
      command: '#服务器 (地址)',
      category: '工具',
      enabled: true,
      order: 5,
      permissions: []
    }
  ]).description('默认菜单项配置')
})

export function apply(ctx: Context, config: Config) {
  // 检查 puppeteer 服务是否可用
  if (!ctx.puppeteer) {
    console.warn('puppeteer 服务未找到，图片菜单功能将不可用。请安装并启用 koishi-plugin-puppeteer 插件。')
  }

  // 初始化菜单数据存储
  const menuItems = new Map()
  // 使用配置中的默认菜单项
  config.defaultItems.forEach(item => menuItems.set(item.id, item))
  // 权限检查辅助函数
  async function checkPermission(session, permission) {
    // 方法1: 使用 session 的权限字段（如果存在）
    if (session.user?.authority && session.user.authority >= 3) {
      return true
    }
    // 方法2: 使用 Koishi 的权限系统（如果配置了权限插件）
    try {
      // 尝试使用 ctx.permissions 检查权限
      if (ctx.permissions) {
        return await ctx.permissions.test(permission, session)
      }
    }
    catch (error) {
      // 如果权限系统不可用，回退到基于用户ID的简单检查
      console.warn('权限系统不可用，使用基于用户ID的简单检查')
    }
    // 方法3: 简单的管理员ID检查（生产环境中应该配置更安全的权限系统）
    const adminUsers = ['123456789', '987654321'] // 替换为实际的管理员用户ID
    return adminUsers.includes(session.userId)
  }
  // 生成菜单图片的辅助函数
  async function generateMenuImage(items, pageNum, totalPages, category, all = false) {
    if (!ctx.puppeteer) {
      throw new Error('puppeteer 服务不可用，无法生成图片菜单')
    }

    // 计算动态列数
    const columns = Math.floor(config.imageWidth / config.imageColumnWidth)
    const flexBasis = `calc(${100 / columns}% - ${12 / columns}px)`
    const gapSize = 12

    // 构建下一页提示
    let nextPageHint = ''
    if (!all && totalPages > 1 && pageNum < totalPages) {
      nextPageHint = `<div class="next-page-hint">📄 下一页: menu -p ${pageNum + 1}${category ? ` -c ${category}` : ''} -i</div>`
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      margin: 0;
      padding: 8px;
      color: #333;
      min-height: 100vh;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 15px;
      padding: 18px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #667eea;
      padding-bottom: 15px;
    }
    .title {
      font-size: 40px;
      font-weight: bold;
      color: #667eea;
      margin: 0;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
    }
    .subtitle {
      font-size: 20px;
      color: #666;
      margin-top: 8px;
    }
    .category {
      margin-bottom: 25px;
    }
    .category-title {
      font-size: 24px;
      font-weight: bold;
      color: #764ba2;
      margin-bottom: 15px;
      padding-left: 10px;
      border-left: 4px solid #764ba2;
    }
    .menu-grid {
      display: flex;
      flex-wrap: wrap;
      gap: ${gapSize}px;
      margin-bottom: 15px;
    }
    .menu-item {
      flex: 1 1 ${flexBasis};
      background: white;
      border-radius: 12px;
      padding: 14px;
      border: 2px solid #e9ecef;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .menu-item:hover {
      border-color: #667eea;
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    }
    .item-name {
      font-size: 22px;
      font-weight: bold;
      color: #333;
      margin-bottom: 8px;
    }
    .item-description {
      font-size: 18px;
      color: #666;
      margin-bottom: 10px;
      line-height: 1.5;
    }
    .item-command {
      font-size: 16px;
      color: #667eea;
      font-family: 'Courier New', monospace;
      background: #f8f9fa;
      padding: 6px 12px;
      border-radius: 6px;
      display: inline-block;
      word-break: break-all;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #e9ecef;
      color: #666;
      font-size: 18px;
      line-height: 1.6;
      white-space: pre-line;
      word-wrap: break-word;
    }
    .footer div {
      margin-bottom: 8px;
    }
    .page-info {
      font-weight: bold;
      color: #667eea;
    }
    .next-page-hint {
      margin-top: 10px;
      color: #667eea;
      font-weight: bold;
      font-size: 16px;
    }
    .full-menu-indicator {
      color: #28a745;
      font-weight: bold;
      font-size: 16px;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="title">📋 功能菜单</h1>
      ${category ? `<div class="subtitle">分类: ${category}</div>` : ''}
    </div>

    ${config.enableCategories ?
      [...new Set(items.map(item => item.category))].map(cat => `
        <div class="category">
          <div class="category-title">📁 ${cat}</div>
          <div class="menu-grid">
            ${items.filter(item => item.category === cat).map(item => `
              <div class="menu-item">
                <div class="item-name">• ${item.name}</div>
                <div class="item-description">${item.description}</div>
                <div class="item-command">💡 使用: ${item.command}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('') :
      `
        <div class="menu-grid">
          ${items.map(item => `
            <div class="menu-item">
              <div class="item-name">• ${item.name}</div>
              <div class="item-description">${item.description}</div>
              <div class="item-command">💡 使用: ${item.command}</div>
            </div>
          `).join('')}
        </div>
      `}

    <div class="footer">
      ${totalPages > 1 ? `<div>第 <span class="page-info">${pageNum}</span> / <span class="page-info">${totalPages}</span> 页</div>` : ''}
      ${all ? '<div class="full-menu-indicator">📋 完整菜单（不分页）</div>' : ''}
      ${nextPageHint}
      <div>${config.imageFooterText}</div>
    </div>
  </div>
</body>
</html>
    `

    const browserPage = await ctx.puppeteer.page()
    try {
      await browserPage.setViewport({ width: config.imageWidth, height: 2000 })
      await browserPage.setContent(html, { waitUntil: 'networkidle0' })
      
      const buffer = await browserPage.screenshot({
        type: 'png',
        fullPage: true,
        encoding: 'binary'
      })
      
      return buffer
    } catch (error) {
      console.error('Puppeteer screenshot error:', error)
      throw error
    } finally {
      await browserPage.close()
    }
  }
  // 主菜单命令
  ctx.command('menu', '显示功能菜单')
    .option('category', '-c <category:string> 指定分类')
    .option('page', '-p <page:number> 页码')
    .option('image', '-i 以图片形式显示菜单')
    .option('all', '-a 显示所有菜单项（不分页）')
    .action(async ({ session, options }) => {
      const { category, page = 1, image, all } = options
      let filteredItems = Array.from(menuItems.values())
        .filter(item => item.enabled)
      // 按分类过滤
      if (category) {
        filteredItems = filteredItems.filter(item => item.category.toLowerCase().includes(category.toLowerCase()))
      }
      // 按顺序排序
      filteredItems.sort((a, b) => a.order - b.order)
      
      // 不分页处理
      let pageItems, currentPage, totalPagesValue
      if (all) {
        pageItems = filteredItems
        currentPage = 1
        totalPagesValue = 1
      } else {
        // 分页处理
        const startIndex = (page - 1) * config.itemsPerPage
        const endIndex = startIndex + config.itemsPerPage
        pageItems = filteredItems.slice(startIndex, endIndex)
        currentPage = page
        totalPagesValue = Math.ceil(filteredItems.length / config.itemsPerPage)
      }
      
      if (pageItems.length === 0) {
        return `没有找到菜单项${category ? `在分类"${category}"中` : ''}。`
      }
        // 构建菜单显示
        const useImage = image || config.enableImageMenu
        if (useImage) {
          if (!ctx.puppeteer) {
            return '图片菜单功能不可用，请安装并启用 koishi-plugin-puppeteer 插件。'
          }
          try {
            const imageBuffer = await generateMenuImage(pageItems, currentPage, totalPagesValue, category, all)
            return h.image(imageBuffer, 'image/png')
          }
          catch (error) {
            console.error('生成菜单图片失败:', error)
            return '生成图片菜单失败，请检查puppeteer服务是否正常运行。'
          }
        }
      let output = '📋 功能菜单\n\n'
      if (config.enableCategories) {
        const categories = [...new Set(pageItems.map(item => item.category))]
        for (const cat of categories) {
          output += `📁 ${cat}\n`
          const categoryItems = pageItems.filter(item => item.category === cat)
          categoryItems.forEach(item => {
            output += `  • ${item.name} - ${item.description}\n`
            output += `    💡 使用: ${item.command}\n\n`
          })
        }
      }
      else {
        pageItems.forEach(item => {
          output += `• ${item.name} - ${item.description}\n`
          output += `  💡 使用: ${item.command}\n\n`
        })
      }
      // 添加分页信息
      const totalPagesForText = Math.ceil(filteredItems.length / config.itemsPerPage)
      if (totalPagesForText > 1) {
        output += `\n第 ${page}/${totalPagesForText} 页，使用 menu -p ${page + 1} 查看下一页`
      }
      // 提示图片菜单功能
      if (!useImage) {
        output += `\n\n💡 提示: 使用 menu -i 以图片形式显示菜单`
      }
      return output
    })
  // 添加菜单项命令（需要权限）
  ctx.command('menu.add <name:string> <command:string>', '添加新菜单项')
    .option('description', '-d <desc:string> 描述信息')
    .option('category', '-c <cat:string> 分类名称')
    .option('order', '-o <order:number> 显示顺序')
    .action(async ({ session, options }, name, command) => {
      if (!name || !command) {
        return '请输入菜单项名称和命令。'
      }
      // 权限检查
      if (!session?.userId || !(await checkPermission(session, config.adminPermission))) {
        return '您没有权限执行此操作。'
      }
      const id = name.toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
      const newItem = {
        id,
        name,
        description: options.description || '暂无描述',
        command,
        category: options.category || config.defaultCategory,
        enabled: true,
        order: options.order || menuItems.size + 1
      }
      menuItems.set(id, newItem)
      return `✅ 菜单项 "${name}" 添加成功！ID: ${id}`
    })
  // 列出菜单项命令
  ctx.command('menu.list [category:string]', '列出菜单项')
    .action(({ session }, category) => {
      let items = Array.from(menuItems.values())
      if (category) {
        items = items.filter(item => item.category.toLowerCase().includes(category.toLowerCase()))
      }
      if (items.length === 0) {
        return `没有找到${category ? `分类"${category}"的` : ''}菜单项。`
      }
      let output = `📋 菜单项列表${category ? ` (分类: ${category})` : ''}\n\n`
      items.sort((a, b) => a.order - b.order).forEach(item => {
        output += `🆔 ${item.id}\n`
        output += `📛 名称: ${item.name}\n`
        output += `📖 描述: ${item.description}\n`
        output += `⚡ 命令: ${item.command}\n`
        output += `📁 分类: ${item.category}\n`
        output += `📊 顺序: ${item.order}\n`
        output += `🔧 状态: ${item.enabled ? '✅ 启用' : '❌ 禁用'}\n`
        output += '─'.repeat(20) + '\n'
      })
      return output
    })
  // 搜索菜单项命令
  ctx.command('menu.search <keyword:string>', '搜索菜单项')
    .action(({ session }, keyword) => {
      if (!keyword) {
        return '请输入搜索关键词。'
      }
      const results = Array.from(menuItems.values()).filter(item => item.name.toLowerCase().includes(keyword.toLowerCase()) ||
        item.description.toLowerCase().includes(keyword.toLowerCase()) ||
        item.command.toLowerCase().includes(keyword.toLowerCase()) ||
        item.category.toLowerCase().includes(keyword.toLowerCase()))
      if (results.length === 0) {
        return `没有找到包含"${keyword}"的菜单项。`
      }
      let output = `🔍 搜索结果 (关键词: "${keyword}")\n\n`
      results.forEach(item => {
        output += `• ${item.name} - ${item.description}\n`
        output += `  💡 使用: ${item.command}\n`
        output += `  📁 分类: ${item.category}\n\n`
      })
      return output
    })
  // 切换菜单项状态命令（需要权限）
  ctx.command('menu.toggle <id:string>', '启用/禁用菜单项')
    .action(async ({ session }, id) => {
      if (!session?.userId || !(await checkPermission(session, config.adminPermission))) {
        return '您没有权限执行此操作。'
      }
      const item = menuItems.get(id)
      if (!item) {
        return `未找到ID为"${id}"的菜单项。`
      }
      item.enabled = !item.enabled
      menuItems.set(id, item)
      return `✅ 菜单项 "${item.name}" 已${item.enabled ? '启用' : '禁用'}。`
    })
  // 删除菜单项命令（需要权限）
  ctx.command('menu.delete <id:string>', '删除菜单项')
    .action(async ({ session }, id) => {
      if (!session?.userId || !(await checkPermission(session, config.adminPermission))) {
        return '您没有权限执行此操作。'
      }
      const item = menuItems.get(id)
      if (!item) {
        return `未找到ID为"${id}"的菜单项。`
      }
      menuItems.delete(id)
      return `✅ 菜单项 "${item.name}" 已删除。`
    })
  // 编辑菜单项命令（需要权限）
  ctx.command('menu.edit <id:string>', '编辑菜单项')
    .option('name', '-n <name:string> 新名称')
    .option('description', '-d <desc:string> 新描述')
    .option('command', '-c <command:string> 新命令')
    .option('category', '-cat <category:string> 新分类')
    .option('order', '-o <order:number> 新顺序')
    .action(async ({ session, options }, id) => {
      if (!session?.userId || !(await checkPermission(session, config.adminPermission))) {
        return '您没有权限执行此操作。'
      }
      const item = menuItems.get(id)
      if (!item) {
        return `未找到ID为"${id}"的菜单项。`
      }
      // 更新字段
      if (options.name)
        item.name = options.name
      if (options.description)
        item.description = options.description
      if (options.command)
        item.command = options.command
      if (options.category)
        item.category = options.category
      if (options.order)
        item.order = options.order
      menuItems.set(id, item)
      return `✅ 菜单项 "${item.name}" 更新成功！`
    })
  // 分类管理命令（需要权限）
  ctx.command('menu.category', '分类管理')
    .subcommand('.list', '列出所有分类')
    .action(({ session }) => {
      const categories = [...new Set(Array.from(menuItems.values()).map(item => item.category))]
      if (categories.length === 0) {
        return '暂无分类。'
      }
      return `📁 所有分类:\n${categories.map(cat => `• ${cat}`).join('\n')}`
    })
    .subcommand('.change <id:string> <newCategory:string>', '更改菜单项分类')
    .action(async ({ session }, id, newCategory) => {
      if (!session?.userId || !(await checkPermission(session, config.adminPermission))) {
        return '您没有权限执行此操作。'
      }
      const item = menuItems.get(id)
      if (!item) {
        return `未找到ID为"${id}"的菜单项。`
      }
      const oldCategory = item.category
      item.category = newCategory
      menuItems.set(id, item)
      return `✅ 菜单项 "${item.name}" 已从"${oldCategory}"移动到"${newCategory}"。`
    })
  // 用户建议功能
  if (config.allowUserSuggestions) {
    ctx.command('menu.suggest <name:string> <command:string>', '建议新菜单项')
      .option('description', '-d <desc:string> 描述信息')
      .action(({ session, options }, name, command) => {
        // 在实际应用中，这里可以将建议保存到数据库或发送给管理员
        const suggestion = {
          name,
          command,
          description: options.description || '暂无描述',
          userId: session.userId,
          timestamp: new Date().toISOString()
        }
        // 这里可以添加将建议保存到数据库的逻辑
        console.log('用户建议:', suggestion)
        return `📝 感谢您的建议！菜单项 "${name}" 已提交给管理员审核。`
      })
  }
  // 插件卸载时清理资源
  ctx.on('dispose', () => {
    menuItems.clear()
  })
}
