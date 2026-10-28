import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {deflateRawSync} from 'node:zlib';
import {resolve} from 'node:path';

const crcTable = Array.from({length:256}, (_, i) => {
  let crc=i;
  for(let n=0;n<8;n++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  return crc>>>0;
});
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes) crc=(crc>>>8)^crcTable[(crc^byte)&255];
  return (crc^0xffffffff)>>>0;
}

export async function packageWindowsFolders(root=resolve(import.meta.dirname,'..')) {
  const files=['install.cmd','install.ps1','launcher.cs','README.md','uninstall.cmd','uninstall.ps1'];
  const entries=[], directory=[];
  let offset=0;
  for(const file of files) {
    let text=(await readFile(resolve(root,'windows-folders',file),'utf8')).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
    if(/\.(ps1|cmd)$/.test(file)) {
      if(/[^\x00-\x7f]/.test(text)) throw Error(file+' must contain ASCII installer text.');
      text=text.replace(/\n/g,'\r\n');
    } else if(file==='launcher.cs') text='\uFEFF'+text.replace(/\n/g,'\r\n');
    const bytes=Buffer.from(text,'utf8'), data=deflateRawSync(bytes), name=Buffer.from('my-home-windows-folders/'+file);
    const crc=crc32(bytes), local=Buffer.alloc(30), central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    entries.push(local,name,data);directory.push(central,name);offset+=local.length+name.length+data.length;
  }
  const central=Buffer.concat(directory), end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  await mkdir(resolve(root,'dist'),{recursive:true});
  await writeFile(resolve(root,'dist/my-home-windows-folders.zip'),Buffer.concat([...entries,central,end]));
}
