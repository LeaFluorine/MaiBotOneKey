import type { QqBackend } from "@shared/contracts";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogClose, DialogContent } from "@/components/ui/dialog";
import { WebviewPanel } from "./WebviewPanel";

interface QqWebuiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backend: QqBackend;
  url: string;
}

export function QqWebuiDialog({ open, onOpenChange, backend, url }: QqWebuiDialogProps): React.JSX.Element {
  const title = `${backend === "snowluma" ? "SnowLuma" : "NapCat"} WebUI`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="h-[calc(100vh-4rem)] grid-rows-[minmax(0,1fr)_auto] sm:max-w-[1180px]" showCloseButton={false} size="xl">
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogBody className="overflow-hidden p-0">
          <WebviewPanel
            active={open}
            title={title}
            url={url}
            toolbarActions={(
              <DialogClose asChild>
                <Button aria-label="关闭 WebUI" className="h-7 px-2 text-[11px]" size="sm" title="关闭 WebUI" variant="ghost">
                  <X />
                </Button>
              </DialogClose>
            )}
          />
        </DialogBody>
        {backend === "snowluma" ? (
          <section className="max-h-[35vh] overflow-auto border-t border-border bg-muted/40 px-6 py-5">
            <h2 className="text-xl font-semibold">在SnowLuma中连接上对应QQ</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              <li>使用QQ登录需要连接麦麦的账号</li>
              <li>
                进入SnowLuma 的 WebUI 的 <strong className="text-primary">进程注入</strong> 页面，选择对应的QQ并点击 <strong className="text-primary">加载</strong>
              </li>
            </ol>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
