// อ่านรูปทั้งหมดจากโฟลเดอร์ ../รูป แล้วฝังเป็น data URI ลงใน images-data.js
// เพื่อให้หน้าเว็บแสดงรูปได้ทุกวิธีที่เปิด (ดับเบิลคลิก, Live Server, file://)
const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'..','รูป');
const out={};
for(const f of fs.readdirSync(dir)){
  if(!/\.(jpe?g|png|webp|gif)$/i.test(f))continue;
  const ext=path.extname(f).slice(1).toLowerCase().replace('jpg','jpeg');
  out[f]=`data:image/${ext};base64,`+fs.readFileSync(path.join(dir,f)).toString('base64');
}
fs.writeFileSync(path.join(__dirname,'images-data.js'),'window.PAD_IMAGES='+JSON.stringify(out)+';\n');
console.log('ซิงค์รูป',Object.keys(out).length,'ไฟล์:',Object.keys(out).join(', '));
