#!/bin/bash
# Shortcuts: Shell /bin/bash; Input = Shortcut Input; Pass Input = as arguments.
# The path is data in one argument. Never paste an input variable into this script.
fail() { printf '%s\n' "$1" >&2; exit 1; }
[ "$#" -eq 1 ] || fail 'My Home：只接受一个文本文件夹路径，请将快捷指令输入作为参数传递。'
folder="$1"
case "$folder" in
  /*) ;;
  *) fail 'My Home：需要以 / 开头的 Mac 绝对文件夹路径。' ;;
esac
case "$folder" in
  //*|*/../*|*/./*|*/..|*/.) fail 'My Home：路径格式无效。请从 Finder 复制完整路径。' ;;
esac
if [[ "$folder" =~ [[:cntrl:]] ]]; then
  fail 'My Home：路径包含控制字符，请重新复制。'
fi
shopt -s nocasematch
case "${folder%/}" in
  *.app|*.workflow|*.scptd) fail 'My Home：这里只打开资料文件夹，不能打开应用或自动化文件包。' ;;
esac
if [ ! -d "$folder" ]; then
  if [ -e "$folder" ]; then
    fail 'My Home：此路径不是文件夹。'
  fi
  fail 'My Home：文件夹不存在或不可访问。请检查路径及快捷指令访问权限。'
fi
[ -r "$folder" ] && [ -x "$folder" ] || fail 'My Home：没有访问此文件夹的权限，请在快捷指令中允许必要访问。'
if ! /usr/bin/open -a Finder "$folder" 2>/dev/null; then
  fail 'My Home：Finder 打开失败。请检查文件夹和快捷指令权限后重试。'
fi
