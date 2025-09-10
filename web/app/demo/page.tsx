"use client"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default function DemoPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">UI 演示</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">按钮与提示</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button>主要按钮</Button>
            <Button variant="outline">描边按钮</Button>
            <Button variant="ghost">幽灵按钮</Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" aria-label="提示">
                    i
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Indigo 作为强调色</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">输入与选项卡</h2>
          <div className="space-y-3">
            <Input placeholder="输入点什么…" />
            <Tabs defaultValue="one" className="w-full">
              <TabsList>
                <TabsTrigger value="one">One</TabsTrigger>
                <TabsTrigger value="two">Two</TabsTrigger>
              </TabsList>
              <TabsContent value="one" className="text-sm text-muted-foreground">
                选项卡一内容
              </TabsContent>
              <TabsContent value="two" className="text-sm text-muted-foreground">
                选项卡二内容
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}

