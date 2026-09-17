Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Remco\sixpack.wtf"
sh.Run """C:\Program Files\nodejs\node.exe"" serve.mjs", 0, False
