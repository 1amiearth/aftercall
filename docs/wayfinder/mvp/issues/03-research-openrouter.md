# Research OpenRouter: structured outputs, data policy, errors

Type: research
Status: resolved
Blocked by: -

## Question

ข้อเท็จจริงของ OpenRouter ที่ DESIGN.md ตั้งสมมติฐานไว้ถูกไหม

1. รูปแบบ `response_format: json_schema` ที่ถูกต้อง และ `google/gemini-3.8-flash` รองรับจริงไหม มีข้อจำกัดของ schema อะไรบ้าง
2. `provider: { data_collection: "deny" }` ใช้ได้จริงไหม ถ้าไม่มีผู้ให้บริการที่เข้าเงื่อนไขจะเกิดอะไร
3. status code และหน้าตา error ที่ต้องรับมือ รวมถึงกรณีได้ 200 แต่คำตอบว่างหรือถูกตัด
4. เรียกตรงจาก extension ได้ไหม (CORS) header ที่แนะนำ
5. field ของรายชื่อโมเดลที่ใช้ทำ dropdown และการกรองรุ่นที่ไม่ใช่ข้อความ หรือรุ่น `:batch`

ผลลัพธ์: `docs/research/openrouter.md` บน branch `research/openrouter`

## Comments

## Answer

สมมติฐานใน DESIGN.md ถูกเกือบทั้งหมด รายละเอียดและแหล่งอ้างอิงอยู่ที่ `docs/research/openrouter.md` บน branch `research/openrouter` (commit `6d881c9`)

- `response_format: json_schema` ใช้ได้ `google/gemini-3.8-flash` มี `structured_outputs` จริง Gemini รับ schema แค่บางส่วน ให้ schema ตื้นและเล็ก
- `provider: { data_collection: "deny" }` ถูกต้อง มี `provider: { zdr: true }` ที่เข้มกว่า (ไม่เก็บเลย) ถ้าไม่มีผู้ให้บริการเข้าเงื่อนไข คาดว่าได้ 503 (ยังไม่ยืนยัน)
- error มาในรูป `{ error: { code, message, metadata? } }` และ **200 ก็มี error ได้** ต้องเช็ก `body.error` กับ `finish_reason === "length"` ทุกครั้ง
- CORS เปิด `*` เรียกตรงจากส่วนขยายได้ header ชื่อแอปตอนนี้คือ `X-OpenRouter-Title` (`X-Title` ยังใช้ได้)
- กรองรายชื่อโมเดลที่ฝั่งเรา ด้วย `architecture.output_modalities` และ `supported_parameters` suffix ที่เจอคือ `:free` และ `:batch`

แก้ DESIGN.md ตามนี้แล้ว: header, CORS, การกรอง dropdown, ตาราง error (503, 200 ที่มี error)
