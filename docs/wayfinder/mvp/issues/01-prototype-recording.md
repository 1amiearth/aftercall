# Prototype การอัดแท็บ Meet

Type: prototype
Status: claimed
Blocked by: -

## Question

โครงการอัดใน DESIGN.md ทำงานได้จริงไหม ต้องตอบให้ได้ 5 ข้อ

1. กดปุ่มใน Side Panel แล้ว service worker เรียก `chrome.tabCapture.getMediaStreamId({ targetTabId })` ได้ไหม หรือต้องเริ่มจากการกดไอคอนส่วนขยาย
2. Offscreen ใช้ stream id นั้นกับ `getUserMedia` (`chromeMediaSource: "tab"` + `maxWidth/maxHeight/maxFrameRate`) ได้ภาพ 1080p ไหม
3. ต่อเสียงแท็บกลับเข้า `AudioContext.destination` แล้วผู้บันทึกยังได้ยินเสียงห้องปกติไหม (ไม่ดีเลย์ ไม่ซ้ำ)
4. ขอสิทธิ์ไมค์ครั้งเดียวผ่านแท็บ `permissions.html` แล้ว Offscreen เรียก `getUserMedia({ audio: true })` ได้โดยไม่ถามซ้ำไหม และเสียงไมค์ผสมเข้าไฟล์โดยไม่ออกลำโพง
5. `vp9,opus` ที่ 1.5 Mbps ได้ไฟล์กี่ MB ต่อ 10 นาที ตอนแชร์สไลด์อ่านตัวหนังสือออกไหม และ Offscreen ใช้หน่วยความจำเท่าไร

ผลของข้อ 5 ใช้ตัดสินเรื่อง "การเก็บวิดีโอระหว่างบันทึก" ใน Not yet specified

ผู้บันทึกต้องเปิดห้อง Meet จริงและกดทดสอบเอง

## Comments

- 2026-09-24 ผู้บันทึกทดสอบในห้อง Meet จริง: **ทาง A ใช้ได้** กดปุ่มใน Side Panel แล้ว service worker ได้ stream id ไม่ต้องกดไอคอน (ตอบข้อ 1) และ**ได้ยินเสียงห้องปกติ**ระหว่างอัด (ตอบข้อ 3) ยังเหลือข้อ 2, 4, 5
