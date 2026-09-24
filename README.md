# AfterCall

ส่วนขยาย Google Chrome สำหรับ Google Meet บันทึกแท็บประชุม เก็บ Live Captions เป็น transcript แล้วสรุปด้วย AI ผ่าน OpenRouter

ไม่มีบอทเข้าห้อง ไม่ต้องเป็น host และไฟล์ทั้งหมดเก็บอยู่ในเครื่องของคุณ

> **สถานะ:** 0.1.0 รุ่นแรก ติดตั้งจากซอร์สได้ ยังไม่มีบน Chrome Web Store และการอ่าน caption ยังไม่ได้ทดสอบกับประชุมจริงครบทุกแบบ

---

## ความสามารถ

- บันทึกแท็บ Google Meet เป็นวิดีโอ WebM ทั้งภาพคนในห้องและสไลด์ที่กำลังนำเสนอ
- ผสมเสียงไมค์ของคุณเข้าไฟล์ เปิด/ปิดได้
- เก็บ Live Captions ของ Meet เป็น transcript พร้อมชื่อคนพูดและเวลาในวิดีโอ
- กดสรุปด้วย AI เมื่อต้องการ (ไม่สรุปเองอัตโนมัติ ไม่เปลือง token): ภาพรวม, หัวข้อ, การตัดสินใจ, action items, ความเสี่ยง, คำถามที่ต้องตามต่อ
- เลือกโมเดล AI เองจาก OpenRouter (ค่าเริ่มต้น `google/gemini-3.8-flash`)
- แจ้งในแชท Meet ว่ากำลังบันทึก
- หยุดและเซฟอัตโนมัติเมื่อปิดแท็บหรือออกจากห้อง

## ความเป็นส่วนตัว

- วิดีโอไม่ออกจากเครื่อง ไม่มีเซิร์ฟเวอร์ของ AfterCall
- transcript ส่งออกเฉพาะตอนสรุป ไปที่ OpenRouter ด้วย API key ของคุณเอง และขอ `data_collection: "deny"` ทุกครั้ง
- API key เก็บใน `chrome.storage.local` แบบไม่เข้ารหัส
- ก่อนบันทึก แจ้งผู้เข้าร่วมทุกครั้ง การอัดผู้อื่นโดยไม่แจ้งอาจขัด PDPA กฎหมายในประเทศของคุณ หรือนโยบายองค์กร

---

## ติดตั้งจากซอร์ส

ต้องใช้ Google Chrome เวอร์ชัน 116 ขึ้นไป

```bash
git clone https://github.com/1amiearth/aftercall.git
```

1. เปิด `chrome://extensions`
2. เปิด **Developer mode** มุมขวาบน
3. กด **Load unpacked** แล้วเลือกโฟลเดอร์ `aftercall` (โฟลเดอร์ที่มี `manifest.json`)
4. ปักหมุดไอคอน AfterCall ไว้ที่แถบเครื่องมือ

อัปเดต: `git pull` แล้วกดปุ่มรีโหลดของ AfterCall ในหน้า `chrome://extensions`

## ตั้งค่า

1. สมัคร [OpenRouter](https://openrouter.ai) แล้วสร้าง API key
2. เปิด Side Panel ของ AfterCall ไปที่หน้าตั้งค่า ใส่ API key
3. เลือกโมเดล หรือใช้ค่าเริ่มต้น `google/gemini-3.8-flash` (ประชุม 1 ชม. ราว $0.03)
4. ถ้าจะผสมเสียงไมค์ กดอนุญาตไมค์ในหน้าที่เปิดขึ้นมาครั้งแรก

## วิธีใช้

1. เข้าห้อง Google Meet
2. เปิด Live captions (CC) และตั้งภาษา caption ให้ตรงกับภาษาที่คุย
3. เปิด Side Panel ของ AfterCall กด **Start**
4. Pause / Resume ได้ระหว่างประชุม
5. กด **Stop** หรือออกจากห้อง วิดีโอกับ transcript จะเซฟให้อัตโนมัติ
6. ถ้าต้องการสรุป กด **สรุปด้วย AI** ในการ์ดการบันทึกล่าสุด (ต้องมี API key) ไม่กดก็ไม่เสีย token

ไฟล์ที่ได้

```text
Downloads/AfterCall/2026-09-24_1430_abc-defg-hij/
    recording.webm
    transcript.md
    summary.md      (เฉพาะตอนกดสรุป)
```

ถ้าสรุปไม่สำเร็จ transcript ยังอยู่ กดสรุปอีกครั้งได้

## ข้อจำกัด

- ภาพในไฟล์เป็นภาพเท่าที่แท็บ Meet แสดงให้คุณเห็น ไม่ใช่จอต้นทางความละเอียดเต็ม
- ถ้าไม่เปิด CC จะไม่มี transcript และไม่มีสรุป
- Google เปลี่ยนหน้า Meet เมื่อไร การอ่าน caption และการส่งแชทอาจพังได้ ถ้าเจอ [เปิด issue](https://github.com/1amiearth/aftercall/issues)
- ไฟล์ WebM บางโปรแกรมเล่นลากแถบเวลาไม่ได้
- รองรับเฉพาะ Google Chrome

---

## พัฒนาต่อ

รายละเอียดสถาปัตยกรรม สิทธิ์ที่ขอ ลำดับการทำงาน และเหตุผลของแต่ละการตัดสินใจ อยู่ใน [docs/DESIGN.md](docs/DESIGN.md)

วิธีส่งโค้ดและกติกาของ repo อยู่ใน [CONTRIBUTING.md](CONTRIBUTING.md)

## ขอความช่วยเหลือ

- พบบั๊ก หรืออยากได้ฟีเจอร์: [GitHub Issues](https://github.com/1amiearth/aftercall/issues)
- ช่องโหว่ด้านความปลอดภัย: อย่าเปิด issue สาธารณะ ใช้ [Report a vulnerability](https://github.com/1amiearth/aftercall/security/advisories/new)

## License

[MIT](LICENSE)

AfterCall ไม่ได้เกี่ยวข้องกับ Google หรือได้รับการรับรองจาก Google "Google Meet" และ "Google Chrome" เป็นเครื่องหมายการค้าของ Google LLC
