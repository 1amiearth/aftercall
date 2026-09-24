# ร่วมพัฒนา AfterCall

ขอบคุณที่สนใจ อ่าน [docs/DESIGN.md](docs/DESIGN.md) ก่อนเริ่ม เพื่อเข้าใจว่าแต่ละส่วนทำงานอย่างไรและทำไมถึงออกแบบแบบนั้น

## เริ่มพัฒนา

1. Fork แล้ว clone repo
2. โหลดส่วนขยายแบบ unpacked ตาม [README](README.md#ติดตั้งจากซอร์ส)
3. แก้โค้ดแล้วกดรีโหลดในหน้า `chrome://extensions` แท็บ Meet ต้องรีโหลดด้วยถ้าแก้ content script
4. ดู log ของแต่ละส่วน
   - Service worker: ลิงก์ **service worker** ในการ์ดของ AfterCall
   - Offscreen และ Side Panel: `chrome://inspect/#other`
   - Content script: DevTools ของแท็บ Meet

## ทดสอบก่อนส่ง PR

logic ล้วนใน `src/lib/` มีชุดทดสอบ ไม่ต้องติดตั้งอะไรเพิ่ม (Node 22 ขึ้นไป)

```bash
node --test
```

การอัดไม่มีชุดทดสอบอัตโนมัติ ให้ลองในห้อง Meet จริงอย่างน้อย

- Start / Pause / Resume / Stop แล้วได้ไฟล์ครบ 3 ไฟล์
- ระหว่างอัดยังได้ยินเสียงห้อง
- เปิดและปิดไมค์
- ปิดแท็บ Meet กลางคัน แล้วไฟล์ยังถูกเซฟ
- ถ้าแก้การอ่าน caption ให้แนบตัวอย่าง `transcript.md` ที่ได้ (ลบชื่อและเนื้อหาจริงของผู้อื่นก่อน)

## กติกา

- **ห้ามโหลดโค้ดจากภายนอก** โค้ดทั้งหมดต้องอยู่ใน repo ตามนโยบาย Manifest V3 ของ Chrome Web Store
- **ห้ามเพิ่มสิทธิ์ใน `manifest.json` โดยไม่มีเหตุผล** ถ้าจำเป็น ให้เพิ่มแถวในตาราง "สิทธิ์ที่ขอ" ของ `docs/DESIGN.md` ใน PR เดียวกัน
- **ห้ามส่งข้อมูลออกนอกเครื่องเพิ่ม** นอกจาก transcript ไป CLI ของ Claude Code หรือ Codex ในเครื่องตอนสรุป
- selector ของหน้า Meet เก็บไว้ที่เดียวใน content script เวลา Google เปลี่ยนหน้าจะได้แก้จุดเดียว
- หนึ่ง PR หนึ่งเรื่อง commit message ใช้ [Conventional Commits](https://www.conventionalcommits.org) เช่น `fix: caption line split on speaker change`
- ถ้าการเปลี่ยนแปลงกระทบการออกแบบ ให้แก้ `docs/DESIGN.md` ใน PR เดียวกัน

## รายงานปัญหา

เปิด [issue](https://github.com/1amiearth/aftercall/issues) พร้อม

- เวอร์ชัน Chrome และระบบปฏิบัติการ
- ขั้นตอนที่ทำจนเจอปัญหา
- ข้อความ error จาก console (ถ้ามี)

ห้ามแนบวิดีโอหรือ transcript จริงใน issue

ช่องโหว่ด้านความปลอดภัยให้แจ้งผ่าน [Report a vulnerability](https://github.com/1amiearth/aftercall/security/advisories/new) ไม่เปิด issue สาธารณะ

## License

โค้ดที่ส่งเข้ามาจะอยู่ภายใต้ [MIT License](LICENSE) เดียวกับโปรเจกต์
