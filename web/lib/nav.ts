export type NavItem = {
  href: string
  label: string
  icon: string // lucide-react icon name
  comingSoon?: boolean
  badge?: string
}

export type NavGroup = {
  title: string
  items: NavItem[]
}

// 分组侧边导航配置（仅 UI 配置，不影响权限与路由守卫）
export const NAV_GROUPS: NavGroup[] = [
  {
    title: '工作台',
    items: [
      { href: '/', label: '主页', icon: 'Home' },
      { href: '/projects', label: '项目', icon: 'FolderKanban' },
      { href: '/edit/video/tasks', label: '任务', icon: 'ListChecks' }
    ]
  },
  {
    title: '生成',
    items: [
      { href: '/gen/image', label: '生图', icon: 'Image' },
      { href: '/gen/video', label: '生视频', icon: 'Video' }
    ]
  },
  {
    title: '编辑',
    items: [
      { href: '/edit/video', label: '视频剪辑', icon: 'Scissors' },
      { href: '/edit/image', label: '图像编辑', icon: 'Wand2', comingSoon: true }
    ]
  },
  {
    title: '资源',
    items: [
      { href: '/assets', label: '素材库', icon: 'Library' },
      { href: '/templates', label: '模板', icon: 'Shapes' }
    ]
  },
  {
    title: '实验',
    items: [{ href: '/labs', label: 'Labs', icon: 'FlaskConical' }]
  },
  {
    title: '管理',
    items: [
      { href: '/settings', label: '设置', icon: 'Settings' },
      { href: '/billing', label: '计费', icon: 'CreditCard' }
    ]
  }
]
