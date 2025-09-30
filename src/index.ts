// src/index.ts
import { Context, Schema, h } from 'koishi';

// 定义菜单项接口
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  command: string;
  category: string;
  enabled: boolean;
  order: number;
  permissions?: string[];
}

// 定义插件配置结构
export interface Config {
  defaultCategory: string;
  enableCategories: boolean;
  itemsPerPage: number;
  allowUserSuggestions: boolean;
  adminPermission: string;
  enableImageMenu: boolean;
  defaultItems: MenuItem[];
}

// 创建配置Schema
export const Config: Schema<Config> = Schema.object({
  defaultCategory: Schema.string().default('通用功能').description('默认分类名称'),
  enableCategories: Schema.boolean().default(true).description('启用分类显示'),
  itemsPerPage: Schema.number().min(5).max(50).default(10).description('每页显示菜单项数量'),
  allowUserSuggestions: Schema.boolean().default(true).description('允许用户建议新菜单项'),
  adminPermission: Schema.string().default('menu.admin').description('菜单管理权限'),
  enableImageMenu: Schema.boolean().default(false).description('启用图片菜单'),
  defaultItems: Schema.array(
    Schema.object({
      id: Schema.string().required().description('菜单项ID'),
      name: Schema.string().required().description('菜单项名称'),
      description: Schema.string().required().description('菜单项描述'),
      command: Schema.string().required().description('菜单项命令'),
      category: Schema.string().required().description('菜单项分类'),
      enabled: Schema.boolean().default(true).description('是否启用'),
      order: Schema.number().default(1).description('显示顺序'),
      permissions: Schema.array(Schema.string()).default([]).description('权限要求')
    })
  ).default([
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
});

// 插件名称
export const name = 'menu-manager';

// 插件使用说明
export const usage = `
## 🎯 菜单管理插件使用指南

### 基本命令
- **menu** - 显示完整的菜单
- **menu.add <名称> <命令>** - 添加新菜单项（需要管理权限）
- **menu.list [分类]** - 列出指定分类的菜单项
- **menu.search <关键词>** - 搜索菜单项

### 管理命令（需要权限）
- **menu.edit <ID>** - 编辑菜单项
- **menu.delete <ID>** - 删除菜单项
- **menu.toggle <ID>** - 启用/禁用菜单项
- **menu.category** - 分类管理

### 配置说明
在插件配置中可以设置：
- 默认分类名称
- 是否启用分类显示
- 每页显示菜单项数量
- 是否允许用户建议新菜单项
- 菜单管理权限
- 是否启用图片菜单
- **默认菜单项配置** - 可以直接在配置区编辑默认菜单项的名称、描述、命令、分类、启用状态和显示顺序
`;

export function apply(ctx: Context, config: Config) {
  // 初始化菜单数据存储
  const menuItems = new Map<string, MenuItem>();
  
  // 使用配置中的默认菜单项
  config.defaultItems.forEach(item => menuItems.set(item.id, item));

  // 权限检查辅助函数
  async function checkPermission(session: any, permission: string): Promise<boolean> {
    // 方法1: 使用 session 的权限字段（如果存在）
    if (session.user?.authority && session.user.authority >= 3) {
      return true;
    }
    // 方法2: 使用 Koishi 的权限系统（如果配置了权限插件）
    try {
      // 尝试使用 ctx.permissions 检查权限
      if (ctx.permissions) {
        return await ctx.permissions.test(permission, session);
      }
    } catch (error) {
      // 如果权限系统不可用，回退到基于用户ID的简单检查
      console.warn('权限系统不可用，使用基于用户ID的简单检查');
    }
    // 方法3: 简单的管理员ID检查（生产环境中应该配置更安全的权限系统）
    const adminUsers = ['123456789', '987654321']; // 替换为实际的管理员用户ID
    return adminUsers.includes(session.userId);
  }

  // 主菜单命令
  ctx.command('menu', '显示功能菜单')
    .option('category', '-c <category:string> 指定分类')
    .option('page', '-p <page:number> 页码')
    .action(({ session, options }) => {
      const { category, page = 1 } = options;
      let filteredItems = Array.from(menuItems.values())
        .filter(item => item.enabled);
      
      // 按分类过滤
      if (category) {
        filteredItems = filteredItems.filter(item => 
          item.category.toLowerCase().includes(category.toLowerCase())
        );
      }
      
      // 按顺序排序
      filteredItems.sort((a, b) => a.order - b.order);
      
      // 分页处理
      const startIndex = (page - 1) * config.itemsPerPage;
      const endIndex = startIndex + config.itemsPerPage;
      const pageItems = filteredItems.slice(startIndex, endIndex);
      
      if (pageItems.length === 0) {
        return `没有找到菜单项${category ? `在分类"${category}"中` : ''}。`;
      }
      
      // 构建菜单显示
      if (config.enableImageMenu) {
        return '图片菜单功能暂未实现，敬请期待！';
      }
      
      let output = '📋 功能菜单\n\n';
      
      if (config.enableCategories) {
        const categories = [...new Set(pageItems.map(item => item.category))];
        for (const cat of categories) {
          output += `📁 ${cat}\n`;
          const categoryItems = pageItems.filter(item => item.category === cat);
          categoryItems.forEach(item => {
            output += `  • ${item.name} - ${item.description}\n`;
            output += `    💡 使用: ${item.command}\n\n`;
          });
        }
      } else {
        pageItems.forEach(item => {
          output += `• ${item.name} - ${item.description}\n`;
          output += `  💡 使用: ${item.command}\n\n`;
        });
      }
      
      // 添加分页信息
      const totalPages = Math.ceil(filteredItems.length / config.itemsPerPage);
      if (totalPages > 1) {
        output += `\n第 ${page}/${totalPages} 页，使用 menu -p ${page + 1} 查看下一页`;
      }
      
      return output;
    });

  // 添加菜单项命令（需要权限）
  ctx.command('menu.add <name:string> <command:string>', '添加新菜单项')
    .option('description', '-d <desc:string> 描述信息')
    .option('category', '-c <cat:string> 分类名称')
    .option('order', '-o <order:number> 显示顺序')
    .action(({ session, options }, name, command) => {
      if (!name || !command) {
        return '请输入菜单项名称和命令。';
      }
      
      // 权限检查
      if (!session?.userId || !checkPermission(session, config.adminPermission)) {
        return '您没有权限执行此操作。';
      }
      
      const id = generateId(name);
      const newItem: MenuItem = {
        id,
        name,
        description: options.description || '暂无描述',
        command,
        category: options.category || config.defaultCategory,
        enabled: true,
        order: options.order || menuItems.size + 1
      };
      
      menuItems.set(id, newItem);
      return `✅ 菜单项 "${name}" 添加成功！ID: ${id}`;
    });

  // 列出菜单项命令
  ctx.command('menu.list [category:string]', '列出菜单项')
    .action(({ session }, category) => {
      let items = Array.from(menuItems.values());
      
      if (category) {
        items = items.filter(item => 
          item.category.toLowerCase().includes(category.toLowerCase())
        );
      }
      
      if (items.length === 0) {
        return `没有找到${category ? `分类"${category}"的` : ''}菜单项。`;
      }
      
      let output = `📋 菜单项列表${category ? ` (分类: ${category})` : ''}\n\n`;
      items.sort((a, b) => a.order - b.order).forEach(item => {
        output += `🆔 ${item.id}\n`;
        output += `📛 名称: ${item.name}\n`;
        output += `📖 描述: ${item.description}\n`;
        output += `⚡ 命令: ${item.command}\n`;
        output += `📁 分类: ${item.category}\n`;
        output += `📊 顺序: ${item.order}\n`;
        output += `🔧 状态: ${item.enabled ? '✅ 启用' : '❌ 禁用'}\n`;
        output += '─'.repeat(20) + '\n';
      });
      
      return output;
    });

  // 搜索菜单项命令
  ctx.command('menu.search <keyword:string>', '搜索菜单项')
    .action(({ session }, keyword) => {
      if (!keyword) {
        return '请输入搜索关键词。';
      }
      
      const results = Array.from(menuItems.values()).filter(item =>
        item.name.toLowerCase().includes(keyword.toLowerCase()) ||
        item.description.toLowerCase().includes(keyword.toLowerCase()) ||
        item.command.toLowerCase().includes(keyword.toLowerCase()) ||
        item.category.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (results.length === 0) {
        return `没有找到包含"${keyword}"的菜单项。`;
      }
      
      let output = `🔍 搜索结果 (关键词: "${keyword}")\n\n`;
      results.forEach(item => {
        output += `• ${item.name} - ${item.description}\n`;
        output += `  💡 使用: ${item.command}\n`;
        output += `  📁 分类: ${item.category}\n\n`;
      });
      
      return output;
    });

  // 切换菜单项状态命令（需要权限）
  ctx.command('menu.toggle <id:string>', '启用/禁用菜单项')
    .action(({ session }, id) => {
      if (!session?.userId || !checkPermission(session, config.adminPermission)) {
        return '您没有权限执行此操作。';
      }
      
      const item = menuItems.get(id);
      if (!item) {
        return `未找到ID为"${id}"的菜单项。`;
      }
      
      item.enabled = !item.enabled;
      menuItems.set(id, item);
      
      return `✅ 菜单项 "${item.name}" 已${item.enabled ? '启用' : '禁用'}。`;
    });

  // 删除菜单项命令（需要权限）
  ctx.command('menu.delete <id:string>', '删除菜单项')
    .action(({ session }, id) => {
      if (!session?.userId || !checkPermission(session, config.adminPermission)) {
        return '您没有权限执行此操作。';
      }
      
      const item = menuItems.get(id);
      if (!item) {
        return `未找到ID为"${id}"的菜单项。`;
      }
      
      menuItems.delete(id);
      return `✅ 菜单项 "${item.name}" 已删除。`;
    });

  // 编辑菜单项命令（需要权限）
  ctx.command('menu.edit <id:string>', '编辑菜单项')
    .option('name', '-n <name:string> 新名称')
    .option('description', '-d <desc:string> 新描述')
    .option('command', '-c <command:string> 新命令')
    .option('category', '-cat <category:string> 新分类')
    .option('order', '-o <order:number> 新顺序')
    .action(({ session, options }, id) => {
      if (!session?.userId || !checkPermission(session, config.adminPermission)) {
        return '您没有权限执行此操作。';
      }
      
      const item = menuItems.get(id);
      if (!item) {
        return `未找到ID为"${id}"的菜单项。`;
      }
      
      // 更新字段
      if (options.name) item.name = options.name;
      if (options.description) item.description = options.description;
      if (options.command) item.command = options.command;
      if (options.category) item.category = options.category;
      if (options.order) item.order = options.order;
      
      menuItems.set(id, item);
      return `✅ 菜单项 "${item.name}" 更新成功！`;
    });

  // 分类管理命令（需要权限）
  ctx.command('menu.category', '分类管理')
    .subcommand('.list', '列出所有分类')
    .action(({ session }) => {
      const categories = [...new Set(Array.from(menuItems.values()).map(item => item.category))];
      if (categories.length === 0) {
        return '暂无分类。';
      }
      return `📁 所有分类:\n${categories.map(cat => `• ${cat}`).join('\n')}`;
    })
    .subcommand('.change <id:string> <newCategory:string>', '更改菜单项分类')
    .action(({ session }, id, newCategory) => {
      if (!session?.userId || !checkPermission(session, config.adminPermission)) {
        return '您没有权限执行此操作。';
      }
      
      const item = menuItems.get(id);
      if (!item) {
        return `未找到ID为"${id}"的菜单项。`;
      }
      
      const oldCategory = item.category;
      item.category = newCategory;
      menuItems.set(id, item);
      
      return `✅ 菜单项 "${item.name}" 已从"${oldCategory}"移动到"${newCategory}"。`;
    });

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
        };
        
        // 这里可以添加将建议保存到数据库的逻辑
        console.log('用户建议:', suggestion);
        
        return `📝 感谢您的建议！菜单项 "${name}" 已提交给管理员审核。`;
      });
  }

  // 生成唯一ID的辅助函数
  function generateId(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  }

  // 插件卸载时清理资源
  ctx.on('dispose', () => {
    menuItems.clear();
  });
}
