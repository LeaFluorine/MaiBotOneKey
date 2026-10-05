import { Input } from "@/components/ui/input";

export function OfficialQqCredentialsFields({ appId, appSecret, onAppIdChange, onAppSecretChange, disabled }: {
  appId: string;
  appSecret: string;
  onAppIdChange: (value: string) => void;
  onAppSecretChange: (value: string) => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <div className="w-full space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium">
          AppID
          <Input autoComplete="off" disabled={disabled} onChange={(event) => onAppIdChange(event.target.value)} placeholder="填写机器人 AppID" required value={appId} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium">
          AppSecret
          <Input autoComplete="new-password" disabled={disabled} onChange={(event) => onAppSecretChange(event.target.value)} placeholder="填写机器人 AppSecret" required type="password" value={appSecret} />
        </label>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <a className="text-primary underline underline-offset-2" href="https://q.qq.com/#/" onClick={(event) => {
          if (window.maibotDesktop) {
            event.preventDefault();
            void window.maibotDesktop.openExternal("https://q.qq.com/#/");
          }
        }} rel="noreferrer" target="_blank">前往 QQ开放平台</a>
        {" 可以在QQ开放平台申请注册QQ机器人"}
      </p>
    </div>
  );
}
