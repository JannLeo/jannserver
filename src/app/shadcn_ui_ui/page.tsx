"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowRight,
  Box,
  Code,
  Code2,
  Command,
  Eye,
  Feather,
  Palette,
  Search,
  Sparkles,
  SunMoon,
  Terminal,
} from "lucide-react"

const components = [
  { name: "Button", desc: "多态按钮，支持 variant/size/asChild", icon: Box },
  { name: "Card", desc: "容器卡片，自适应 Header/Title/Content/Footer", icon: Code },
  { name: "Badge", desc: "状态标记，variant: 默认/次要/警示/边框", icon: Command },
  { name: "Input", desc: "文本输入，圆角边框 + focus 环", icon: Terminal },
  { name: "Dialog", desc: "模态弹窗，可定制标题/描述/操作", icon: Eye },
  { name: "Dropdown", desc: "下拉菜单，支持 Checkbox/Radio 分组", icon: Feather },
  { name: "Tabs", desc: "标签切换，水平/垂直布局", icon: Search },
  { name: "Select", desc: "下拉选择，搜索过滤 + 分组", icon: SunMoon },
]

const badges = ["React 19", "Next.js 14", "Tailwind CSS", "Radix UI", "TypeScript", "Accessible", "RSC Compatible", "Tree-shakeable"]

export default function ShadcnShowcase() {
  const [count, setCount] = React.useState(0)

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-[10px] text-white">s</span>
                        <span className="hidden sm:inline">shadcn/ui</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">v2.0</Badge>
                        <Button variant="ghost" size="icon">
                          <Code2 className="h-4 w-4" />
                        </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12">
        {/* Hero */}
        <section className="mb-16 text-center">
          <Badge variant="secondary" className="mb-4">✨ Beautifully designed components</Badge>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Build your app with{" "}
            <span className="bg-gradient-to-r from-zinc-800 to-zinc-500 bg-clip-text text-transparent">
              shadcn/ui
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-zinc-500">
            A set of beautifully designed, accessible React components. Copy-paste into your project. 
            Customize. Own. Ship.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button className="gap-2">
              Get Started <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="gap-2">
              <Code2 className="h-4 w-4" /> GitHub
            </Button>
          </div>

          {/* 搜索 */}
          <div className="mx-auto mt-8 flex max-w-md gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input placeholder="Search components..." className="pl-9" />
            </div>
            <Button variant="secondary">
              <Command className="mr-1 h-4 w-4" />K
            </Button>
          </div>
        </section>

        {/* 组件网格 */}
        <section className="mb-16">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Components</h2>
            <Badge variant="outline">{components.length} available</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {components.map((c) => {
              const Icon = c.icon
              return (
                <Card key={c.name} className="group cursor-pointer transition-all hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-zinc-900 group-hover:text-white">
                        <Icon className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-sm">{c.name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{c.desc}</CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        {/* 交互示例 */}
        <section className="mb-16 rounded-2xl border border-zinc-200 p-8">
          <h2 className="mb-6 text-xl font-bold">Interactive Demo</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => setCount(c => c + 1)}>
              Clicks: {count}
            </Button>
            <Button variant="secondary" onClick={() => setCount(0)}>
              Reset
            </Button>
            <Button variant="outline" className="gap-2">
              <Sparkles className="h-4 w-4" /> Outline
            </Button>
            <Button variant="destructive" className="gap-2">
              Delete
            </Button>
            <Button variant="ghost" className="gap-2">
              <Eye className="h-4 w-4" /> Ghost
            </Button>
            <Button variant="link" className="gap-2">
              Link <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" variant="outline">
              <Palette className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Input placeholder="Type something..." className="max-w-xs" />
            <Button>Submit</Button>
          </div>

          {/* Badges */}
          <div className="mt-8 flex flex-wrap gap-2">
            {badges.map((b) => (
              <Badge key={b} variant="secondary">{b}</Badge>
            ))}
            <Badge>New</Badge>
            <Badge variant="outline">Coming Soon</Badge>
          </div>
        </section>

        {/* Call to Action */}
        <section className="text-center">
          <Card className="mx-auto max-w-lg border-zinc-900/10 bg-gradient-to-br from-zinc-50 to-white">
            <CardHeader>
              <CardTitle>Ready to use?</CardTitle>
              <CardDescription>
                Copy-paste any component into your project. Fully customizable via Tailwind CSS.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center gap-3">
              <Button className="gap-2">
                View Components <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="gap-2">
                <Code className="h-4 w-4" /> Source
              </Button>
            </CardFooter>
          </Card>
        </section>

        <footer className="mt-16 border-t border-zinc-200 py-6 text-center text-sm text-zinc-400">
          Built with shadcn/ui · MIT License
        </footer>
      </main>
    </div>
  )
}