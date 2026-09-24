# Map: AfterCall MVP

Label: wayfinder:map

## Destination

Spec ของ MVP (`docs/DESIGN.md`) ไม่มีเรื่องไหนเหลือให้ตัดสินใจ เริ่มเขียนโค้ดได้ทันที v1 ผู้บันทึกใช้เองแบบ Load unpacked

## Notes

- คำศัพท์ตาม [CONTEXT.md](../../../CONTEXT.md) ทุกครั้ง
- การออกแบบหลักอยู่ที่ [docs/DESIGN.md](../../DESIGN.md) ข้อตัดสินใจที่ได้ต้องแก้กลับเข้า DESIGN.md ด้วย
- Ticket แบบ prototype ต้องลองกับ Chrome และห้อง Meet จริง ผู้บันทึกต้องร่วมลอง (Chrome ต้องการคนกดจริง)
- โค้ด prototype เป็นของทิ้ง เก็บใน branch `prototype/<ชื่อ>` ไม่ merge
- ใช้ skill `/grilling`, `/domain-modeling`, `/prototype`, `/research`
- ความเห็นประจำ: JavaScript ล้วน ไม่มี build, เลือกทางที่ง่ายที่สุดที่ใช้ได้

### ตัดสินใจแล้วตอนตั้งแผน (grilling รอบแรก 2026-09-24)

| เรื่อง | ตัดสินใจ |
|---|---|
| ผู้ใช้ v1 | ผู้บันทึกใช้เองก่อน แล้วค่อยเปิดสาธารณะ |
| ภาษาที่เขียน | JavaScript ล้วน ES modules + JSDoc ไม่มี build |
| ภาษา UI | ไทย + อังกฤษ ด้วย `chrome.i18n` |
| ภาษาสรุป | ตามภาษาหลักของการประชุม |
| เวลาสรุป | อัตโนมัติหลังจบการบันทึก |
| การบันทึกล่าสุด | จำเฉพาะอันล่าสุด ใน `chrome.storage.local` อยู่รอดหลังปิด Chrome |
| การแจ้งในแชท | ไทย + อังกฤษในข้อความเดียว |
| ไมค์ | เปิดเป็นค่าเริ่มต้น จำค่าล่าสุด |
| ยังไม่เปิด CC | บันทึกต่อได้ + คำเตือนค้างใน Side Panel |
| ไม่มี API key | บันทึกได้ ข้ามสรุป สรุปใหม่ทีหลังได้ |
| ทดสอบ | `node --test` เฉพาะ logic ล้วน + เช็กลิสต์มือ |
| Transcript | บรรทัดละช่วงพูด `[mm:ss] **ผู้พูด:** ข้อความ` |
| ผู้พูดที่เป็นผู้บันทึก | ชื่อจากหน้าตั้งค่า แทน "คุณ/You" |
| Start ซ้ำในห้องเดิม | การบันทึกใหม่ โฟลเดอร์ใหม่ |

## Decisions so far

<!-- หนึ่งบรรทัดต่อ ticket ที่ resolved -->

- [Research OpenRouter: structured outputs, data policy, errors](issues/03-research-openrouter.md) — json_schema + `data_collection: "deny"` ใช้ได้กับ gemini-3.8-flash, 200 ก็มี error ได้ต้องเช็ก body, CORS เปิด

## Not yet specified

- **การเก็บวิดีโอระหว่างบันทึก**: ถ้าขนาดไฟล์จริงจาก [Prototype การอัดแท็บ Meet](issues/01-prototype-recording.md) ใหญ่จนหน่วยความจำ Offscreen รับไม่ไหวในประชุม 2 ชม. อาจต้องเขียน chunk ลง OPFS ระหว่างบันทึก
- **พรอมต์และ schema สรุปฉบับจริง**: จะชัดหลังได้ transcript จริง
- **`data_collection: "deny"` หรือ `zdr: true`**: zdr เข้มกว่าแต่อาจเหลือผู้ให้บริการน้อยกว่า ตัดสินใจพร้อม [Prototype คุณภาพสรุปภาษาไทย](issues/04-prototype-summary-quality.md)

## Out of scope

- ขึ้น Chrome Web Store, privacy policy, listing: v1 ใช้เอง
- หน้าประวัติการบันทึกย้อนหลัง: จำแค่การบันทึกล่าสุด
- E2E test อัตโนมัติ: Meet ต้อง login และมีห้องจริง
- ให้ส่วนขยายกดเปิด CC เอง: เปราะเมื่อ Meet เปลี่ยนหน้า และตั้งภาษาผิดได้
- โหมดอัดจอที่แชร์โดยตรง: ระยะหลัง
