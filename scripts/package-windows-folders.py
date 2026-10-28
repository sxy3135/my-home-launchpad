from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo

root = Path(__file__).resolve().parent.parent
names = ['install.cmd', 'install.ps1', 'launcher.cs', 'README.md', 'uninstall.cmd', 'uninstall.ps1']
output = root / 'dist' / 'my-home-windows-folders.zip'
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in names:
        source = (root / 'windows-folders' / name).read_text(encoding='utf-8-sig')
        if name.endswith(('.ps1', '.cmd')):
            assert source.isascii(), f'{name} must remain ASCII; put application messages in launcher.cs'
            contents = source.replace('\n', '\r\n').encode('ascii')
        elif name == 'launcher.cs':
            contents = source.replace('\n', '\r\n').encode('utf-8-sig')
        else:
            contents = source.encode('utf-8')
        item = ZipInfo('my-home-windows-folders/' + name)
        item.compress_type = ZIP_DEFLATED
        archive.writestr(item, contents)
with ZipFile(output) as archive:
    assert archive.testzip() is None
print('Windows folder helper packaged from source.')
