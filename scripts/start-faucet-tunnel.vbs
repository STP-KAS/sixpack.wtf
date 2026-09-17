Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Remco\Documents\kaspa\groks-wallet\logs"
sh.Run "cmd /c ""C:\Users\Remco\Documents\kaspa\groks-wallet\bin\cloudflared.exe"" tunnel --url http://127.0.0.1:4020 --no-autoupdate >> cloudflared-faucet.out.log 2>> cloudflared-faucet.err.log", 0, False
