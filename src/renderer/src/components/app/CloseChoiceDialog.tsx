import { PowerOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { getClosePreference, setClosePreference } from "@/lib/close-preference";
import { useShortcut } from "@/lib/use-shortcut";

export function CloseChoiceDialog(): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    return window.maibotDesktop?.onCloseRequest(() => {
      const preference = getClosePreference();
      if (preference !== "ask") {
        window.maibotDesktop?.chooseCloseAction(preference);
        return;
      }

      setRemember(false);
      setOpen(true);
    });
  }, []);

  const cancel = useCallback(() => setOpen(false), []);
  const minimize = useCallback(() => {
    setOpen(false);
    if (remember) {
      setClosePreference("minimize");
    }
    window.maibotDesktop?.chooseCloseAction("minimize");
  }, [remember]);
  const quit = useCallback(() => {
    setOpen(false);
    if (remember) {
      setClosePreference("quit");
    }
    window.maibotDesktop?.chooseCloseAction("quit");
  }, [remember]);

  useShortcut("Escape", cancel, { enabled: open, allowInEditable: true });
  useShortcut("Enter", minimize, { enabled: open, allowInEditable: true });
  useShortcut("Mod+Q", quit, { enabled: open });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) cancel(); }}>
      <DialogContent size="sm" showCloseButton={false}>
        <DialogHeader
          description="最小化到托盘可以偷偷运行；关闭应用会直接结束麦麦的生活。"
          icon={<PowerOff className="size-4" />}
          title={"\u5173\u95ed\u6216\u6700\u5c0f\u5316\u5230\u6258\u76d8\uff1f"}
          tone="danger"
        />
        <label className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
          <Checkbox
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          {"\u8bb0\u4f4f\u6211\u7684\u9009\u62e9\uff0c\u4e0b\u6b21\u76f4\u63a5\u6267\u884c"}
        </label>
        <DialogFooter>
          <Button onClick={cancel} size="sm" variant="ghost">
            {"\u53d6\u6d88"}
          </Button>
          <Button onClick={minimize} size="sm" variant="outline">
            {"\u6700\u5c0f\u5316"}
          </Button>
          <Button onClick={quit} size="sm" variant="destructive">
            {"\u5173\u95ed\u5e94\u7528"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
