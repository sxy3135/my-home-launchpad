using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

// Opens directories only. No shell, file execution or network access.
public static class MyHomeFolders {
    public static string ParseFolderLink(string link) {
        if (link == null || link.Length > 16384) throw new ArgumentException("链接为空或过长。");
        string path;
        const string prefix = "myhome-folder:open/";
        const string authorityPrefix = "myhome-folder://open/";
        if (link.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ||
            (link.StartsWith(authorityPrefix, StringComparison.OrdinalIgnoreCase) && !link.StartsWith(authorityPrefix + "?", StringComparison.OrdinalIgnoreCase))) {
            int prefixLength = link.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? prefix.Length : authorityPrefix.Length;
            string hex = link.Substring(prefixLength);
            if (hex.Length == 0 || hex.Length % 2 != 0 || !Regex.IsMatch(hex, @"\A[a-fA-F0-9]+\z"))
                throw new ArgumentException("本地资料链接格式不完整。请强制刷新网页后重试。");
            byte[] bytes = new byte[hex.Length / 2];
            for (int i = 0; i < bytes.Length; i++) bytes[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
            path = new UTF8Encoding(false, true).GetString(bytes);
        } else {
            // Compatibility: browsers/Windows may add a slash or unescape a v2 query.
            Match old = Regex.Match(link, @"\Amyhome-folder://open/?\?path=(.+)\z", RegexOptions.IgnoreCase);
            if (!old.Success) throw new ArgumentException("网页链接格式无法识别。请按 Ctrl+F5 刷新 My Home 后重试。");
            string value = old.Groups[1].Value;
            if (Regex.IsMatch(value, @"\A[a-zA-Z]:[\\/]")) path = value.Replace('/', '\\');
            else {
                if (!Regex.IsMatch(value, @"\A(?:[a-zA-Z0-9._~-]|%[a-fA-F0-9]{2})+\z"))
                    throw new ArgumentException("旧版链接编码异常。请强制刷新网页后重试。");
                MemoryStream bytes = new MemoryStream();
                for (int i = 0; i < value.Length; i++) {
                    if (value[i] == '%') { bytes.WriteByte(Convert.ToByte(value.Substring(i + 1, 2), 16)); i += 2; }
                    else bytes.WriteByte((byte)value[i]);
                }
                path = new UTF8Encoding(false, true).GetString(bytes.ToArray());
            }
        }
        if (path.Length < 3 || path.Length > 2048 || !Regex.IsMatch(path, @"\A[a-zA-Z]:\\"))
            throw new ArgumentException("Use an absolute Windows folder path, such as C:\\Courses\\Semester 2.");
        for (int i = 2; i < path.Length; i++) {
            char c = path[i];
            if (c < 32 || c == 127 || "<>\"|?*:/".IndexOf(c) >= 0)
                throw new ArgumentException("Invalid character in the folder path.");
        }
        while (path.Length > 3 && path.EndsWith("\\", StringComparison.Ordinal)) path = path.Substring(0, path.Length - 1);
        if (path.Length > 3) foreach (string part in path.Substring(3).Split('\\')) {
            if (part.Length == 0 || part == "." || part == ".." || part.EndsWith(".") || part.EndsWith(" ") ||
                Regex.IsMatch(part, @"\A(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|\z)", RegexOptions.IgnoreCase))
                throw new ArgumentException("Invalid directory name in the folder path.");
        }
        return Char.ToUpperInvariant(path[0]) + path.Substring(1);
    }
    public static string EncodeFolderPath(string path) {
        StringBuilder encoded = new StringBuilder();
        foreach (byte b in new UTF8Encoding(false, true).GetBytes(path)) {
            encoded.Append(b.ToString("X2"));
        }
        return "myhome-folder:open/" + encoded;
    }
    public static string ExplorerArgument(string path) {
        // Windows argument quoting: duplicate terminal backslashes before the closing quote.
        int trailing = 0;
        for (int i = path.Length - 1; i >= 0 && path[i] == '\\'; i--) trailing++;
        return "\"" + path + new String('\\', trailing) + "\"";
    }
    public static void SelfTest() {
        if (ExplorerArgument(@"C:\") != "\"C:\\\\\"" || ExplorerArgument(@"C:\My Courses") != "\"C:\\My Courses\"")
            throw new Exception("Explorer argument quoting failed.");
        string[] good = {
            @"C:\",
            @"C:\Users\Example\Cloud Drive\课程资料\Semester 1\Course 1",
            @"D:\Courses\Semester 2\课件 (Lecture) & Notes #1",
            @"E:\Reading\O'Brien + 100%"
        };
        foreach (string path in good) {
            string link = EncodeFolderPath(path);
            if (ParseFolderLink(link) != path) throw new Exception("Folder link round trip failed.");
            StringBuilder oldPayload = new StringBuilder();
            foreach (byte b in new UTF8Encoding(false, true).GetBytes(path)) oldPayload.Append('%').Append(b.ToString("X2"));
            string old = "myhome-folder://open?path=" + oldPayload;
            if (ParseFolderLink(link.Replace("myhome-folder:", "myhome-folder://")) != path ||
                ParseFolderLink(old) != path || ParseFolderLink(old.Replace("open?", "open/?")) != path ||
                ParseFolderLink("myhome-folder://open/?path=" + path) != path)
                throw new Exception("Legacy browser link compatibility failed.");
        }
        string[] bad = {
            "myhome-folder://open/semester-1/course-1", "myhome-folder://open?path=C%3A%5CWindows&run=cmd",
            "myhome-folder://open?path=C%3A%5CWindows%22", "myhome-folder://open?path=C%3A%5C..%5CWindows",
            "myhome-folder://open?path=%5C%5Cserver%5Cshare", "myhome-folder://open?path=C%3A%5CCON",
            "myhome-folder://open?path=C%3A%5CFoo%3Astream", "myhome-folder://open?path=C%3A%5CFoo%00",
            "myhome-folder://open?path=C%3A%5CFoo%0A", "myhome-folder://open?path=C%3A%5CFoo%FF",
            "myhome-folder://open?path=C%3A%5CFoo%20", "myhome-folder://open?path=C%3A%5C%5CFoo",
            "myhome-folder://open?path=C%3A%5CFoo#fragment", "myhome-folder://open?path=C%3A%5CFoo%",
            "myhome-folder://user@open?path=C%3A%5CWindows",
            "myhome-folder:open/43", "myhome-folder:open/433A5CFF",
            "myhome-folder:open/433A5C466F6F#fragment",
            "myhome-folder:open/433A5C466F6F&cmd=calc", "myhome-folder:open/XYZ",
            "myhome-folder:open/433A5C2E2E5C57696E646F7773"
        };
        foreach (string link in bad) {
            bool rejected = false;
            try { ParseFolderLink(link); } catch (Exception) { rejected = true; }
            if (!rejected) throw new Exception("Unsafe folder link was accepted.");
        }
    }
    [STAThread]
    public static int Main(string[] args) {
        try {
            if (args.Length == 1 && args[0] == "--self-test") { SelfTest(); return 0; }
            if (args.Length == 1 && args[0] == "--installed") {
                MessageBox.Show("安装完成（v3）。请按 Ctrl+F5 刷新 My Home，点击课程的资料入口。\n\n浏览器询问时允许打开 MyHomeFolders-v3。\n以后新增课程只需在网页填写资料路径，无需重新安装。",
                    "My Home · 安装完成 v3", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 0;
            }
            if (args.Length != 1) throw new ArgumentException("Invalid arguments. Open a folder from My Home.");
            string folder = ParseFolderLink(args[0]);
            if (!Directory.Exists(folder)) {
                MessageBox.Show("找不到这个文件夹。请检查 WPS 云盘同步，或在网页中修改资料路径。\n\n" + folder,
                    "My Home · 本地资料", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 2;
            }
            string explorer = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
            Process.Start(new ProcessStartInfo(explorer, ExplorerArgument(folder)) { UseShellExecute = false });
            return 0;
        } catch (Exception error) {
            string diagnostic = "MyHomeFolders v3\n" + DateTime.UtcNow.ToString("O") + "\n" + error.Message + "\nArgument count: " + args.Length;
            foreach (string arg in args) diagnostic += "\nReceived: " + arg.Substring(0, Math.Min(arg.Length, 4096));
            try {
                File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "last-launch-error.txt"), diagnostic, Encoding.UTF8);
            } catch (Exception) { }
            MessageBox.Show("无法打开本地资料（v3）。\n\n" + error.Message + "\n\n收到的链接：\n" +
                (args.Length > 0 ? args[0].Substring(0, Math.Min(args[0].Length, 600)) : "无") +
                "\n\n诊断记录：%LOCALAPPDATA%\\MyHomeFolders\\last-launch-error.txt",
                "My Home · 本地资料 v3", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 1;
        }
    }
}
