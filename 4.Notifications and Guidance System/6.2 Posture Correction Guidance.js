// 6.2 ระบบแนะนำการแก้ท่าทาง — เปลี่ยน alert จาก 6.1 เป็นคำแนะนำที่ทำตามได้
// ยิ่งผิดเรื่องเดิมซ้ำ คำแนะนำยิ่งเจาะจงขึ้น (ลดความเร็ว -> ดูท่าตัวอย่าง)
'use strict';

// คำแนะนำเสริมตามคำสำคัญในข้อความติเตียน (ตรวจตามลำดับ)
const KEYWORD_TIPS = [
  { re: /เหยียด/, tip: 'ยืดข้อต่อให้ตรงสุด' },
  { re: /ยก.*(สูง|อีก)|สูงขึ้น/, tip: 'ค่อย ๆ ยกให้สูงขึ้นอีกนิด' },
  { re: /ลด|ต่ำเกิน|มากเกิน/, tip: 'ลดลงเล็กน้อยให้พอดี' },
  { re: /งอ/, tip: 'ปรับมุมงอทีละน้อย' },
  { re: /เอียง|ตรง|ลำตัว/, tip: 'ยืดหลังให้ตรง ไหล่ผ่อนคลาย' },
  { re: /แนบ/, tip: 'แนบแขนชิดลำตัวไว้' },
];

function guide(alert) {
  const base = alert.message;
  const found = KEYWORD_TIPS.find((k) => k.re.test(base));
  let tip = found ? found.tip : 'ทำช้า ๆ ให้ตรงตามภาพตัวอย่าง';
  if (alert.count >= 4) tip = 'ลองหยุดแล้วดูท่าตัวอย่างอีกครั้ง';
  else if (alert.count >= 2) tip = 'ทำช้าลงและปรับทีละจุด — ' + tip;
  return { message: base, tip, text: `${base} — ${tip}`, level: alert.level };
}

module.exports = { KEYWORD_TIPS, guide };
